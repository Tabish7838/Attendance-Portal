import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export const DB_NAME = "attendance_offline.db";

async function getDbInternal(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase) {
  // Local schema for offline-first reads/writes.
  // All timestamps are stored as ISO strings.
  await db.execAsync(
    `
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS students_local (
      local_id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER,
      teacher_id TEXT NOT NULL,
      roll_no INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      UNIQUE(teacher_id, roll_no)
    );

    CREATE TABLE IF NOT EXISTS attendance_local (
      local_id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER,
      teacher_id TEXT NOT NULL,
      student_local_id INTEGER NOT NULL,
      student_server_id INTEGER,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      UNIQUE(teacher_id, student_local_id, date)
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      op_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue(created_at);
    CREATE INDEX IF NOT EXISTS idx_students_teacher ON students_local(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_teacher_date ON attendance_local(teacher_id, date);
    `
  );
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await getDbInternal();
  await migrate(db);
  return db;
}
