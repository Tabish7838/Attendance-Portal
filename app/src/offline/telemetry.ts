export type SyncTelemetryEvent =
  | { type: "sync_start"; queued: number; at: string }
  | { type: "sync_end"; queued: number; applied: number; rejected: number; at: string }
  | { type: "sync_error"; queued: number; message: string; at: string };

type Listener = (event: SyncTelemetryEvent) => void;

const listeners = new Set<Listener>();

export function onSyncTelemetry(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitSyncTelemetry(event: SyncTelemetryEvent) {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (_) {
      // ignore listener failure
    }
  });
}
