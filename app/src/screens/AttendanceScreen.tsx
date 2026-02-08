import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";

import {
  AttendanceStatus,
  formatDateForDisplay,
  useAttendance,
} from "../context/AttendanceContext";

const AttendanceScreen: React.FC = () => {
  const {
    selectedDate,
    setSelectedDate,
    students,
    records,
    replaceRecords,
    loading,
    error: loadError,
    overallStatus,
    markStudent,
    saveAttendance,
    refresh,
  } = useAttendance();

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [draftRecords, setDraftRecords] = useState<Record<number, AttendanceStatus>>({});
  const [savingRoster, setSavingRoster] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterFeedback, setRosterFeedback] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const displayDate = useMemo(() => formatDateForDisplay(selectedDate), [selectedDate]);
  const totalStudents = students.length;
  const currentStudent = students[activeIndex] || students[0];
  const displayError = loadError ?? saveError;

  const isAttendanceComplete = useMemo(() => {
    if (students.length === 0) return false;
    return students.every((student) => !!records[student.id]);
  }, [students, records]);

  useEffect(() => {
    if (students.length === 0) {
      setActiveIndex(0);
      return;
    }

    if (isAttendanceComplete) {
      return;
    }

    if (records[students[activeIndex]?.id]) {
      const nextIndex = students.findIndex((student) => !records[student.id]);
      setActiveIndex(nextIndex === -1 ? 0 : nextIndex);
    }
  }, [students, records, activeIndex, isAttendanceComplete]);

  useEffect(() => {
    setFeedback(null);
    setSaveError(null);
  }, [selectedDate]);

  useEffect(() => {
    setDraftRecords(records);
    setRosterError(null);
    setRosterFeedback(null);
  }, [records]);

  const isDirty = useMemo(() => {
    const keys = new Set([...Object.keys(records), ...Object.keys(draftRecords)]);
    for (const key of keys) {
      const id = Number(key);
      if (records[id] !== draftRecords[id]) return true;
    }
    return false;
  }, [records, draftRecords]);

  const cycleStatus = (status: AttendanceStatus | undefined): AttendanceStatus | undefined => {
    if (!status) return "Present";
    if (status === "Present") return "Absent";
    return undefined;
  };

  const handleToggleStudent = (studentId: number) => {
    setDraftRecords((prev) => {
      const next = { ...prev };
      const current = next[studentId];
      const cycled = cycleStatus(current);
      if (!cycled) {
        delete next[studentId];
        return next;
      }
      next[studentId] = cycled;
      return next;
    });
    setRosterError(null);
    setRosterFeedback(null);
  };

  const handleSaveRoster = useCallback(async () => {
    setSavingRoster(true);
    setRosterError(null);
    setRosterFeedback(null);

    const result = await saveAttendance(draftRecords);
    if (result.success) {
      replaceRecords(draftRecords);
      setRosterFeedback("Roster status saved.");
    } else {
      setRosterError(result.error ?? "We couldn’t save roster status. Try again in a moment.");
    }

    setSavingRoster(false);
  }, [draftRecords, replaceRecords, saveAttendance]);

  const getNextUnmarkedIndex = useCallback(
    (nextRecords: Record<number, AttendanceStatus>, startIndex: number) => {
      if (students.length === 0) return 0;

      for (let offset = 1; offset <= students.length; offset += 1) {
        const candidate = (startIndex + offset) % students.length;
        const student = students[candidate];
        if (student && !nextRecords[student.id]) {
          return candidate;
        }
      }

      return startIndex;
    },
    [students]
  );

  const handleDatePickerChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== "ios") {
      setShowDatePicker(false);
    }
    if (date) {
      setSelectedDate(date);
    }
  };

  const handleMark = useCallback(
    (status: AttendanceStatus) => {
      const student = students[activeIndex];
      if (!student) return;

      const nextRecords = markStudent(student.id, status);
      const nextIndex = getNextUnmarkedIndex(nextRecords, activeIndex);
      setActiveIndex(nextIndex);
      setSaveError(null);

      const completed = students.length > 0 && students.every((s) => !!nextRecords[s.id]);
      if (completed) {
        setFeedback("Attendance completed. You can save it now.");
      } else {
        setFeedback(
          status === "Present"
            ? `${student.name} marked present.`
            : `${student.name} marked absent.`
        );
      }
    },
    [students, activeIndex, markStudent, getNextUnmarkedIndex]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setFeedback(null);

    const result = await saveAttendance();
    if (result.success) {
      setFeedback("Attendance saved successfully.");
    } else if (result.error) {
      setSaveError(result.error);
    } else {
      setSaveError("We couldn’t save attendance right now. Try again in a moment.");
    }

    setSaving(false);
  }, [saveAttendance]);

  const statusTitle = useMemo(() => {
    if (isAttendanceComplete) {
      return "Attendance completed";
    }

    switch (overallStatus) {
      case "checked-in":
        return "All students marked present";
      case "checked-out":
        return "All students marked absent";
      case "partial":
        return "Attendance partially marked";
      default:
        return "Attendance not saved";
    }
  }, [overallStatus, isAttendanceComplete]);

  const disableActions = loading || saving || totalStudents === 0;

  const renderRosterRow = ({ item }: { item: typeof students[number] }) => {
    const status = draftRecords[item.id];
    const pillStyle =
      status === "Present"
        ? styles.presentPill
        : status === "Absent"
        ? styles.absentPill
        : styles.unmarkedPill;

    const pillText = status ?? "Unmarked";

    return (
      <Pressable style={styles.studentRow} onPress={() => handleToggleStudent(item.id)}>
        <View style={styles.studentCircle}>
          <Text style={styles.studentInitial}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.studentMeta}>
          <Text style={styles.studentName}>{item.name}</Text>
          <Text style={styles.studentRoll}>Roll {item.roll_no}</Text>
        </View>
        <View style={[styles.statusPill, pillStyle]}>
          <Text style={styles.statusPillText}>{pillText}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerCard}>
        <Text style={styles.sectionLabel}>Attendance date</Text>
        <Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
          <Text style={styles.dateText}>{displayDate}</Text>
          <Text style={styles.changeDate}>Change</Text>
        </Pressable>
        {showDatePicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={handleDatePickerChange}
            maximumDate={new Date()}
          />
        )}
      </View>

      {loading ? (
        <View style={styles.loaderRow}>
          <ActivityIndicator size="large" color="#1d4ed8" />
        </View>
      ) : (
        <>
          <View style={styles.statusCard}>
            <Text style={styles.statusHeading}>{statusTitle}</Text>
            <Text style={styles.statusMessage}>
              {isAttendanceComplete
                ? "All students are marked for this date."
                : overallStatus === "idle"
                ? "Start marking students to track today’s attendance."
                : overallStatus === "checked-in"
                ? "Everyone is marked present — nice work!"
                : overallStatus === "checked-out"
                ? "Everyone is marked absent for this session."
                : "Continue marking students below to complete attendance."}
            </Text>
            {displayError ? <Text style={styles.errorText}>{displayError}</Text> : null}
            {feedback && !displayError ? <Text style={styles.feedbackText}>{feedback}</Text> : null}
          </View>

          <View style={styles.currentStudentCard}>
            <View style={styles.currentStudentHeader}>
              <Text style={styles.sectionLabel}>Taking attendance</Text>
              <Text style={styles.currentStudentName}>
                {currentStudent ? currentStudent.name : "No roster yet"}
              </Text>
              <Text style={styles.currentStudentMeta}>
                {currentStudent
                  ? `Roll number ${currentStudent.roll_no}`
                  : "Add students in the roster tab to begin."}
              </Text>
            </View>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Progress</Text>
              <Text style={styles.progressValue}>
                {totalStudents === 0
                  ? "No students yet"
                  : `Student ${Math.min(activeIndex + 1, totalStudents)} of ${totalStudents}`}
              </Text>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionButton, styles.presentButton, disableActions && styles.disabledButton]}
                onPress={() => handleMark("Present")}
                disabled={disableActions}
              >
                <Text style={styles.actionButtonText}>Mark present</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.absentButton, disableActions && styles.disabledButton]}
                onPress={() => handleMark("Absent")}
                disabled={disableActions}
              >
                <Text style={styles.actionButtonText}>Mark absent</Text>
              </Pressable>
            </View>
            <Pressable
              style={[styles.saveButton, (saving || disableActions) && styles.disabledButton]}
              onPress={handleSave}
              disabled={saving || disableActions}
            >
              {saving ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.saveButtonText}>Save today’s attendance</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.listCard}>
            <View style={styles.rosterHeaderRow}>
              <Text style={styles.sectionLabel}>Change Roster Status</Text>
              <Pressable
                style={[
                  styles.rosterSaveButton,
                  (!isDirty || savingRoster || loading) && styles.disabledButton,
                ]}
                onPress={handleSaveRoster}
                disabled={!isDirty || savingRoster || loading}
              >
                {savingRoster ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.rosterSaveButtonText}>Save</Text>
                )}
              </Pressable>
            </View>

            {rosterError ? <Text style={styles.errorText}>{rosterError}</Text> : null}
            {rosterFeedback && !rosterError ? (
              <Text style={styles.feedbackText}>{rosterFeedback}</Text>
            ) : null}

            {students.length === 0 ? (
              <Text style={styles.emptyState}>
                No students available yet. Add students in the roster tab to start marking
                attendance.
              </Text>
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
        </>
      )}
    </ScrollView>
  );
};

export default AttendanceScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 160,
  },
  headerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 4,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  dateText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
  },
  changeDate: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563eb",
  },
  loaderRow: {
    paddingVertical: 80,
    alignItems: "center",
  },
  statusCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  statusHeading: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
  },
  statusMessage: {
    fontSize: 15,
    color: "#475569",
    marginBottom: 10,
  },
  errorText: {
    fontSize: 14,
    color: "#dc2626",
    marginBottom: 6,
  },
  feedbackText: {
    fontSize: 14,
    color: "#0f766e",
  },
  currentStudentCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 18,
    elevation: 3,
  },
  currentStudentHeader: {
    marginBottom: 16,
  },
  currentStudentName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
  },
  currentStudentMeta: {
    fontSize: 15,
    color: "#475569",
    marginTop: 6,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  progressLabel: {
    fontSize: 14,
    color: "#475569",
  },
  progressValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  presentButton: {
    backgroundColor: "#22c55e",
  },
  absentButton: {
    backgroundColor: "#ef4444",
  },
  disabledButton: {
    opacity: 0.6,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  saveButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  listCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  rosterHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  rosterSaveButton: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },
  rosterSaveButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
  emptyState: {
    fontSize: 15,
    color: "#475569",
    marginTop: 8,
  },
  studentRow: {
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
