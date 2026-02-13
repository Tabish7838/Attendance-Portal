import * as SQLite from "expo-sqlite";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export const DB_NAME = "attendance_offline.db";

const SCHEMA_VERSION = 2;

async function getDbInternal(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbPromise;
}

async function getMetaValue(db: SQLite.SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM _meta WHERE key = ?",
    [key]
  );
  return row?.value ?? null;
}

async function setMetaValue(db: SQLite.SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    "INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}

async function ensureDefaultBranchPerTeacher(db: SQLite.SQLiteDatabase): Promise<void> {
  const teachers = await db.getAllAsync<{ teacher_id: string }>(
    "SELECT DISTINCT teacher_id FROM students_local",
    []
  );
  if (teachers.length === 0) return;

  for (const t of teachers) {
    await db.runAsync(
      `INSERT INTO branches_local (server_id, teacher_id, name, is_deleted, created_at, updated_at, client_updated_at)
       VALUES (NULL, ?, 'Default', 0,
         strftime('%Y-%m-%dT%H:%M:%fZ','now'),
         strftime('%Y-%m-%dT%H:%M:%fZ','now'),
         strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(teacher_id, name) DO NOTHING`,
      [t.teacher_id]
    );
  }
}

async function backfillBranchIds(db: SQLite.SQLiteDatabase): Promise<void> {
  const branches = await db.getAllAsync<{ teacher_id: string; local_id: number }>(
    "SELECT teacher_id, local_id FROM branches_local WHERE name = 'Default' AND is_deleted = 0",
    []
  );

  for (const b of branches) {
    await db.runAsync(
      "UPDATE students_local SET branch_local_id = ? WHERE teacher_id = ? AND (branch_local_id IS NULL OR branch_local_id = 0)",
      [b.local_id, b.teacher_id]
    );
    await db.runAsync(
      "UPDATE attendance_local SET branch_local_id = ? WHERE teacher_id = ? AND (branch_local_id IS NULL OR branch_local_id = 0)",
      [b.local_id, b.teacher_id]
    );
  }
}

async function hasColumn(db: SQLite.SQLiteDatabase, table: string, column: string): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`, []);
  return rows.some((r) => r.name === column);
}

async function migrateToV2(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(
    `
    CREATE TABLE IF NOT EXISTS branches_local (
      local_id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER,
      teacher_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      UNIQUE(teacher_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_branches_teacher ON branches_local(teacher_id);
    `
  );

  const studentsHasBranch = await hasColumn(db, "students_local", "branch_local_id");
  const attendanceHasBranch = await hasColumn(db, "attendance_local", "branch_local_id");

  if (!studentsHasBranch) {
    await db.execAsync(
      `
      CREATE TABLE IF NOT EXISTS students_local_v2 (
        local_id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER,
        teacher_id TEXT NOT NULL,
        branch_local_id INTEGER NOT NULL DEFAULT 0,
        roll_no INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        client_updated_at TEXT NOT NULL,
        UNIQUE(teacher_id, branch_local_id, roll_no)
      );
      CREATE INDEX IF NOT EXISTS idx_students_teacher_branch ON students_local_v2(teacher_id, branch_local_id);
      `
    );

    await db.runAsync(
      `INSERT INTO students_local_v2 (local_id, server_id, teacher_id, branch_local_id, roll_no, name, is_deleted, created_at, updated_at, client_updated_at)
       SELECT local_id, server_id, teacher_id, 0 as branch_local_id, roll_no, name, is_deleted, created_at, updated_at, client_updated_at
       FROM students_local`,
      []
    );

    await db.execAsync(
      `
      DROP TABLE students_local;
      ALTER TABLE students_local_v2 RENAME TO students_local;
      CREATE INDEX IF NOT EXISTS idx_students_teacher ON students_local(teacher_id);
      `
    );
  }

  if (!attendanceHasBranch) {
    await db.execAsync(
      `
      CREATE TABLE IF NOT EXISTS attendance_local_v2 (
        local_id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id INTEGER,
        teacher_id TEXT NOT NULL,
        branch_local_id INTEGER NOT NULL DEFAULT 0,
        student_local_id INTEGER NOT NULL,
        student_server_id INTEGER,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        client_updated_at TEXT NOT NULL,
        UNIQUE(teacher_id, branch_local_id, student_local_id, date)
      );
      CREATE INDEX IF NOT EXISTS idx_attendance_teacher_branch_date ON attendance_local_v2(teacher_id, branch_local_id, date);
      `
    );

    await db.runAsync(
      `INSERT INTO attendance_local_v2 (local_id, server_id, teacher_id, branch_local_id, student_local_id, student_server_id, date, status, is_deleted, created_at, updated_at, client_updated_at)
       SELECT local_id, server_id, teacher_id, 0 as branch_local_id, student_local_id, student_server_id, date, status, is_deleted, created_at, updated_at, client_updated_at
       FROM attendance_local`,
      []
    );

    await db.execAsync(
      `
      DROP TABLE attendance_local;
      ALTER TABLE attendance_local_v2 RENAME TO attendance_local;
      CREATE INDEX IF NOT EXISTS idx_attendance_teacher_date ON attendance_local(teacher_id, date);
      `
    );
  }

  await ensureDefaultBranchPerTeacher(db);
  await backfillBranchIds(db);
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
      branch_local_id INTEGER NOT NULL DEFAULT 0,
      roll_no INTEGER NOT NULL,
      name TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      UNIQUE(teacher_id, branch_local_id, roll_no)
    );

    CREATE TABLE IF NOT EXISTS attendance_local (
      local_id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER,
      teacher_id TEXT NOT NULL,
      branch_local_id INTEGER NOT NULL DEFAULT 0,
      student_local_id INTEGER NOT NULL,
      student_server_id INTEGER,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      client_updated_at TEXT NOT NULL,
      UNIQUE(teacher_id, branch_local_id, student_local_id, date)
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

  const versionRaw = await getMetaValue(db, "schema_version");
  const currentVersion = Number(versionRaw ?? "1");

  if (!Number.isFinite(currentVersion) || currentVersion < 1) {
    await setMetaValue(db, "schema_version", "1");
  }

  if (currentVersion < 2) {
    await migrateToV2(db);
    await setMetaValue(db, "schema_version", String(SCHEMA_VERSION));
  }
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await getDbInternal();
  await migrate(db);
  return db;
}
