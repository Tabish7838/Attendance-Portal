import { memo, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";

import { formatDateForDisplay, useAttendance } from "../context/AttendanceContext";
import { theme } from "../theme";

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
          footerText=""
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
      <View style={styles.valueContainer}>
        <Text style={[styles.cardValue, valueStyle]}>{value}</Text>
      </View>
      {footerText ? (
        <Text style={styles.cardFooter}>{footerText}</Text>
      ) : (
        <View style={styles.footerSpacer} />
      )}
    </View>
  )
);

export default memo(AttendanceStatsCard);

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
    shadowColor: theme.colors.text,
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 20,
    elevation: 4,
    marginBottom: theme.spacing.xl,
  },
  headerRow: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text2,
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
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
  },
  changeText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  dashboardCard: {
    borderRadius: 18,
    padding: theme.spacing.md,
    minHeight: 92,
    justifyContent: "flex-start",
    borderWidth: 1,
    borderColor: theme.colors.border,
    width: "48%",
    marginBottom: theme.spacing.sm,
  },
  totalCard: {
    backgroundColor: theme.colors.surface2,
  },
  presentCard: {
    backgroundColor: theme.colors.surface2,
  },
  absentCard: {
    backgroundColor: theme.colors.surface2,
  },
  unmarkedCard: {
    backgroundColor: theme.colors.surface2,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: theme.colors.muted,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: "800",
    marginTop: 6,
  },
  valueContainer: {
    flex: 1,
    justifyContent: "center",
  },
  totalValue: {
    color: theme.colors.text,
  },
  presentValue: {
    color: theme.colors.success,
  },
  absentValue: {
    color: theme.colors.danger,
  },
  unmarkedValue: {
    color: theme.colors.warning,
  },
  cardFooter: {
    fontSize: 12,
    color: theme.colors.text2,
    marginTop: theme.spacing.sm,
  },
  footerSpacer: {
    marginTop: theme.spacing.sm,
    height: 14,
  },
});
