import { memo, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { formatDateForDisplay, useAttendance } from "../context/AttendanceContext";

const AttendanceStatsCard: React.FC = () => {
  const { selectedDate, setSelectedDate, counts } = useAttendance();
  const [showPicker, setShowPicker] = useState(false);

  const displayDate = useMemo(() => formatDateForDisplay(selectedDate), [selectedDate]);

  const handleChange = (_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== "ios") {
      setShowPicker(false);
    }
    if (date) {
      setSelectedDate(date);
    }
  };

  const attendancePercentage = useMemo(() => {
    if (counts.total === 0) return 0;
    return Math.round((counts.present / counts.total) * 100);
  }, [counts.present, counts.total]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Attendance date</Text>
        <Pressable style={styles.dateButton} onPress={() => setShowPicker(true)}>
          <Text style={styles.dateText}>{displayDate}</Text>
          <Text style={styles.changeText}>Change</Text>
        </Pressable>
      </View>
      {showPicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={handleChange}
          maximumDate={new Date()}
        />
      )}
      <View style={styles.cardsGrid}>
        <DashboardCard
          title="Total students"
          value={counts.total}
          footerText=""
          containerStyle={styles.totalCard}
          valueStyle={styles.totalValue}
        />
        <DashboardCard
          title="Present today"
          value={counts.present}
          footerText={`${attendancePercentage}% attendance`}
          containerStyle={styles.presentCard}
          valueStyle={styles.presentValue}
        />
        <DashboardCard
          title="Absent today"
          value={counts.absent}
          footerText={`${counts.unmarked} unmarked`}
          containerStyle={styles.absentCard}
          valueStyle={styles.absentValue}
        />
        <DashboardCard
          title="Unmarked"
          value={counts.unmarked}
          footerText=""
          containerStyle={styles.unmarkedCard}
          valueStyle={styles.unmarkedValue}
        />
      </View>
    </View>
  );
};

type DashboardCardProps = {
  title: string;
  value: number;
  footerText: string;
  containerStyle: object;
  valueStyle: object;
};

const DashboardCard = memo(
  ({ title, value, footerText, containerStyle, valueStyle }: DashboardCardProps) => (
    <View style={[styles.dashboardCard, containerStyle]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={[styles.cardValue, valueStyle]}>{value}</Text>
      {footerText ? <Text style={styles.cardFooter}>{footerText}</Text> : null}
    </View>
  )
);

export default memo(AttendanceStatsCard);

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 4,
    marginBottom: 24,
  },
  headerRow: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  dateText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0f172a",
  },
  changeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563eb",
  },
  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  dashboardCard: {
    borderRadius: 18,
    padding: 16,
    minHeight: 116,
    justifyContent: "space-between",
  },
  totalCard: {
    flexBasis: "48%",
    backgroundColor: "#dbeafe",
    borderColor: "#bfdbfe",
    borderWidth: 1,
  },
  presentCard: {
    flexBasis: "48%",
    backgroundColor: "#d1fae5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
  },
  absentCard: {
    flexBasis: "48%",
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
    borderWidth: 1,
  },
  unmarkedCard: {
    flexBasis: "48%",
    backgroundColor: "#fef3c7",
    borderColor: "#fde68a",
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#64748b",
  },
  cardValue: {
    fontSize: 28,
    fontWeight: "800",
    marginTop: 6,
  },
  totalValue: {
    color: "#0f172a",
  },
  presentValue: {
    color: "#16a34a",
  },
  absentValue: {
    color: "#dc2626",
  },
  unmarkedValue: {
    color: "#b45309",
  },
  cardFooter: {
    fontSize: 13,
    color: "#475569",
    marginTop: 8,
  },
});
