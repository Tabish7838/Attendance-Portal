import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AttendanceStats from "../components/AttendanceStats";
import SyncStatusIndicator from "../components/SyncStatusIndicator";
import { useAuth } from "../context/AuthContext";
import { useAttendance } from "../context/AttendanceContext";
import { buildApiUrl } from "../env";

const HomeScreen: React.FC = () => {
  const { user, signOut } = useAuth();
  const { students, records, loading: attendanceLoading, error, refresh } = useAttendance();

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

  const renderRosterRow = useCallback(
    ({ item }: { item: typeof students[number] }) => {
      const status = records[item.id];
      return (
        <View style={styles.rosterRow}>
          <View style={styles.studentCircle}>
            <Text style={styles.studentInitial}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.studentMeta}>
            <Text style={styles.studentName}>{item.name}</Text>
            <Text style={styles.studentRoll}>Roll {item.roll_no}</Text>
          </View>
          <View
            style={[
              styles.statusPill,
              status === "Present"
                ? styles.presentPill
                : status === "Absent"
                ? styles.absentPill
                : styles.unmarkedPill,
            ]}
          >
            <Text style={styles.statusPillText}>
              {status === "Present" ? "Present" : status === "Absent" ? "Absent" : "Unmarked"}
            </Text>
          </View>
        </View>
      );
    },
    [records, students]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.dashboardTitle}>ATTENDANCE DASHBOARD</Text>

      <SyncStatusIndicator />

      <AttendanceStats />

      <View style={styles.dashboardCard}>
        <Text style={styles.sectionLabel}>Logged in as</Text>
        <View style={styles.loggedInBox}>
          <Text style={styles.loggedInName}>{displayName}</Text>
          <Text style={styles.loggedInEmail}>{user?.email ?? ""}</Text>
        </View>

        <Pressable style={styles.secondaryButton} onPress={handleExport}>
          <Text style={styles.secondaryButtonText}>Export full history</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={signOut}
        >
          <Text style={styles.secondaryButtonText}>Logout</Text>
        </Pressable>
      </View>

      <View style={[styles.dashboardCard, styles.rosterCard]}>
        <Text style={styles.rosterTitle}>ROSTER STATUS</Text>

        {error ? <Text style={styles.rosterErrorText}>{error}</Text> : null}

        {attendanceLoading ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator size="large" color="#1d4ed8" />
          </View>
        ) : students.length === 0 ? (
          <Text style={styles.emptyState}>No students available yet. Add students in the roster tab.</Text>
        ) : (
          <FlatList
            data={students}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderRosterRow}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </View>
    </ScrollView>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 120,
  },
  dashboardTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#1e293b",
    marginBottom: 16,
  },
  dashboardCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 4,
  },
  rosterCard: {
    marginTop: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#94a3b8",
    marginBottom: 10,
  },
  loggedInBox: {
    backgroundColor: "#e2e8f0",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  loggedInName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  loggedInEmail: {
    fontSize: 14,
    color: "#475569",
  },
  secondaryButton: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    backgroundColor: "#ffffff",
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2563eb",
  },
  rosterTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  loaderRow: {
    paddingVertical: 40,
    alignItems: "center",
  },
  rosterErrorText: {
    fontSize: 14,
    color: "#dc2626",
    marginBottom: 10,
  },
  emptyState: {
    fontSize: 15,
    color: "#475569",
    marginTop: 8,
  },
  rosterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  studentCircle: {
    height: 46,
    width: 46,
    borderRadius: 23,
    backgroundColor: "#2563eb15",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  studentInitial: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2563eb",
  },
  studentMeta: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
  },
  studentRoll: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0f172a",
  },
  presentPill: {
    backgroundColor: "#bbf7d0",
  },
  absentPill: {
    backgroundColor: "#fecaca",
  },
  unmarkedPill: {
    backgroundColor: "#e2e8f0",
  },
  separator: {
    height: 1,
    backgroundColor: "#e2e8f0",
  },
});
