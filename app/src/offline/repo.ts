import { getDb } from "./db";
import type { AttendanceLocal, StudentLocal, SyncEntity, SyncOpType, SyncQueueRow } from "./types";

function nowIso() {
  return new Date().toISOString();
}

export async function updateQueuedAttendanceStudentId(params: {
  teacherId: string;
  studentLocalId: number;
  studentServerId: number;
}): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: number; payload: string }>(
    "SELECT id, payload FROM sync_queue WHERE table_name = 'attendance'",
    []
  );

  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload);
      if (payload?.student_local_id === params.studentLocalId && !payload?.student_id) {
        payload.student_id = params.studentServerId;
        payload.student_server_id = params.studentServerId;
        await db.runAsync("UPDATE sync_queue SET payload = ? WHERE id = ?", [
          JSON.stringify(payload),
          row.id,
        ]);
      }
    } catch (_) {
      /* ignore */
    }
  }
}

export async function listStudentsLocal(teacherId: string): Promise<StudentLocal[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<StudentLocal>(
    "SELECT * FROM students_local WHERE teacher_id = ? AND is_deleted = 0 ORDER BY roll_no ASC",
    [teacherId]
  );
  return rows;
}

export async function hydrateStudentsFromServer(params: {
  teacherId: string;
  students: Array<{ id: number; roll_no: number; name: string }>;
}): Promise<void> {
  const db = await getDb();
  const ts = nowIso();

  for (const s of params.students) {
    const existing = await db.getFirstAsync<StudentLocal>(
      "SELECT * FROM students_local WHERE teacher_id = ? AND (server_id = ? OR roll_no = ?)",
      [params.teacherId, s.id, s.roll_no]
    );

    if (existing) {
      await db.runAsync(
        "UPDATE students_local SET server_id = ?, roll_no = ?, name = ?, is_deleted = 0, updated_at = ? WHERE local_id = ?",
        [s.id, s.roll_no, s.name, ts, existing.local_id]
      );
    } else {
      await db.runAsync(
        "INSERT INTO students_local (server_id, teacher_id, roll_no, name, is_deleted, created_at, updated_at, client_updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)",
        [s.id, params.teacherId, s.roll_no, s.name, ts, ts, ts]
      );
    }
  }
}

export async function attachServerIdToAttendance(params: {
  teacherId: string;
  localId: number;
  serverId: number;
  serverUpdatedAt: string;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE attendance_local SET server_id = ?, updated_at = ? WHERE teacher_id = ? AND local_id = ?",
    [params.serverId, params.serverUpdatedAt, params.teacherId, params.localId]
  );
}

export async function getStudentLocalByRollNo(params: {
  teacherId: string;
  rollNo: number;
}): Promise<StudentLocal | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<StudentLocal>(
    "SELECT * FROM students_local WHERE teacher_id = ? AND roll_no = ?",
    [params.teacherId, params.rollNo]
  );
  return row ?? null;
}

export async function getStudentLocalByLocalId(params: {
  teacherId: string;
  localId: number;
}): Promise<StudentLocal | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<StudentLocal>(
    "SELECT * FROM students_local WHERE teacher_id = ? AND local_id = ?",
    [params.teacherId, params.localId]
  );
  return row ?? null;
}

export async function getStudentLocalByServerId(params: {
  teacherId: string;
  serverId: number;
}): Promise<StudentLocal | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<StudentLocal>(
    "SELECT * FROM students_local WHERE teacher_id = ? AND server_id = ?",
    [params.teacherId, params.serverId]
  );
  return row ?? null;
}

export async function upsertStudentLocal(params: {
  teacherId: string;
  localId?: number;
  serverId?: number | null;
  rollNo: number;
  name: string;
  clientUpdatedAt: string;
}): Promise<StudentLocal> {
  const db = await getDb();
  const createdAt = nowIso();
  const updatedAt = createdAt;

  if (params.localId) {
    await db.runAsync(
      "UPDATE students_local SET server_id = COALESCE(?, server_id), roll_no = ?, name = ?, is_deleted = 0, updated_at = ?, client_updated_at = ? WHERE local_id = ? AND teacher_id = ?",
      [
        params.serverId ?? null,
        params.rollNo,
        params.name,
        updatedAt,
        params.clientUpdatedAt,
        params.localId,
        params.teacherId,
      ]
    );

    const row = await db.getFirstAsync<StudentLocal>(
      "SELECT * FROM students_local WHERE local_id = ? AND teacher_id = ?",
      [params.localId, params.teacherId]
    );

    if (!row) {
      throw new Error("Failed to update local student");
    }

    return row;
  }

  const result = await db.runAsync(
    "INSERT INTO students_local (server_id, teacher_id, roll_no, name, is_deleted, created_at, updated_at, client_updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)",
    [params.serverId ?? null, params.teacherId, params.rollNo, params.name, createdAt, updatedAt, params.clientUpdatedAt]
  );

  const localId = Number(result.lastInsertRowId);
  const row = await db.getFirstAsync<StudentLocal>(
    "SELECT * FROM students_local WHERE local_id = ? AND teacher_id = ?",
    [localId, params.teacherId]
  );
  if (!row) {
    throw new Error("Failed to create local student");
  }
  return row;
}

export async function softDeleteStudentLocal(params: {
  teacherId: string;
  localId: number;
  clientUpdatedAt: string;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE students_local SET is_deleted = 1, updated_at = ?, client_updated_at = ? WHERE local_id = ? AND teacher_id = ?",
    [nowIso(), params.clientUpdatedAt, params.localId, params.teacherId]
  );
}

export async function getAttendanceForDateLocal(params: {
  teacherId: string;
  isoDate: string;
}): Promise<AttendanceLocal[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<AttendanceLocal>(
    "SELECT * FROM attendance_local WHERE teacher_id = ? AND date = ? AND is_deleted = 0",
    [params.teacherId, params.isoDate]
  );
  return rows;
}

export async function hydrateAttendanceFromServer(params: {
  teacherId: string;
  isoDate: string;
  records: Array<{ student_id: number; status: "Present" | "Absent" }>;
}): Promise<void> {
  const db = await getDb();
  const ts = nowIso();

  for (const record of params.records) {
    const student = await db.getFirstAsync<{ local_id: number }>(
      "SELECT local_id FROM students_local WHERE teacher_id = ? AND server_id = ? AND is_deleted = 0",
      [params.teacherId, record.student_id]
    );
    if (!student?.local_id) continue;

    const existing = await db.getFirstAsync<AttendanceLocal>(
      "SELECT * FROM attendance_local WHERE teacher_id = ? AND student_local_id = ? AND date = ?",
      [params.teacherId, student.local_id, params.isoDate]
    );

    if (existing) {
      await db.runAsync(
        "UPDATE attendance_local SET student_server_id = ?, status = ?, is_deleted = 0, updated_at = ? WHERE local_id = ?",
        [record.student_id, record.status, ts, existing.local_id]
      );
    } else {
      await db.runAsync(
        "INSERT INTO attendance_local (server_id, teacher_id, student_local_id, student_server_id, date, status, is_deleted, created_at, updated_at, client_updated_at) VALUES (NULL, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
        [
          params.teacherId,
          student.local_id,
          record.student_id,
          params.isoDate,
          record.status,
          ts,
          ts,
          ts,
        ]
      );
    }
  }
}

export async function upsertAttendanceLocal(params: {
  teacherId: string;
  isoDate: string;
  status: "Present" | "Absent";
  studentLocalId: number;
  studentServerId: number | null;
  clientUpdatedAt: string;
}): Promise<AttendanceLocal> {
  const db = await getDb();
  const existing = await db.getFirstAsync<AttendanceLocal>(
    "SELECT * FROM attendance_local WHERE teacher_id = ? AND student_local_id = ? AND date = ?",
    [params.teacherId, params.studentLocalId, params.isoDate]
  );

  const ts = nowIso();

  if (existing) {
    await db.runAsync(
      "UPDATE attendance_local SET student_server_id = COALESCE(?, student_server_id), status = ?, is_deleted = 0, updated_at = ?, client_updated_at = ? WHERE local_id = ?",
      [params.studentServerId, params.status, ts, params.clientUpdatedAt, existing.local_id]
    );

    const row = await db.getFirstAsync<AttendanceLocal>(
      "SELECT * FROM attendance_local WHERE local_id = ?",
      [existing.local_id]
    );
    if (!row) throw new Error("Failed to update local attendance");
    return row;
  }

  const result = await db.runAsync(
    "INSERT INTO attendance_local (server_id, teacher_id, student_local_id, student_server_id, date, status, is_deleted, created_at, updated_at, client_updated_at) VALUES (NULL, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
    [params.teacherId, params.studentLocalId, params.studentServerId, params.isoDate, params.status, ts, ts, params.clientUpdatedAt]
  );

  const localId = Number(result.lastInsertRowId);
  const row = await db.getFirstAsync<AttendanceLocal>(
    "SELECT * FROM attendance_local WHERE local_id = ?",
    [localId]
  );
  if (!row) throw new Error("Failed to create local attendance");
  return row;
}

export async function softDeleteAttendanceLocal(params: {
  teacherId: string;
  isoDate: string;
  studentLocalId: number;
  clientUpdatedAt: string;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE attendance_local SET is_deleted = 1, updated_at = ?, client_updated_at = ? WHERE teacher_id = ? AND student_local_id = ? AND date = ?",
    [nowIso(), params.clientUpdatedAt, params.teacherId, params.studentLocalId, params.isoDate]
  );
}

export async function enqueueOp(params: {
  entity: SyncEntity;
  recordId: string;
  opType: SyncOpType;
  payload: unknown;
  clientUpdatedAt: string;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO sync_queue (table_name, record_id, op_type, payload, client_updated_at, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?, 0)",
    [params.entity, params.recordId, params.opType, JSON.stringify(params.payload), params.clientUpdatedAt, nowIso()]
  );
}

export async function getQueueBatch(limit: number): Promise<SyncQueueRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SyncQueueRow>(
    "SELECT * FROM sync_queue ORDER BY id ASC LIMIT ?",
    [limit]
  );
  return rows;
}

export async function deleteQueueRows(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  await db.runAsync(`DELETE FROM sync_queue WHERE id IN (${placeholders})`, ids);
}

export async function incrementQueueAttempts(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE sync_queue SET attempts = attempts + 1 WHERE id = ?", [id]);
}

export async function attachServerIdToStudent(params: {
  teacherId: string;
  rollNo: number;
  serverId: number;
  serverUpdatedAt: string;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE students_local SET server_id = ?, updated_at = ? WHERE teacher_id = ? AND roll_no = ?",
    [params.serverId, params.serverUpdatedAt, params.teacherId, params.rollNo]
  );

  const studentRow = await db.getFirstAsync<{ local_id: number }>(
    "SELECT local_id FROM students_local WHERE teacher_id = ? AND roll_no = ?",
    [params.teacherId, params.rollNo]
  );

  if (studentRow?.local_id) {
    await db.runAsync(
      "UPDATE attendance_local SET student_server_id = ? WHERE teacher_id = ? AND student_local_id = ?",
      [params.serverId, params.teacherId, studentRow.local_id]
    );
    await updateQueuedAttendanceStudentId({
      teacherId: params.teacherId,
      studentLocalId: studentRow.local_id,
      studentServerId: params.serverId,
    });
  }
}
