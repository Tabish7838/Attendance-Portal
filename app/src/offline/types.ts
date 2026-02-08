export type SyncOpType = "create" | "update" | "delete";
export type SyncEntity = "student" | "attendance";

export type StudentLocal = {
  local_id: number;
  server_id: number | null;
  teacher_id: string;
  roll_no: number;
  name: string;
  is_deleted: 0 | 1;
  created_at: string;
  updated_at: string;
  client_updated_at: string;
};

export type AttendanceLocal = {
  local_id: number;
  server_id: number | null;
  teacher_id: string;
  student_local_id: number;
  student_server_id: number | null;
  date: string;
  status: "Present" | "Absent";
  is_deleted: 0 | 1;
  created_at: string;
  updated_at: string;
  client_updated_at: string;
};

export type SyncQueueRow = {
  id: number;
  table_name: string;
  record_id: string;
  op_type: SyncOpType;
  payload: string;
  client_updated_at: string;
  created_at: string;
  attempts: number;
};
