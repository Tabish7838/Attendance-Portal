import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "./AuthContext";
import { buildApiUrl } from "../env";

export type AttendanceStatus = "Present" | "Absent";

export type Student = {
  id: number;
  roll_no: number;
  name: string;
};

export type OverallAttendanceStatus = "idle" | "partial" | "checked-in" | "checked-out";

export type AttendanceCounts = {
  total: number;
  present: number;
  absent: number;
  unmarked: number;
};

type AttendanceContextValue = {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  isoDate: string;
  students: Student[];
  records: Record<number, AttendanceStatus>;
  replaceRecords: (nextRecords: Record<number, AttendanceStatus>) => void;
  loading: boolean;
  error: string | null;
  counts: AttendanceCounts;
  overallStatus: OverallAttendanceStatus;
  markStudent: (studentId: number, status: AttendanceStatus) => Record<number, AttendanceStatus>;
  refresh: () => Promise<void>;
  saveAttendance: (
    recordsOverride?: Record<number, AttendanceStatus>
  ) => Promise<{ success: boolean; error?: string }>;
};

const AttendanceContext = createContext<AttendanceContextValue | undefined>(undefined);

const genericLoadError =
  "We couldn’t load your attendance data. Please refresh or try again in a moment.";
const genericSaveError =
  "We couldn’t update attendance right now. Check your connection and try again.";

export const getFriendlyAttendanceError = (context: "load" | "save", error: any): string => {
  if (!error) return context === "load" ? genericLoadError : genericSaveError;

  const message = typeof error?.message === "string" ? error.message : "";
  const status: number | undefined = error?.status ?? error?.cause?.status;
  const networkIssue = /network/i.test(message) || error?.name === "TypeError";

  if (networkIssue) {
    return "Your connection seems offline. Reconnect and try again.";
  }

  if (status === 401 || status === 403) {
    return "Your session expired. Sign in again to continue.";
  }

  if (status === 404 && context === "load") {
    return "No attendance records found for this date yet.";
  }

  return context === "load" ? genericLoadError : genericSaveError;
};

export const formatDateForDisplay = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

export const computeOverallStatus = (
  students: Student[],
  records: Record<number, AttendanceStatus>
): OverallAttendanceStatus => {
  if (students.length === 0) return "idle";
  const statuses = students.map((student) => records[student.id]);
  if (statuses.length === 0 || statuses.every((status) => !status)) return "idle";
  if (statuses.every((status) => status === "Present")) return "checked-in";
  if (statuses.every((status) => status === "Absent")) return "checked-out";
  return "partial";
};

type AttendanceProviderProps = {
  children: ReactNode;
};

export const AttendanceProvider = ({ children }: AttendanceProviderProps) => {
  const { user, isLoading: authLoading, refreshSession } = useAuth();
  const teacherId = user?.id ?? null;

  const [selectedDate, setSelectedDateState] = useState(() => new Date());
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<Record<number, AttendanceStatus>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isoDate = useMemo(() => selectedDate.toISOString().split("T")[0], [selectedDate]);

  const handleSetSelectedDate = useCallback((date: Date) => {
    setSelectedDateState(date);
    setError(null);
    setLoading(true);
  }, []);

  const loadData = useCallback(async () => {
    if (!teacherId) {
      setStudents([]);
      setRecords({});
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const studentResponse = await fetch(
        buildApiUrl(`/students?teacher_id=${encodeURIComponent(teacherId)}`)
      );

      if (!studentResponse.ok) {
        const payload = await studentResponse.json().catch(() => ({}));
        const failure = new Error(payload.message || "Failed to load students.");
        // @ts-expect-error annotate status for messaging helpers
        failure.status = studentResponse.status;
        throw failure;
      }

      const roster: Student[] = await studentResponse.json();
      const ordered = [...roster].sort((a, b) => a.roll_no - b.roll_no);
      setStudents(ordered);

      const attendanceResponse = await fetch(
        buildApiUrl(`/attendance?teacher_id=${encodeURIComponent(teacherId)}&date=${isoDate}`)
      );

      let payload: { records?: Array<{ student_id: number; status: AttendanceStatus }> } = {
        records: [],
      };

      if (!attendanceResponse.ok) {
        if (attendanceResponse.status !== 404) {
          const errorPayload = await attendanceResponse.json().catch(() => ({}));
          const failure = new Error(errorPayload.message || "Failed to load attendance.");
          // @ts-expect-error annotate status for messaging helpers
          failure.status = attendanceResponse.status;
          throw failure;
        }
      } else {
        payload = await attendanceResponse.json();
      }

      const nextRecords: Record<number, AttendanceStatus> = {};
      (payload.records || []).forEach((record) => {
        nextRecords[record.student_id] = record.status;
      });
      setRecords(nextRecords);
    } catch (err: any) {
      setError(getFriendlyAttendanceError("load", err));
      setRecords({});
      if (err?.status === 401 || err?.status === 403) {
        try {
          await refreshSession();
        } catch (_) {
          // Ignore refresh error – auth flow will handle if needed
        }
      }
    } finally {
      setLoading(false);
    }
  }, [teacherId, isoDate, refreshSession]);

  useEffect(() => {
    if (!authLoading) {
      loadData();
    }
  }, [authLoading, loadData]);

  useEffect(() => {
    if (!teacherId && !authLoading) {
      setStudents([]);
      setRecords({});
      setError(null);
    }
  }, [teacherId, authLoading]);

  const markStudent = useCallback(
    (studentId: number, status: AttendanceStatus) => {
      let nextRecords: Record<number, AttendanceStatus> = {};
      setRecords((prev) => {
        nextRecords = { ...prev, [studentId]: status };
        return nextRecords;
      });
      return nextRecords;
    },
    []
  );

  const replaceRecords = useCallback((nextRecords: Record<number, AttendanceStatus>) => {
    setRecords(nextRecords);
  }, []);

  const counts = useMemo<AttendanceCounts>(() => {
    const total = students.length;
    const present = students.reduce(
      (acc, student) => (records[student.id] === "Present" ? acc + 1 : acc),
      0
    );
    const absent = students.reduce(
      (acc, student) => (records[student.id] === "Absent" ? acc + 1 : acc),
      0
    );
    const unmarked = Math.max(total - present - absent, 0);

    return { total, present, absent, unmarked };
  }, [students, records]);

  const overallStatus = useMemo(
    () => computeOverallStatus(students, records),
    [students, records]
  );

  const saveAttendance = useCallback(
    async (recordsOverride?: Record<number, AttendanceStatus>) => {
      if (!teacherId) {
        return { success: false, error: "No active session. Please sign in again." };
      }

      const sourceRecords = recordsOverride ?? records;

      const recordsArray = Object.entries(sourceRecords)
        .filter(([, status]) => !!status)
        .map(([studentId, status]) => ({
          student_id: Number(studentId),
          status: status as AttendanceStatus,
        }));

      try {
        const response = await fetch(buildApiUrl("/attendance"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teacher_id: teacherId,
            date: isoDate,
            records: recordsArray,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const failure = new Error(payload.message || "Failed to save attendance.");
          // @ts-expect-error annotate status for messaging helpers
          failure.status = response.status;
          throw failure;
        }

        return { success: true };
      } catch (err: any) {
        const friendly = getFriendlyAttendanceError("save", err);
        return { success: false, error: friendly };
      }
    },
    [records, teacherId, isoDate]
  );

  const value = useMemo<AttendanceContextValue>(
    () => ({
      selectedDate,
      setSelectedDate: handleSetSelectedDate,
      isoDate,
      students,
      records,
      replaceRecords,
      loading,
      error,
      counts,
      overallStatus,
      markStudent,
      refresh: loadData,
      saveAttendance,
    }),
    [
      selectedDate,
      handleSetSelectedDate,
      isoDate,
      students,
      records,
      replaceRecords,
      loading,
      error,
      counts,
      overallStatus,
      markStudent,
      loadData,
      saveAttendance,
    ]
  );

  return <AttendanceContext.Provider value={value}>{children}</AttendanceContext.Provider>;
};

export const useAttendance = () => {
  const context = useContext(AttendanceContext);
  if (!context) {
    throw new Error("useAttendance must be used within an AttendanceProvider");
  }
  return context;
};
