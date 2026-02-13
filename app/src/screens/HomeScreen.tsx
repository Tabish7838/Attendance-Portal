import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  Linking,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
} from "react-native";

import AttendanceStats from "../components/AttendanceStats";
import SyncStatusIndicator from "../components/SyncStatusIndicator";
import { AppShell, Card, Button } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useAttendance } from "../context/AttendanceContext";
import { useBranch } from "../context/BranchContext";
import { buildApiUrl } from "../env";
import { theme } from "../theme";

const HomeScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  const { refresh } = useAttendance();
  const {
    branches,
    selectedBranch,
    selectedBranchLocalId,
    setSelectedBranchLocalId,
    createBranch,
    loading: branchesLoading,
    error: branchesError,
  } = useBranch();

  const [newBranchName, setNewBranchName] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const displayName =
    (typeof user?.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
    (typeof user?.email === "string" ? user.email.split("@")[0] : "");

  const handleExport = async () => {
    const teacherId = user?.id;
    if (!teacherId) return;

    const url = buildApiUrl(`/export?teacher_id=${encodeURIComponent(teacherId)}`);
    await Linking.openURL(url);
  };

  const branchLabel = useMemo(() => {
    if (branchesLoading) return "Loading...";
    if (selectedBranch) return selectedBranch.name;
    if (branches.length === 0) return "Create a branch";
    return "Select a branch";
  }, [branchesLoading, branches.length, selectedBranch]);

  const handleCreateBranch = useCallback(async () => {
    if (creatingBranch) return;
    setCreatingBranch(true);
    setCreateError(null);

    const result = await createBranch(newBranchName);
    if (!result.success) {
      setCreateError(result.error ?? "Unable to create branch.");
    } else {
      setNewBranchName("");
    }

    setCreatingBranch(false);
  }, [createBranch, creatingBranch, newBranchName]);

  return (
    <AppShell>
      <Text style={styles.dashboardTitle}>ATTENDANCE DASHBOARD</Text>

      <SyncStatusIndicator />

      <Card style={styles.branchCard}>
        <Text style={styles.sectionLabel}>Branch</Text>
        <Pressable
          onPress={() => setBranchMenuOpen((prev) => !prev)}
          style={({ pressed }) => [styles.branchDropdown, pressed && styles.branchDropdownPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Change branch. Current branch ${branchLabel}`}
        >
          <Text style={styles.branchName}>{branchLabel}</Text>
          <Text style={styles.branchChevron}>{branchMenuOpen ? "▲" : "▼"}</Text>
        </Pressable>

        {branchesError ? <Text style={styles.errorText}>{branchesError}</Text> : null}

        {branchMenuOpen && branches.length > 0 ? (
          <View style={styles.branchMenu}>
            {branches.map((b) => {
              const active = b.local_id === selectedBranchLocalId;
              return (
                <Pressable
                  key={b.local_id}
                  onPress={async () => {
                    await setSelectedBranchLocalId(b.local_id);
                    setBranchMenuOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.branchMenuItem,
                    active && styles.branchMenuItemActive,
                    pressed && styles.branchMenuItemPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to branch ${b.name}`}
                >
                  <Text style={[styles.branchMenuItemText, active && styles.branchMenuItemTextActive]}>
                    {b.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {branches.length === 0 && !branchesLoading ? (
          <Text style={styles.branchEmptyState}>
            Create your first branch (class/section) to start adding students and taking attendance.
          </Text>
        ) : null}

        <View style={styles.newBranchRow}>
          <TextInput
            value={newBranchName}
            onChangeText={setNewBranchName}
            placeholder="New branch name"
            placeholderTextColor={theme.colors.muted}
            style={styles.branchInput}
            accessibilityLabel="New branch name"
          />
          <Button
            label="Add"
            onPress={handleCreateBranch}
            loading={creatingBranch}
            disabled={!newBranchName.trim()}
            style={styles.branchAddButton}
          />
        </View>
        {createError ? <Text style={styles.errorText}>{createError}</Text> : null}
      </Card>

      <AttendanceStats />

      <Card style={styles.dashboardCard}>
        <Text style={styles.sectionLabel}>Logged in as</Text>
        <View style={styles.loggedInBox}>
          <Text style={styles.loggedInName}>{displayName}</Text>
          <Text style={styles.loggedInEmail}>{user?.email ?? ""}</Text>
        </View>

        <Button label="Export full history" variant="secondary" onPress={handleExport} style={styles.actionButton} />
        <Button label="Logout" variant="secondary" onPress={signOut} style={styles.actionButton} />
      </Card>
    </AppShell>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  dashboardTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  branchCard: {
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  dashboardCard: {
    padding: theme.spacing.xl,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: theme.colors.muted,
    marginBottom: theme.spacing.sm,
  },
  branchName: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.text,
  },
  branchDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: theme.spacing.sm,
  },
  branchDropdownPressed: {
    opacity: 0.85,
  },
  branchChevron: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.colors.muted,
    marginLeft: 10,
  },
  branchMenu: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: theme.spacing.md,
  },
  branchMenuItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  branchMenuItemActive: {
    backgroundColor: theme.colors.surface2,
  },
  branchMenuItemPressed: {
    opacity: 0.85,
  },
  branchMenuItemText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text2,
  },
  branchMenuItemTextActive: {
    color: theme.colors.text,
  },
  branchEmptyState: {
    fontSize: 14,
    color: theme.colors.text2,
    marginBottom: theme.spacing.md,
  },
  newBranchRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  branchInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    fontSize: 15,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
  },
  branchAddButton: {
    height: 44,
    paddingHorizontal: 14,
    marginLeft: 10,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
  loggedInBox: {
    backgroundColor: theme.colors.surface2,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: theme.spacing.lg,
  },
  loggedInName: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 4,
  },
  loggedInEmail: {
    fontSize: 14,
    color: theme.colors.text2,
  },
  actionButton: {
    marginTop: theme.spacing.md,
  },
});
