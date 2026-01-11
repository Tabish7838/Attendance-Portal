const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bodyParser = require("body-parser");
const XLSX = require("xlsx");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const db = new sqlite3.Database("attendance.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roll_no INTEGER NOT NULL,
      name TEXT NOT NULL,
      teacher_id TEXT NOT NULL,
      UNIQUE(teacher_id, roll_no)
    )
  `);

  db.run("ALTER TABLE students ADD COLUMN teacher_id TEXT", err => {
    if (err && !err.message.includes("duplicate column name")) {
      console.error("Failed to add teacher_id column to students", err.message);
    }
  });

  db.run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_students_teacher_roll ON students(teacher_id, roll_no)"
  );

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      date TEXT,
      status TEXT,
      teacher_id TEXT
    )
  `);

  db.run("ALTER TABLE attendance ADD COLUMN teacher_id TEXT", err => {
    if (err && !err.message.includes("duplicate column name")) {
      console.error("Failed to add teacher_id column", err.message);
    }
  });
  db.run(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supabase_id TEXT UNIQUE,
      username TEXT,
      username_normalized TEXT UNIQUE,
      email TEXT
    )
  `);
});

app.get("/students", (req, res) => {
  const teacherId = req.query.teacher_id;

  if (!teacherId) {
    return res.status(400).json({ message: "teacher_id query parameter is required" });
  }

  db.all(
    "SELECT id, roll_no, name FROM students WHERE teacher_id = ? ORDER BY roll_no ASC",
    [teacherId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Failed to fetch students", error: err.message });
      }
      res.json(rows);
    }
  );
});

app.delete("/students", (req, res) => {
  const teacherId = req.query.teacher_id;
  const rollNo = req.query.roll_no;

  if (!teacherId || (!rollNo && rollNo !== "0")) {
    return res
      .status(400)
      .json({ message: "teacher_id and roll_no query parameters are required" });
  }

  const numericRoll = Number(rollNo);
  if (!Number.isInteger(numericRoll) || numericRoll <= 0) {
    return res.status(400).json({ message: "roll_no must be a positive integer" });
  }

  db.serialize(() => {
    db.get(
      "SELECT id FROM students WHERE teacher_id = ? AND roll_no = ?",
      [teacherId, numericRoll],
      (err, row) => {
        if (err) {
          return res.status(500).json({ message: "Failed to lookup student", error: err.message });
        }

        if (!row) {
          return res.status(404).json({ message: "Student not found for provided roll number" });
        }

        const studentId = row.id;

        db.run("BEGIN TRANSACTION");

        db.run(
          "DELETE FROM attendance WHERE student_id = ? AND teacher_id = ?",
          [studentId, teacherId],
          deleteAttendanceErr => {
            if (deleteAttendanceErr) {
              db.run("ROLLBACK");
              return res
                .status(500)
                .json({
                  message: "Failed to delete attendance for student",
                  error: deleteAttendanceErr.message,
                });
            }

            db.run(
              "DELETE FROM students WHERE id = ?",
              [studentId],
              deleteStudentErr => {
                if (deleteStudentErr) {
                  db.run("ROLLBACK");
                  return res
                    .status(500)
                    .json({
                      message: "Failed to delete student",
                      error: deleteStudentErr.message,
                    });
                }

                db.run("COMMIT", commitErr => {
                  if (commitErr) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ message: "Failed to finalize deletion", error: commitErr.message });
                  }

                  res.json({ message: "Student deleted", student_id: studentId });
                });
              }
            );
          }
        );
      }
    );
  });
});

app.post("/students", (req, res) => {
  const { teacher_id: teacherId, roll_no: rollNo, name } = req.body || {};

  if (!teacherId || (!rollNo && rollNo !== 0) || !name?.trim()) {
    return res
      .status(400)
      .json({ message: "teacher_id, roll_no, and name are required to add a student" });
  }

  db.run(
    "INSERT INTO students (roll_no, name, teacher_id) VALUES (?,?,?)",
    [Number(rollNo), name.trim(), teacherId],
    function (err) {
      if (err) {
        if (err.message?.includes("idx_students_teacher_roll")) {
          return res.status(409).json({ message: "Roll number already exists for this teacher" });
        }
        return res.status(500).json({ message: "Failed to add student", error: err.message });
      }
      res.status(201).json({ id: this.lastID, roll_no: Number(rollNo), name: name.trim() });
    }
  );
});

app.post("/attendance", (req, res) => {
  const { teacher_id: teacherId, records = [], date } = req.body;

  if (!teacherId) {
    return res.status(400).json({ message: "teacher_id is required" });
  }
  if (!Array.isArray(records)) {
    return res.status(400).json({ message: "records must be an array" });
  }

  const invalidRecord = records.some(
    record =>
      !record || typeof record.student_id === "undefined" || typeof record.status !== "string"
  );

  if (invalidRecord) {
    return res.status(400).json({ message: "Each record must include student_id and status" });
  }

  const targetDate = date || new Date().toISOString().split("T")[0];

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.run(
      "DELETE FROM attendance WHERE date = ? AND teacher_id = ?",
      [targetDate, teacherId],
      err => {
        if (err) {
          db.run("ROLLBACK");
          return res
            .status(500)
            .json({ message: "Failed to clear existing records", error: err.message });
        }

        if (records.length === 0) {
          db.run("COMMIT", commitErr => {
            if (commitErr) {
              db.run("ROLLBACK");
              return res
                .status(500)
                .json({ message: "Failed to finalize attendance", error: commitErr.message });
            }
            res.json({ message: "Attendance saved" });
          });
          return;
        }

        const stmt = db.prepare(
          "INSERT INTO attendance (student_id, date, status, teacher_id) VALUES (?,?,?,?)"
        );

        records.forEach(record => {
          stmt.run([record.student_id, targetDate, record.status, teacherId]);
        });

        stmt.finalize(errFinalize => {
          if (errFinalize) {
            db.run("ROLLBACK");
            return res
              .status(500)
              .json({ message: "Failed to save attendance", error: errFinalize.message });
          }

          db.run("COMMIT", commitErr => {
            if (commitErr) {
              db.run("ROLLBACK");
              return res
                .status(500)
                .json({ message: "Failed to finalize attendance", error: commitErr.message });
            }
            res.json({ message: "Attendance saved" });
          });
        });
      }
    );
  });
});

app.get("/attendance", (req, res) => {
  const teacherId = req.query.teacher_id;
  const targetDate = req.query.date || new Date().toISOString().split("T")[0];

  if (!teacherId) {
    return res.status(400).json({ message: "teacher_id query parameter is required" });
  }

  db.all(
    "SELECT student_id, status FROM attendance WHERE teacher_id = ? AND date = ?",
    [teacherId, targetDate],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ message: "Failed to fetch attendance", error: err.message });
      }
      res.json({ date: targetDate, records: rows });
    }
  );
});

app.get("/attendance/latest-date", (req, res) => {
  const teacherId = req.query.teacher_id;

  if (!teacherId) {
    return res.status(400).json({ message: "teacher_id query parameter is required" });
  }

  db.get(
    "SELECT date FROM attendance WHERE teacher_id = ? ORDER BY date DESC LIMIT 1",
    [teacherId],
    (err, row) => {
      if (err) {
        return res
          .status(500)
          .json({ message: "Failed to retrieve latest attendance date", error: err.message });
      }

      res.json({ date: row?.date || null });
    }
  );
});

app.post("/users", (req, res) => {
  const { supabase_id: supabaseId, username, email } = req.body;

  if (!supabaseId || !username || !email) {
    return res.status(400).json({ message: "supabase_id, username, and email are required" });
  }

  const normalizedUsername = username.trim().toLowerCase();

  db.run(
    `INSERT INTO user_profiles (supabase_id, username, username_normalized, email)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(supabase_id) DO UPDATE SET
       username = excluded.username,
       username_normalized = excluded.username_normalized,
       email = excluded.email`,
    [supabaseId, username.trim(), normalizedUsername, email.trim()],
    err => {
      if (err) {
        if (err.message?.includes("user_profiles.username_normalized")) {
          return res.status(409).json({ message: "Username already in use" });
        }
        return res.status(500).json({ message: "Failed to save profile", error: err.message });
      }
      res.status(201).json({ message: "Profile saved" });
    }
  );
});

app.get("/users/by-username/:username", (req, res) => {
  const normalizedUsername = req.params.username.trim().toLowerCase();
  db.get(
    "SELECT email FROM user_profiles WHERE username_normalized = ?",
    [normalizedUsername],
    (err, row) => {
      if (err) {
        return res.status(500).json({ message: "Failed to retrieve user", error: err.message });
      }
      if (!row) {
        return res.status(404).json({ message: "Username not found" });
      }
      res.json({ email: row.email });
    }
  );
});

app.get("/users/by-email/:email", (req, res) => {
  const email = req.params.email.trim().toLowerCase();
  db.get(
    "SELECT username FROM user_profiles WHERE LOWER(email) = ?",
    [email],
    (err, row) => {
      if (err) {
        return res.status(500).json({ message: "Failed to retrieve user", error: err.message });
      }
      if (!row) {
        return res.status(404).json({ message: "Email not found" });
      }
      res.json(row);
    }
  );
});

app.get("/users/:supabaseId", (req, res) => {
  db.get(
    "SELECT username, email FROM user_profiles WHERE supabase_id = ?",
    [req.params.supabaseId],
    (err, row) => {
      if (err) {
        return res.status(500).json({ message: "Failed to retrieve profile", error: err.message });
      }
      if (!row) {
        return res.status(404).json({ message: "Profile not found" });
      }
      res.json(row);
    }
  );
});

app.listen(3000, () => {
  console.log("Backend running on port 3000");
});

app.get("/export", (req, res) => {
  const teacherId = req.query.teacher_id;
  const exportDate = req.query.date;

  if (!teacherId) {
    return res.status(400).json({ message: "teacher_id query parameter is required" });
  }

  const queryParams = [teacherId];
  let dateClause = "";

  if (exportDate) {
    queryParams.push(exportDate);
    dateClause = " AND a.date = ?";
  }

  queryParams.push(teacherId);

  const query = `
    SELECT
      s.roll_no AS rollNo,
      s.name AS name,
      COUNT(a.id) AS totalClasses,
      COALESCE(SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END), 0) AS present,
      COALESCE(SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END), 0) AS absent
    FROM students s
    LEFT JOIN attendance a
      ON a.student_id = s.id
     AND a.teacher_id = ?${dateClause}
    WHERE s.teacher_id = ?
    GROUP BY s.id
    ORDER BY s.roll_no;
  `;

  db.all(query, queryParams, (err, rows) => {
    if (err) {
      return res.status(500).json({ message: "Failed to build export", error: err.message });
    }

    const data = rows.map(row => {
      const percentage = row.totalClasses
        ? ((row.present / row.totalClasses) * 100).toFixed(2)
        : "0";

      return {
        "Roll No": row.rollNo,
        "Name": row.name,
        "Total Classes": row.totalClasses,
        "Present": row.present,
        "Absent": row.absent,
        "Percentage": percentage
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");

    const filePath = "attendance.xlsx";
    XLSX.writeFile(wb, filePath);

    res.download(filePath);
  });
});
