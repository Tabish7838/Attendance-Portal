import NetInfo from "@react-native-community/netinfo";

import { buildApiUrl } from "../env";
import {
  attachServerIdToStudent,
  attachServerIdToAttendance,
  deleteQueueRows,
  getQueueBatch,
  incrementQueueAttempts,
} from "./repo";
import { emitSyncTelemetry } from "./telemetry";

type SyncResult = {
  applied: Array<any>;
  rejected: Array<any>;
  server_time: string;
};

let syncInFlight: Promise<void> | null = null;

const nextAttemptByQueueId = new Map<number, number>();

function computeBackoffMs(attempts: number): number {
  const base = 1000;
  const max = 60_000;
  const exp = Math.min(6, Math.max(0, attempts));
  return Math.min(max, base * Math.pow(2, exp));
}

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !!state.isConnected;
}

function toSyncOperation(row: any) {
  const entity = row.table_name;
  const opType = row.op_type;
  const payload = JSON.parse(row.payload);
  const clientUpdatedAt = row.client_updated_at;

  return {
    op_id: `q:${row.id}:${row.record_id}`,
    entity,
    action: opType,
    client_updated_at: clientUpdatedAt,
    data: payload,
  };
}

export async function syncNow(params: { accessToken: string; teacherId: string }): Promise<void> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const online = await isOnline();
    if (!online) return;

    const batchAll = await getQueueBatch(50);
    if (batchAll.length === 0) {
      emitSyncTelemetry({ type: "sync_end", queued: 0, applied: 0, rejected: 0, at: new Date().toISOString() });
      return;
    }

    const now = Date.now();
    const batch = batchAll.filter((row) => {
      const next = nextAttemptByQueueId.get(row.id);
      return !next || next <= now;
    });

    emitSyncTelemetry({ type: "sync_start", queued: batch.length, at: new Date().toISOString() });

    if (batch.length === 0) {
      return;
    }

    const studentOps = batch.filter((r) => r.table_name === "student");
    const attendanceOps = batch.filter((r) => r.table_name === "attendance");

    const operations = [...studentOps, ...attendanceOps].map(toSyncOperation);

    const response = await fetch(buildApiUrl("/sync"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify({ operations }),
    });

    if (!response.ok) {
      await Promise.all(
        batch.map(async (row) => {
          await incrementQueueAttempts(row.id);
          const backoff = computeBackoffMs(row.attempts + 1);
          nextAttemptByQueueId.set(row.id, Date.now() + backoff);
        })
      );
      emitSyncTelemetry({
        type: "sync_error",
        queued: batch.length,
        message: `Sync failed (${response.status})`,
        at: new Date().toISOString(),
      });
      return;
    }

    const result = (await response.json()) as SyncResult;

    const appliedIds = new Set<string>();

    for (const item of result.applied || []) {
      if (typeof item?.op_id === "string") {
        const m = item.op_id.match(/^q:(\d+):/);
        if (m) {
          appliedIds.add(m[1]);
        }
      }

      if (item?.entity === "student" && (item?.action === "create" || item?.action === "update")) {
        const opId: string = item?.op_id ?? "";
        const qid = opId.match(/^q:(\d+):/);
        const row = qid ? batch.find((b) => String(b.id) === qid[1]) : null;
        if (row) {
          try {
            const payload = JSON.parse(row.payload);
            if (payload?.roll_no && item?.id) {
              await attachServerIdToStudent({
                teacherId: params.teacherId,
                rollNo: Number(payload.roll_no),
                serverId: Number(item.id),
                serverUpdatedAt: String(item.server_updated_at ?? result.server_time),
              });
            }
          } catch (_) {
            /* ignore */
          }
        }
      }

      if (item?.entity === "attendance" && (item?.action === "create" || item?.action === "update")) {
        const opId: string = item?.op_id ?? "";
        const qid = opId.match(/^q:(\d+):/);
        const row = qid ? batch.find((b) => String(b.id) === qid[1]) : null;
        if (row) {
          const localId = Number(row.record_id);
          if (Number.isFinite(localId) && item?.id) {
            await attachServerIdToAttendance({
              teacherId: params.teacherId,
              localId,
              serverId: Number(item.id),
              serverUpdatedAt: String(item.server_updated_at ?? result.server_time),
            });
          }
        }
      }
    }

    const deleteIds = batch
      .filter((row) => appliedIds.has(String(row.id)))
      .map((row) => row.id);

    await deleteQueueRows(deleteIds);

    deleteIds.forEach((id) => {
      nextAttemptByQueueId.delete(id);
    });

    emitSyncTelemetry({
      type: "sync_end",
      queued: batch.length,
      applied: Array.isArray(result.applied) ? result.applied.length : 0,
      rejected: Array.isArray(result.rejected) ? result.rejected.length : 0,
      at: new Date().toISOString(),
    });
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
}
