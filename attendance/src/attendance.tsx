import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

type NavKey = "home" | "mark" | "summary" | "roster";

const NAV_ITEMS: Array<{ key: NavKey; label: string; icon: string; path: string }> = [
  { key: "home", label: "Home", icon: "🏠", path: "/attendance" },
  { key: "mark", label: "Attendance", icon: "✅", path: "/attendance/mark" },
  { key: "summary", label: "Absences", icon: "📉", path: "/attendance/summary" },
  { key: "roster", label: "Roster", icon: "👥", path: "/attendance/roster" },
];

type Student = {
  id: number;
  roll_no: number;
  name: string;
};

function Attendance() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<{ username: string; email: string } | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<{ [key: number]: string }>({});
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [newStudentRoll, setNewStudentRoll] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [studentError, setStudentError] = useState<string | null>(null);
  const [studentSaving, setStudentSaving] = useState(false);
  const [latestDateLoadedForUser, setLatestDateLoadedForUser] = useState<string | null>(null);
  const [deleteRoll, setDeleteRoll] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const location = useLocation();
  const [activeNav, setActiveNav] = useState<NavKey>("home");

  /* 🔒 AUTH PROTECTION */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate("/");
      else setUser(data.user);
    });
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const loadProfile = async () => {
      try {
        const res = await fetch(`http://localhost:3000/users/${user.id}`);
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
          return;
        }

        if (res.status === 404 && user.email) {
          const fallback = await fetch(
            `http://localhost:3000/users/by-email/${encodeURIComponent(user.email)}`
          );
          if (fallback.ok) {
            const data = await fallback.json();
            setProfile({ username: data.username, email: user.email });
            return;
          }
        }

        setProfile({ username: "", email: user.email });
      } catch (err) {
        setProfile({ username: "", email: user?.email });
      }
    };

    loadProfile();
  }, [user]);

  const fetchStudents = async (teacherId: string) => {
    try {
      setStudentsLoading(true);
      const res = await fetch(`http://localhost:3000/students?teacher_id=${teacherId}`);
      if (!res.ok) {
        throw new Error("Failed to load students");
      }
      const data = await res.json();
      setStudents(data);
    } catch (error) {
      console.error(error);
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  };

  useEffect(() => {
    if (!location.pathname.startsWith("/attendance")) {
      return;
    }

    const matched = NAV_ITEMS.find(item => item.path === location.pathname);
    if (matched) {
      setActiveNav(matched.key);
    } else {
      setActiveNav("home");
      if (location.pathname !== "/attendance") {
        navigate("/attendance", { replace: true });
      }
    }
  }, [location.pathname, navigate]);

  const handleDeleteStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user?.id) {
      alert("Session expired. Please log in again.");
      return;
    }

    setDeleteError(null);
    setDeleteMessage(null);

    if (!deleteRoll.trim()) {
      setDeleteError("Enter the roll number to delete.");
      return;
    }

    const rollNumber = Number(deleteRoll.trim());
    if (!Number.isInteger(rollNumber) || rollNumber <= 0) {
      setDeleteError("Roll number must be a positive integer.");
      return;
    }

    const studentToRemove = students.find((s) => s.roll_no === rollNumber);
    if (!studentToRemove) {
      setDeleteError("No student with that roll number in your roster.");
      return;
    }

    setDeleteLoading(true);

    try {
      const url = new URL("http://localhost:3000/students");
      url.searchParams.set("teacher_id", user.id);
      url.searchParams.set("roll_no", rollNumber.toString());

      const res = await fetch(url.toString(), { method: "DELETE" });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.message || "Failed to delete student");
      }

      setStudents((prev) => {
        const next = prev.filter((s) => s.id !== studentToRemove.id);
        setCurrentIndex((current) => {
          if (next.length === 0) return 0;
          return Math.min(current, next.length - 1);
        });
        return next;
      });

      setAttendance((prev) => {
        if (!(studentToRemove.id in prev)) return prev;
        const { [studentToRemove.id]: _removed, ...rest } = prev;
        return rest;
      });

      setDeleteMessage(`Removed ${studentToRemove.name} (Roll ${studentToRemove.roll_no}).`);
      setDeleteRoll("");
    } catch (error: any) {
      setDeleteError(error.message || "Failed to delete student");
    } finally {
      setDeleteLoading(false);
    }
  };

  /* 📥 FETCH STUDENTS */
  useEffect(() => {
    if (!user?.id) return;
    fetchStudents(user.id);
  }, [user?.id]);

  /* � FETCH EXISTING ATTENDANCE FOR DATE */
  useEffect(() => {
    if (!user?.id || !selectedDate || students.length === 0) return;

    const controller = new AbortController();

    fetch(
      `http://localhost:3000/attendance?teacher_id=${user.id}&date=${selectedDate}`,
      { signal: controller.signal }
    )
      .then(res => {
        if (!res.ok) {
          throw new Error("Failed to load attendance");
        }
        return res.json();
      })
      .then(payload => {
        const mapped: { [key: number]: string } = {};
        (payload.records || []).forEach(
          (record: { student_id: number; status: string }) => {
            mapped[record.student_id] = record.status;
          }
        );
        setAttendance(mapped);

        const nextUnmarked = students.findIndex(s => !mapped[s.id]);
        setCurrentIndex(nextUnmarked === -1 ? 0 : nextUnmarked);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        console.error(err);
        setAttendance({});
        setCurrentIndex(0);
      });

    return () => controller.abort();
  }, [user, selectedDate, students]);

  /* 📅 LOAD MOST RECENT DATE FOR TEACHER */
  useEffect(() => {
    if (!user?.id) {
      setLatestDateLoadedForUser(null);
      return;
    }

    if (latestDateLoadedForUser === user.id) return;

    const controller = new AbortController();

    const loadLatestDate = async () => {
      try {
        const res = await fetch(
          `http://localhost:3000/attendance/latest-date?teacher_id=${user.id}`,
          { signal: controller.signal }
        );

        if (!res.ok) {
          throw new Error("Failed to fetch latest attendance date");
        }

        const payload = await res.json();
        if (payload.date) {
          setSelectedDate(payload.date);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLatestDateLoadedForUser(user.id);
        }
      }
    };

    loadLatestDate();

    return () => controller.abort();
  }, [user?.id, latestDateLoadedForUser]);

  /* � LOGOUT */
  const logout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  /* ✅ MARK ATTENDANCE */
  const markAttendance = (status: string) => {
    const student = students[currentIndex];
    if (!student) return;

    const updated = { ...attendance, [student.id]: status };
    setAttendance(updated);

    const nextUnmarked = students.findIndex(s => !updated[s.id]);
    if (nextUnmarked === -1) {
      alert("All students marked");
      setCurrentIndex(0);
    } else {
      setCurrentIndex(nextUnmarked);
    }
  };

  /* 💾 SAVE ATTENDANCE */
  const saveAttendance = () => {
    if (!user?.id) {
      alert("Session expired. Please log in again.");
      return;
    }

    const records = Object.entries(attendance)
      .filter(([, status]) => typeof status === "string" && status.length > 0)
      .map(([id, status]) => ({
        student_id: Number(id),
        status,
      }));

    fetch("http://localhost:3000/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacher_id: user.id,
        date: selectedDate,
        records,
      }),
    })
      .then(async res => {
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.message || "Failed to save attendance");
        }
        alert("Attendance saved");
      })
      .catch(err => {
        alert(err.message || "Failed to save attendance");
      });
  };

  /* 📊 DOWNLOAD EXCEL */
  const downloadExcel = () => {
    if (!user?.id) {
      alert("Session expired. Please log in again.");
      return;
    }

    const url = new URL("http://localhost:3000/export");
    url.searchParams.set("teacher_id", user.id);

    window.open(url.toString(), "_blank", "noopener");
  };

  const handleDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (!value) return;
    setSelectedDate(value);
    setAttendance({});
    setCurrentIndex(0);
  };

  const handleAddStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id) {
      alert("Session expired. Please log in again.");
      return;
    }

    setStudentError(null);

    if (!newStudentRoll.trim() || !newStudentName.trim()) {
      setStudentError("Please provide both roll number and student name.");
      return;
    }

    const rollNumber = Number(newStudentRoll);
    if (!Number.isInteger(rollNumber) || rollNumber <= 0) {
      setStudentError("Roll number must be a positive integer.");
      return;
    }

    setStudentSaving(true);

    try {
      const res = await fetch("http://localhost:3000/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacher_id: user.id,
          roll_no: rollNumber,
          name: newStudentName.trim(),
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.message || "Failed to add student");
      }

      const created: Student = await res.json();
      setStudents((prev) => [...prev, created].sort((a, b) => a.roll_no - b.roll_no));
      setNewStudentRoll("");
      setNewStudentName("");
    } catch (error: any) {
      setStudentError(error.message || "Failed to add student");
    } finally {
      setStudentSaving(false);
    }
  };

  const hasStudents = students.length > 0;
  const student = hasStudents ? students[currentIndex] ?? students[0] : undefined;
  const currentStudentIndex = student ? students.findIndex(s => s.id === student.id) : 0;
  const absentStudents = students.filter(s => attendance[s.id] === "Absent");
  const presentStudents = students.filter(s => attendance[s.id] === "Present");
  const totalStudents = students.length;
  const presentCount = presentStudents.length;
  const absentCount = absentStudents.length;
  const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  const renderHome = () => (
    <div className="mobile-dashboard">
      <section className="card-block overview-card">
        <header className="card-header">
          <span className="section-label">Attendance dashboard</span>
          <h1>Run your daily roll call with confidence.</h1>
          <p>
            Manage your roster, mark attendance, and track absences without leaving your phone.
            Everything stays synced to your account.
          </p>
        </header>
        <div className="overview-body">
          <div className="overview-meta">
            <div className="meta-block">
              <label htmlFor="attendance-date-home">Attendance date</label>
              <input
                id="attendance-date-home"
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
              />
            </div>
            <div className="meta-block">
              <label>Logged in as</label>
              <div className="profile-chip">
                <strong>{profile?.username?.trim() || profile?.email || user?.email || "Teacher"}</strong>
                <span>{profile?.email || user?.email}</span>
              </div>
            </div>
          </div>

          <div className="quick-actions">
            <button className="btn btn-outline" onClick={downloadExcel}>
              Export full history
            </button>
            <button className="btn btn-ghost" onClick={logout}>
              Logout
            </button>
          </div>
        </div>

        <div className="stats-strip" aria-label="Attendance overview">
          <div className="stat-pill info">
            <span>Total students</span>
            <strong>{totalStudents}</strong>
          </div>
          <div className="stat-pill success">
            <span>Present today</span>
            <strong>{presentCount}</strong>
            <small>{attendanceRate}% attendance</small>
          </div>
          <div className="stat-pill alert">
            <span>Absent today</span>
            <strong>{absentCount}</strong>
            <small>{totalStudents > 0 ? totalStudents - presentCount : 0} unmarked</small>
          </div>
        </div>
      </section>
    </div>
  );

  const renderMark = () => (
    <div className="mobile-dashboard">
      <section className="card-block attendance-card">
        <header className="card-header card-heading">
          <div>
            <span className="badge badge-accent">Taking attendance</span>
            <h2>{student ? student.name : "No roster yet"}</h2>
          </div>
          <p>{student ? `Roll number ${student.roll_no}` : "Add students to start the roll call."}</p>
        </header>

        <div className="card-body attendance-controls">
          <div className="meta-block">
            <label htmlFor="attendance-date-mark">Attendance date</label>
            <input
              id="attendance-date-mark"
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
            />
          </div>
          <div className="status-buttons">
            <button className="btn btn-success" onClick={() => markAttendance("Present")} disabled={!student}>
              Mark Present
            </button>
            <button className="btn btn-danger" onClick={() => markAttendance("Absent")} disabled={!student}>
              Mark Absent
            </button>
          </div>
          <div className="progress-ticker">
            <span className="ticker-label">Progress</span>
            <strong>
              {student
                ? `Student ${currentStudentIndex + 1} of ${students.length}`
                : studentsLoading
                ? "Loading roster..."
                : "No students yet"}
            </strong>
          </div>
        </div>

        <footer className="card-footer">
          <button className="btn btn-primary" onClick={saveAttendance}>
            Save today's attendance
          </button>
        </footer>
      </section>
    </div>
  );

  const renderSummary = () => (
    <div className="mobile-dashboard">
      <section className="card-block summary-card">
        <header className="card-header">
          <div>
            <span className="badge badge-danger">Absent summary</span>
            <h2>Students marked absent</h2>
          </div>
          <p>Insights for {selectedDate}</p>
        </header>

        <div className="card-body">
          <div className="meta-block">
            <label htmlFor="attendance-date-summary">Attendance date</label>
            <input
              id="attendance-date-summary"
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
            />
          </div>
          <div className="table-scroll">
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Roll No</th>
                  <th>Name</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {!hasStudents ? (
                  <tr>
                    <td colSpan={3} className="empty-state">
                      No students found. Add students to start tracking attendance.
                    </td>
                  </tr>
                ) : absentStudents.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="empty-state">
                      No absent students — your class is fully present!
                    </td>
                  </tr>
                ) : (
                  absentStudents.map(s => (
                    <tr key={s.id}>
                      <td>{s.roll_no}</td>
                      <td>{s.name}</td>
                      <td>Absent</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );

  const renderRoster = () => (
    <div className="mobile-dashboard">
      <section className="card-block roster-card">
        <header className="card-header">
          <div>
            <span className="badge badge-accent">Manage roster</span>
            <h2>Keep your student list up to date</h2>
          </div>
          <p>Roll numbers are unique per teacher. Add or remove students at any time.</p>
        </header>

        <div className="card-body roster-body">
          <form onSubmit={handleAddStudent} className="roster-form">
            <label>Add a student</label>
            <div className="roster-inputs">
              <input
                type="number"
                min="1"
                placeholder="Roll number"
                value={newStudentRoll}
                onChange={(e) => setNewStudentRoll(e.target.value)}
              />
              <input
                type="text"
                placeholder="Student name"
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
              />
              <button type="submit" className="btn btn-secondary" disabled={studentSaving}>
                {studentSaving ? "Adding..." : "Add student"}
              </button>
            </div>
            {studentError && <p className="form-error">{studentError}</p>}
          </form>

          <div className="divider" />

          <form onSubmit={handleDeleteStudent} className="roster-form danger">
            <label>Remove a student</label>
            <p className="form-note">Enter the roll number to delete the student and their attendance history.</p>
            <div className="roster-inputs">
              <input
                type="number"
                min="1"
                placeholder="Roll number"
                value={deleteRoll}
                onChange={(e) => setDeleteRoll(e.target.value)}
              />
              <button type="submit" className="btn btn-danger" disabled={deleteLoading}>
                {deleteLoading ? "Removing..." : "Delete student"}
              </button>
            </div>
            {deleteError && <p className="form-error">{deleteError}</p>}
            {deleteMessage && <p className="form-success">{deleteMessage}</p>}
          </form>
        </div>
      </section>
    </div>
  );

  const renderContent = () => {
    switch (activeNav) {
      case "mark":
        return renderMark();
      case "summary":
        return renderSummary();
      case "roster":
        return renderRoster();
      default:
        return renderHome();
    }
  };

  return (
    <div className="attendance-shell">
      <main className="page-shell">{renderContent()}</main>

      <nav className="attendance-nav">
        <div className="nav-links">
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              type="button"
              className={`nav-link-btn ${activeNav === item.key ? "is-active" : ""}`}
              onClick={() => navigate(item.path)}
            >
              <span aria-hidden className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default Attendance;
