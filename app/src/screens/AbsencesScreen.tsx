import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { formatDateForDisplay, useAttendance } from "../context/AttendanceContext";
import SyncStatusIndicator from "../components/SyncStatusIndicator";
import { AppShell, Card } from "../components/ui";
import { theme } from "../theme";

const AbsencesScreen: React.FC = () => {
  const { selectedDate, setSelectedDate, students, records, loading, error } = useAttendance();
  const [showDatePicker, setShowDatePicker] = useState(false);

  const displayDate = useMemo(() => formatDateForDisplay(selectedDate), [selectedDate]);

  const absentStudents = useMemo(
    () => students.filter((student) => records[student.id] === "Absent"),
    [students, records]
  );

  const handleDatePickerChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== "ios") {
      setShowDatePicker(false);
    }
    if (date) {
      setSelectedDate(date);
    }
  };

  const hasStudents = students.length > 0;

  return (
    <AppShell>
      <SyncStatusIndicator />

      <Text style={styles.title}>Absence summary</Text>
      <Text style={styles.subtitle}>Insights for {displayDate}</Text>

      <Card style={styles.cardSpacing}>
        <Text style={styles.sectionLabel}>Attendance date</Text>
        <Pressable
          style={({ pressed }) => [styles.dateButton, pressed && styles.pressedRow]}
          onPress={() => setShowDatePicker(true)}
          accessibilityRole="button"
          accessibilityLabel={`Change attendance date. Current date ${displayDate}`}
        >
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
      </Card>

      {loading ? (
        <View style={styles.loaderRow}>
          <ActivityIndicator size="large" color={theme.colors.text} />
        </View>
      ) : (
        <Card>
          <View style={styles.listHeaderRow}>
            <View>
              <Text style={styles.badge}>Absent summary</Text>
              <Text style={styles.cardTitle}>Students marked absent</Text>
            </View>
            <View style={styles.counterPill}>
              <Text style={styles.counterText}>{absentStudents.length}</Text>
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {!hasStudents ? (
            <Text style={styles.emptyState}>
              No students found. Add students to start tracking attendance.
            </Text>
          ) : absentStudents.length === 0 ? (
            <Text style={styles.emptyState}>No absent students — your class is fully present!</Text>
          ) : (
            <FlatList
              data={absentStudents}
              keyExtractor={(item) => String(item.id)}
              scrollEnabled={false}
              initialNumToRender={24}
              maxToRenderPerBatch={24}
              updateCellsBatchingPeriod={50}
              windowSize={5}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <View style={styles.studentRow}>
                  <View style={styles.rollPill}>
                    <Text style={styles.rollText}>{item.roll_no}</Text>
                  </View>
                  <View style={styles.studentMeta}>
                    <Text style={styles.studentName}>{item.name}</Text>
                    <Text style={styles.studentStatus}>Absent</Text>
                  </View>
                </View>
              )}
            />
          )}
        </Card>
      )}
    </AppShell>
  );
};

export default AbsencesScreen;

const styles = StyleSheet.create({
  pressedRow: {
    opacity: 0.8,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: theme.colors.text2,
    marginBottom: theme.spacing.lg,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.muted,
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
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
  },
  changeDate: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
  cardSpacing: {
    marginBottom: theme.spacing.lg,
  },
  loaderRow: {
    paddingVertical: 60,
    alignItems: "center",
  },
  listHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
  },
  counterPill: {
    height: 34,
    minWidth: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  counterText: {
    color: theme.colors.text,
    fontWeight: "800",
    fontSize: 14,
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
  emptyState: {
    fontSize: 15,
    color: theme.colors.text2,
    paddingVertical: 18,
  },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  rollPill: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  rollText: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.text,
  },
  studentMeta: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 4,
  },
  studentStatus: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.danger,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.divider,
  },
});
