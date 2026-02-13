import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { onSyncTelemetry, type SyncTelemetryEvent } from "../offline/telemetry";
import { theme } from "../theme";

type Status = {
  state: "idle" | "syncing" | "error";
  lastAt: string | null;
  message: string | null;
};

const SyncStatusIndicator: React.FC = () => {
  const [status, setStatus] = useState<Status>({ state: "idle", lastAt: null, message: null });

  useEffect(() => {
    return onSyncTelemetry((event: SyncTelemetryEvent) => {
      if (event.type === "sync_start") {
        setStatus({ state: "syncing", lastAt: event.at, message: `Syncing (${event.queued})` });
        return;
      }

      if (event.type === "sync_end") {
        setStatus({
          state: "idle",
          lastAt: event.at,
          message: event.queued === 0 ? "Up to date" : `Synced: ${event.applied} ok, ${event.rejected} rejected`,
        });
        return;
      }

      setStatus({ state: "error", lastAt: event.at, message: event.message });
    });
  }, []);

  const pillStyle = useMemo(() => {
    if (status.state === "syncing") return [styles.pill, styles.pillSyncing];
    if (status.state === "error") return [styles.pill, styles.pillError];
    return [styles.pill, styles.pillOk];
  }, [status.state]);

  if (!status.message) return null;

  return (
    <View style={pillStyle}>
      <Text style={styles.text}>{status.message}</Text>
    </View>
  );
};

export default SyncStatusIndicator;

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pillOk: {
    backgroundColor: theme.colors.surface,
  },
  pillSyncing: {
    backgroundColor: theme.colors.surface,
  },
  pillError: {
    backgroundColor: theme.colors.surface,
  },
  text: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.text,
  },
});
