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
import { useBranch } from "./BranchContext";
import { buildApiUrl } from "../env";
import {
  getAttendanceForDateLocal,
  hydrateAttendanceFromServer,
  hydrateStudentsFromServer,
  listStudentsLocal,
  upsertAttendanceLocal,
  enqueueOp,
  getStudentLocalByLocalId,
  softDeleteAttendanceLocal,
} from "../offline/repo";
import { isOnline, syncNow } from "../offline/sync";

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
  const { user, isLoading: authLoading, refreshSession, accessToken } = useAuth();
  const teacherId = user?.id ?? null;
  const { selectedBranchLocalId, selectedBranch } = useBranch();

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

    if (!selectedBranchLocalId) {
      setStudents([]);
      setRecords({});
      setLoading(false);
      setError(null);
      return;
    }

    const branchName = selectedBranch?.name ?? null;
    if (!branchName) {
      setStudents([]);
      setRecords({});
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const online = await isOnline();

      if (online && accessToken) {
        const studentResponse = await fetch(
          buildApiUrl(
            `/students?teacher_id=${encodeURIComponent(teacherId)}&branch_name=${encodeURIComponent(branchName)}`
          ),
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (studentResponse.ok) {
          const roster: Array<{ id: number; roll_no: number; name: string }> =
            await studentResponse.json();
          await hydrateStudentsFromServer({
            teacherId,
            branchLocalId: selectedBranchLocalId,
            students: roster || [],
          });
        }

        const attendanceResponse = await fetch(
          buildApiUrl(
            `/attendance?teacher_id=${encodeURIComponent(teacherId)}&branch_name=${encodeURIComponent(
              branchName
            )}&date=${isoDate}`
          ),
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (attendanceResponse.ok) {
          const payload: { records?: Array<{ student_id: number; status: AttendanceStatus }> } =
            await attendanceResponse.json();
          await hydrateAttendanceFromServer({
            teacherId,
            branchLocalId: selectedBranchLocalId,
            isoDate,
            records: (payload.records || []) as Array<{ student_id: number; status: AttendanceStatus }>,
          });
        }
      }

      const localStudents = await listStudentsLocal(teacherId, selectedBranchLocalId);
      setStudents(
        localStudents.map((s) => ({ id: s.local_id, roll_no: s.roll_no, name: s.name }))
      );

      const localAttendance = await getAttendanceForDateLocal({
        teacherId,
        branchLocalId: selectedBranchLocalId,
        isoDate,
      });
      const nextRecords: Record<number, AttendanceStatus> = {};
      localAttendance.forEach((row) => {
        nextRecords[row.student_local_id] = row.status;
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
  }, [teacherId, isoDate, refreshSession, selectedBranchLocalId, selectedBranch?.name]);

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

      if (!selectedBranchLocalId) {
        return { success: false, error: "Create a branch first." };
      }

      const branchName = selectedBranch?.name ?? null;
      if (!branchName) {
        return { success: false, error: "Select a branch first." };
      }

      const sourceRecords = recordsOverride ?? records;

      try {
        const clientUpdatedAt = new Date().toISOString();

        for (const student of students) {
          const status = sourceRecords[student.id];
          const studentRow = await getStudentLocalByLocalId({ teacherId, localId: student.id });
          const studentServerId = studentRow?.server_id ?? null;

          if (status) {
            const localRow = await upsertAttendanceLocal({
              teacherId,
              branchLocalId: selectedBranchLocalId,
              isoDate,
              status,
              studentLocalId: student.id,
              studentServerId: studentServerId ? Number(studentServerId) : null,
              clientUpdatedAt,
            });

            await enqueueOp({
              entity: "attendance",
              recordId: String(localRow.local_id),
              opType: localRow.server_id ? "update" : "create",
              payload: {
                student_local_id: student.id,
                student_id: studentServerId ? Number(studentServerId) : undefined,
                date: isoDate,
                status,
                branch_name: branchName,
              },
              clientUpdatedAt,
            });
          } else {
            await softDeleteAttendanceLocal({
              teacherId,
              branchLocalId: selectedBranchLocalId,
              isoDate,
              studentLocalId: student.id,
              clientUpdatedAt,
            });

            await enqueueOp({
              entity: "attendance",
              recordId: String(student.id),
              opType: "delete",
              payload: {
                student_local_id: student.id,
                student_id: studentServerId ? Number(studentServerId) : undefined,
                date: isoDate,
                branch_name: branchName,
              },
              clientUpdatedAt,
            });
          }
        }

        const online = await isOnline();
        if (online && accessToken) {
          await syncNow({ accessToken, teacherId });
        }

        await loadData();
        return { success: true };
      } catch (err: any) {
        const friendly = getFriendlyAttendanceError("save", err);
        return { success: false, error: friendly };
      }
    },
    [records, teacherId, selectedBranchLocalId, selectedBranch?.name, isoDate, students, loadData, accessToken]
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
