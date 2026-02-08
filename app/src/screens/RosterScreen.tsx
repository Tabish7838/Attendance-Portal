import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import { useAttendance } from "../context/AttendanceContext";
import { buildApiUrl } from "../env";

type Student = {
  id: number;
  roll_no: number;
  name: string;
};

const friendlyError = (fallback: string, error: any): string => {
  if (!error) return fallback;
  if (typeof error?.message === "string" && error.message.trim().length > 0) {
    return error.message;
  }
  const isNetwork = /network/i.test(String(error?.message)) || error?.name === "TypeError";
  if (isNetwork) {
    return "We couldn’t reach the server. Check your connection and try again.";
  }
  return fallback;
};

const RosterScreen: React.FC = () => {
  const { user, isLoading: authLoading, refreshSession } = useAuth();
  const { refresh } = useAttendance();

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rollInput, setRollInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [deleteRoll, setDeleteRoll] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  const teacherId = user?.id ?? null;

  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => a.roll_no - b.roll_no),
    [students]
  );

  const loadStudents = useCallback(async () => {
    if (!teacherId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        buildApiUrl(`/students?teacher_id=${encodeURIComponent(teacherId)}`)
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const failure = new Error(payload.message || "Failed to load students.");
        // @ts-expect-error augment status for friendly error messaging
        failure.status = response.status;
        throw failure;
      }

      const data: Student[] = await response.json();
      setStudents(data);
    } catch (err: any) {
      setStudents([]);
      setError(friendlyError("We couldn’t load your roster. Please try again.", err));
      if (err?.status === 401 || err?.status === 403) {
        try {
          await refreshSession();
        } catch (_) {
          /* ignore refresh failure */
        }
      }
    } finally {
      setLoading(false);
    }
  }, [teacherId, refreshSession]);

  useEffect(() => {
    if (!teacherId) {
      setStudents([]);
      setLoading(false);
      setError(null);
      return;
    }

    loadStudents();
  }, [teacherId, loadStudents]);

  const handleAdd = async () => {
    if (!teacherId || adding) return;

    const trimmedName = nameInput.trim();
    const trimmedRoll = rollInput.trim();

    setAddError(null);

    if (!trimmedRoll || !trimmedName) {
      setAddError("Please provide both roll number and student name.");
      return;
    }

    const rollNumber = Number(trimmedRoll);
    if (!Number.isInteger(rollNumber) || rollNumber <= 0) {
      setAddError("Roll number must be a positive whole number.");
      return;
    }

    setAdding(true);

    const tempId = Date.now() * -1;
    const optimisticStudent: Student = {
      id: tempId,
      roll_no: rollNumber,
      name: trimmedName,
    };
    setStudents((prev) => [...prev, optimisticStudent]);

    try {
      const response = await fetch(buildApiUrl("/students"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacher_id: teacherId,
          roll_no: rollNumber,
          name: trimmedName,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const failure = new Error(payload.message || "Failed to add student.");
        throw failure;
      }

      const created: Student = await response.json();
      setStudents((prev) =>
        prev
          .map((student) => (student.id === tempId ? created : student))
          .sort((a, b) => a.roll_no - b.roll_no)
      );
      await refresh();
      setRollInput("");
      setNameInput("");
      Keyboard.dismiss();
    } catch (err: any) {
      setStudents((prev) => prev.filter((student) => student.id !== tempId));
      setAddError(friendlyError("Unable to add student. Please try again.", err));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!teacherId || deleting) return;

    const trimmed = deleteRoll.trim();
    setDeleteError(null);
    setDeleteMessage(null);

    if (!trimmed) {
      setDeleteError("Enter the roll number to delete.");
      return;
    }

    const rollNumber = Number(trimmed);
    if (!Number.isInteger(rollNumber) || rollNumber <= 0) {
      setDeleteError("Roll number must be a positive whole number.");
      return;
    }

    const target = students.find((student) => student.roll_no === rollNumber);
    if (!target) {
      setDeleteError("No student with that roll number in your roster.");
      return;
    }

    setDeleting(true);

    try {
      const url = new URL(buildApiUrl("/students"));
      url.searchParams.set("teacher_id", teacherId);
      url.searchParams.set("roll_no", rollNumber.toString());

      const response = await fetch(url.toString(), { method: "DELETE" });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const failure = new Error(payload.message || "Failed to delete student.");
        throw failure;
      }

      setStudents((prev) => prev.filter((student) => student.id !== target.id));
      await refresh();
      setDeleteRoll("");
      setDeleteMessage(`Removed ${target.name} (Roll ${target.roll_no}).`);
    } catch (err: any) {
      setDeleteError(friendlyError("Unable to delete that student right now.", err));
    } finally {
      setDeleting(false);
    }
  };

  const renderStudent = ({ item }: { item: Student }) => (
    <View style={styles.studentRow}>
      <View style={styles.studentAvatar}>
        <Text style={styles.studentInitial}>{item.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.studentMeta}>
        <Text style={styles.studentName}>{item.name}</Text>
        <Text style={styles.studentRoll}>Roll {item.roll_no}</Text>
      </View>
    </View>
  );

  const rosterHeader = (
    <View style={styles.headerBlock}>
      <Text style={styles.sectionLabel}>Manage roster</Text>
      <Text style={styles.screenTitle}>Keep your student list up to date</Text>
      <Text style={styles.screenSubhead}>
        Add or remove students at any time. Roll numbers stay unique for your account.
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 96 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {rosterHeader}

          {authLoading || loading ? (
            <View style={styles.loaderRow}>
              <ActivityIndicator size="large" color="#1d4ed8" />
            </View>
          ) : error ? (
            <View style={styles.feedbackCard}>
              <Text style={styles.feedbackText}>{error}</Text>
              <Pressable style={styles.retryButton} onPress={loadStudents}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.listCard}>
              <Text style={styles.listTitle}>Current roster</Text>
              {sortedStudents.length === 0 ? (
                <Text style={styles.emptyState}>No students yet. Add your first student below.</Text>
              ) : (
                <FlatList
                  data={sortedStudents}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={renderStudent}
                  scrollEnabled={false}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
              )}
            </View>
          )}

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Add a student</Text>
            <View style={styles.inputRow}>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Roll number</Text>
                <TextInput
                  value={rollInput}
                  onChangeText={setRollInput}
                  placeholder="e.g. 12"
                  keyboardType="number-pad"
                  style={styles.input}
                  returnKeyType="next"
                />
              </View>
              <View style={styles.inputWrapperWide}>
                <Text style={styles.inputLabel}>Student name</Text>
                <TextInput
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Full name"
                  autoCapitalize="words"
                  style={styles.input}
                  returnKeyType="done"
                />
              </View>
            </View>
            {addError ? <Text style={styles.errorText}>{addError}</Text> : null}
            <Pressable
              onPress={handleAdd}
              style={[styles.primaryButton, (adding || authLoading) && styles.buttonDisabled]}
              disabled={adding || authLoading}
            >
              {adding ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Add student</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.formCardDanger}>
            <Text style={styles.formTitle}>Remove a student</Text>
            <Text style={styles.formHint}>
              Enter the roll number to delete the student and their attendance history.
            </Text>
            <View style={styles.inputRow}>
              <View style={styles.inputWrapper}>
                <Text style={styles.inputLabel}>Roll number</Text>
                <TextInput
                  value={deleteRoll}
                  onChangeText={setDeleteRoll}
                  placeholder="e.g. 12"
                  keyboardType="number-pad"
                  style={styles.input}
                  returnKeyType="done"
                />
              </View>
            </View>
            {deleteError ? <Text style={styles.errorText}>{deleteError}</Text> : null}
            {deleteMessage ? <Text style={styles.successText}>{deleteMessage}</Text> : null}
            <Pressable
              onPress={handleDelete}
              style={[styles.dangerButton, (deleting || authLoading) && styles.buttonDisabled]}
              disabled={deleting || authLoading}
            >
              {deleting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.dangerButtonText}>Delete student</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

export default RosterScreen;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 160,
  },
  headerBlock: {
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563eb",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 8,
  },
  screenSubhead: {
    fontSize: 15,
    color: "#475569",
  },
  loaderRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  feedbackCard: {
    backgroundColor: "#f8fafc",
    padding: 20,
    borderRadius: 16,
    marginBottom: 28,
  },
  feedbackText: {
    fontSize: 15,
    color: "#0f172a",
    marginBottom: 12,
  },
  retryButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#2563eb",
  },
  retryText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  listCard: {
    backgroundColor: "#f1f5f9",
    borderRadius: 16,
    padding: 20,
    marginBottom: 28,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: 16,
  },
  emptyState: {
    fontSize: 15,
    color: "#475569",
  },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  studentAvatar: {
    height: 44,
    width: 44,
    borderRadius: 22,
    backgroundColor: "#2563eb10",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  studentInitial: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2563eb",
  },
  studentMeta: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
  },
  studentRoll: {
    fontSize: 14,
    color: "#475569",
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: "#e2e8f0",
  },
  formCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 24,
  },
  formCardDanger: {
    backgroundColor: "#fef2f2",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: 16,
  },
  formHint: {
    fontSize: 14,
    color: "#b91c1c",
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  inputWrapper: {
    flex: 1,
  },
  inputWrapperWide: {
    flex: 1.6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d9e2ec",
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: "#f9fbfd",
    color: "#0f172a",
  },
  errorText: {
    fontSize: 13,
    color: "#b91c1c",
    marginBottom: 12,
  },
  successText: {
    fontSize: 13,
    color: "#0f766e",
    marginBottom: 12,
  },
  primaryButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2563eb",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  dangerButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: "#dc2626",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#b91c1c",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  dangerButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
