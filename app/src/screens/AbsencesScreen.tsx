import { useMemo, useState } from "react";
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

import { formatDateForDisplay, useAttendance } from "../context/AttendanceContext";

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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Absence summary</Text>
      <Text style={styles.subtitle}>Insights for {displayDate}</Text>

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
          <ActivityIndicator size="large" color="#dc2626" />
        </View>
      ) : (
        <View style={styles.listCard}>
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
            <Text style={styles.emptyState}>
              No absent students — your class is fully present!
            </Text>
          ) : (
            <FlatList
              data={absentStudents}
              keyExtractor={(item) => String(item.id)}
              scrollEnabled={false}
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
        </View>
      )}
    </ScrollView>
  );
};

export default AbsencesScreen;

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
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: "#475569",
    marginBottom: 18,
  },
  headerCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 4,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#dc2626",
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
    color: "#0f172a",
  },
  changeDate: {
    fontSize: 14,
    fontWeight: "600",
    color: "#dc2626",
  },
  loaderRow: {
    paddingVertical: 60,
    alignItems: "center",
  },
  listCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 18,
    elevation: 3,
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
    backgroundColor: "#fee2e2",
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
  },
  counterPill: {
    height: 34,
    minWidth: 34,
    borderRadius: 17,
    backgroundColor: "#dc2626",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  counterText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
  },
  errorText: {
    fontSize: 14,
    color: "#dc2626",
    marginBottom: 12,
  },
  emptyState: {
    fontSize: 15,
    color: "#475569",
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
    backgroundColor: "#fee2e2",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  rollText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#dc2626",
  },
  studentMeta: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  studentStatus: {
    fontSize: 14,
    fontWeight: "600",
    color: "#dc2626",
  },
  separator: {
    height: 1,
    backgroundColor: "#e2e8f0",
  },
});
