const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const app = express();
app.use(cors());
app.use(bodyParser.json());

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const respondWithError = (res, error, fallbackMessage) => {
  console.error(error);
  const status = error?.status || 500;
  const message = fallbackMessage || "Unexpected error";
  return res.status(status).json({ message, error: error?.message });
};

app.get(
  "/students",
  asyncHandler(async (req, res) => {
    const teacherId = req.query.teacher_id;

    if (!teacherId) {
      return res.status(400).json({ message: "teacher_id query parameter is required" });
    }

    const { data, error } = await supabase
      .from("students")
      .select("id, roll_no, name")
      .eq("teacher_id", teacherId)
      .order("roll_no", { ascending: true });

    if (error) {
      return respondWithError(res, error, "Failed to fetch students");
    }

    return res.json(data || []);
  })
);

app.delete(
  "/students",
  asyncHandler(async (req, res) => {
    const teacherId = req.query.teacher_id;
    const rollNo = req.query.roll_no;

    if (!teacherId || !rollNo) {
      return res
        .status(400)
        .json({ message: "teacher_id and roll_no query parameters are required" });
    }

    const numericRoll = Number(rollNo);
    if (!Number.isInteger(numericRoll) || numericRoll <= 0) {
      return res.status(400).json({ message: "roll_no must be a positive integer" });
    }

    const { data: row, error: lookupError } = await supabase
      .from("students")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("roll_no", numericRoll)
      .maybeSingle();

    if (lookupError) {
      return respondWithError(res, lookupError, "Failed to lookup student");
    }

    if (!row) {
      return res.status(404).json({ message: "Student not found for provided roll number" });
    }

    const studentId = row.id;

    const { error: deleteAttendanceError } = await supabase
      .from("attendance")
      .delete()
      .eq("student_id", studentId)
      .eq("teacher_id", teacherId);

    if (deleteAttendanceError) {
      return respondWithError(res, deleteAttendanceError, "Failed to delete attendance for student");
    }

    const { error: deleteStudentError } = await supabase
      .from("students")
      .delete()
      .eq("id", studentId)
      .eq("teacher_id", teacherId);

    if (deleteStudentError) {
      return respondWithError(res, deleteStudentError, "Failed to delete student");
    }

    return res.json({ message: "Student deleted", student_id: studentId });
  })
);

app.post(
  "/students",
  asyncHandler(async (req, res) => {
    const { teacher_id: teacherId, roll_no: rollNo, name } = req.body || {};

    if (!teacherId || (!rollNo && rollNo !== 0) || !name?.trim()) {
      return res
        .status(400)
        .json({ message: "teacher_id, roll_no, and name are required to add a student" });
    }

    const payload = {
      teacher_id: teacherId,
      roll_no: Number(rollNo),
      name: name.trim(),
    };

    const { data, error } = await supabase
      .from("students")
      .insert(payload)
      .select("id, roll_no, name")
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ message: "Roll number already exists for this teacher" });
      }
      return respondWithError(res, error, "Failed to add student");
    }

    return res.status(201).json(data);
  })
);

app.post(
  "/attendance",
  asyncHandler(async (req, res) => {
    const { teacher_id: teacherId, records = [], date } = req.body || {};

    if (!teacherId) {
      return res.status(400).json({ message: "teacher_id is required" });
    }

    if (!Array.isArray(records)) {
      return res.status(400).json({ message: "records must be an array" });
    }

    const invalidRecord = records.some(
      (record) =>
        !record || typeof record.student_id === "undefined" || typeof record.status !== "string"
    );

    if (invalidRecord) {
      return res.status(400).json({ message: "Each record must include student_id and status" });
    }

    const targetDate = date || new Date().toISOString().split("T")[0];

    const { error: deleteError } = await supabase
      .from("attendance")
      .delete()
      .eq("teacher_id", teacherId)
      .eq("date", targetDate);

    if (deleteError) {
      return respondWithError(res, deleteError, "Failed to clear existing records");
    }

    if (records.length === 0) {
      return res.json({ message: "Attendance saved" });
    }

    const rows = records.map((record) => ({
      student_id: record.student_id,
      status: record.status,
      date: targetDate,
      teacher_id: teacherId,
    }));

    const { error: insertError } = await supabase.from("attendance").insert(rows);

    if (insertError) {
      return respondWithError(res, insertError, "Failed to save attendance");
    }

    return res.json({ message: "Attendance saved" });
  })
);

app.get(
  "/attendance",
  asyncHandler(async (req, res) => {
    const teacherId = req.query.teacher_id;
    const targetDate = req.query.date || new Date().toISOString().split("T")[0];

    if (!teacherId) {
      return res.status(400).json({ message: "teacher_id query parameter is required" });
    }

    const { data, error } = await supabase
      .from("attendance")
      .select("student_id, status")
      .eq("teacher_id", teacherId)
      .eq("date", targetDate);

    if (error) {
      return respondWithError(res, error, "Failed to fetch attendance");
    }

    return res.json({ date: targetDate, records: data || [] });
  })
);

app.get(
  "/attendance/latest-date",
  asyncHandler(async (req, res) => {
    const teacherId = req.query.teacher_id;

    if (!teacherId) {
      return res.status(400).json({ message: "teacher_id query parameter is required" });
    }

    const { data, error } = await supabase
      .from("attendance")
      .select("date")
      .eq("teacher_id", teacherId)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return respondWithError(res, error, "Failed to retrieve latest attendance date");
    }

    return res.json({ date: data?.date || null });
  })
);

app.post(
  "/users",
  asyncHandler(async (req, res) => {
    const { supabase_id: supabaseId, username, email } = req.body || {};

    if (!supabaseId || !username || !email) {
      return res.status(400).json({ message: "supabase_id, username, and email are required" });
    }

    const normalizedUsername = username.trim().toLowerCase();

    const { data: existingUsername, error: usernameLookupError } = await supabase
      .from("user_profiles")
      .select("supabase_id")
      .eq("username_normalized", normalizedUsername)
      .not("supabase_id", "eq", supabaseId)
      .limit(1);

    if (usernameLookupError) {
      return respondWithError(res, usernameLookupError, "Failed to verify username availability");
    }

    if (existingUsername && existingUsername.length > 0) {
      return res.status(409).json({ message: "Username already in use" });
    }

    const { error } = await supabase.from("user_profiles").upsert(
      {
        supabase_id: supabaseId,
        username: username.trim(),
        username_normalized: normalizedUsername,
        email: email.trim(),
      },
      { onConflict: "supabase_id" }
    );

    if (error) {
      return respondWithError(res, error, "Failed to save profile");
    }

    return res.status(201).json({ message: "Profile saved" });
  })
);

app.get(
  "/users/by-username/:username",
  asyncHandler(async (req, res) => {
    const normalizedUsername = req.params.username.trim().toLowerCase();

    const { data, error } = await supabase
      .from("user_profiles")
      .select("email")
      .eq("username_normalized", normalizedUsername)
      .maybeSingle();

    if (error) {
      return respondWithError(res, error, "Failed to retrieve user");
    }

    if (!data) {
      return res.status(404).json({ message: "Username not found" });
    }

    return res.json({ email: data.email });
  })
);

app.get(
  "/users/by-email/:email",
  asyncHandler(async (req, res) => {
    const email = req.params.email.trim().toLowerCase();

    const { data, error } = await supabase
      .from("user_profiles")
      .select("username")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      return respondWithError(res, error, "Failed to retrieve user");
    }

    if (!data) {
      return res.status(404).json({ message: "Email not found" });
    }

    return res.json(data);
  })
);

app.get(
  "/users/:supabaseId",
  asyncHandler(async (req, res) => {
    const { supabaseId } = req.params;

    const { data, error } = await supabase
      .from("user_profiles")
      .select("username, email")
      .eq("supabase_id", supabaseId)
      .maybeSingle();

    if (error) {
      return respondWithError(res, error, "Failed to retrieve profile");
    }

    if (!data) {
      return res.status(404).json({ message: "Profile not found" });
    }

    return res.json(data);
  })
);

app.get(
  "/export",
  asyncHandler(async (req, res) => {
    const teacherId = req.query.teacher_id;
    const exportDate = req.query.date;

    if (!teacherId) {
      return res.status(400).json({ message: "teacher_id query parameter is required" });
    }

    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select("id, roll_no, name")
      .eq("teacher_id", teacherId)
      .order("roll_no", { ascending: true });

    if (studentsError) {
      return respondWithError(res, studentsError, "Failed to build export");
    }

    let attendanceQuery = supabase
      .from("attendance")
      .select("student_id, status, date")
      .eq("teacher_id", teacherId);

    if (exportDate) {
      attendanceQuery = attendanceQuery.eq("date", exportDate);
    }

    const { data: attendanceRows, error: attendanceError } = await attendanceQuery;

    if (attendanceError) {
      return respondWithError(res, attendanceError, "Failed to build export");
    }

    const attendanceByStudent = new Map();
    (attendanceRows || []).forEach((record) => {
      if (!attendanceByStudent.has(record.student_id)) {
        attendanceByStudent.set(record.student_id, { total: 0, present: 0, absent: 0 });
      }
      const stats = attendanceByStudent.get(record.student_id);
      stats.total += 1;
      if (record.status === "Present") {
        stats.present += 1;
      } else if (record.status === "Absent") {
        stats.absent += 1;
      }
    });

    const summaryData = (students || []).map((student) => {
      const stats = attendanceByStudent.get(student.id) || { total: 0, present: 0, absent: 0 };
      const percentage = stats.total > 0 ? ((stats.present / stats.total) * 100).toFixed(2) : "0";

      return {
        "Roll No": student.roll_no,
        "Name": student.name,
        "Total Classes": stats.total,
        "Present": stats.present,
        "Absent": stats.absent,
        "Percentage": percentage,
      };
    });

    const dates = Array.from(
      new Set(
        (attendanceRows || [])
          .map((row) => row.date)
          .filter((date) => typeof date === "string" && date.trim().length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));

    const attendanceByStudentDate = new Map();
    (attendanceRows || []).forEach((row) => {
      if (!row?.student_id || !row?.date) return;
      attendanceByStudentDate.set(`${row.student_id}|${row.date}`, row.status);
    });

    const dateWiseData = (students || []).map((student) => {
      const row = {
        "Roll No": student.roll_no,
        "Name": student.name,
      };

      dates.forEach((date) => {
        const status = attendanceByStudentDate.get(`${student.id}|${date}`);
        row[date] = status === "Present" ? "P" : status === "Absent" ? "A" : "";
      });

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(summaryData);
    const wsDateWise = XLSX.utils.json_to_sheet(dateWiseData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");

    XLSX.utils.book_append_sheet(wb, wsDateWise, "Date Wise");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="attendance${exportDate ? `-${exportDate}` : ""}-${stamp}.xlsx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    return res.send(buffer);
  })
);

app.use((err, _req, res, _next) => {
  console.error("Unhandled error", err);
  res.status(500).json({ message: "Internal server error" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});
