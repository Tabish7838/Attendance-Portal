import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import { useAttendance } from "../context/AttendanceContext";
import { useBranch } from "../context/BranchContext";
import SyncStatusIndicator from "../components/SyncStatusIndicator";
import { AppShell, Button, Card } from "../components/ui";
import {
  enqueueOp,
  getStudentLocalByRollNo,
  hydrateStudentsFromServer,
  listStudentsLocal,
  softDeleteStudentLocal,
  upsertStudentLocal,
} from "../offline/repo";
import { isOnline, syncNow } from "../offline/sync";
import { buildApiUrl } from "../env";
import { theme } from "../theme";

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
  const { user, isLoading: authLoading, refreshSession, accessToken } = useAuth();
  const { refresh } = useAttendance();
  const { selectedBranchLocalId, selectedBranch } = useBranch();

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

    if (!selectedBranchLocalId) {
      setStudents([]);
      setLoading(false);
      setError(null);
      return;
    }

    const branchName = selectedBranch?.name ?? null;
    if (!branchName) {
      setStudents([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const online = await isOnline();

      if (online && accessToken) {
        const response = await fetch(
          buildApiUrl(
            `/students?teacher_id=${encodeURIComponent(teacherId)}&branch_name=${encodeURIComponent(branchName)}`
          ),
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (response.ok) {
          const serverStudents: Array<{ id: number; roll_no: number; name: string }> =
            await response.json();
          await hydrateStudentsFromServer({
            teacherId,
            branchLocalId: selectedBranchLocalId,
            students: serverStudents || [],
          });
        }
      }

      const local = await listStudentsLocal(teacherId, selectedBranchLocalId);
      setStudents(local.map((s) => ({ id: s.local_id, roll_no: s.roll_no, name: s.name })));
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
  }, [teacherId, refreshSession, selectedBranchLocalId, selectedBranch?.name]);

  useEffect(() => {
    if (!teacherId) {
      setStudents([]);
      setLoading(false);
      setError(null);
      return;
    }

    loadStudents();
  }, [teacherId, selectedBranchLocalId, loadStudents]);

  const handleAdd = async () => {
    if (!teacherId || !selectedBranchLocalId || adding) return;

    const branchName = selectedBranch?.name ?? null;
    if (!branchName) return;

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

    try {
      const clientUpdatedAt = new Date().toISOString();
      const created = await upsertStudentLocal({
        teacherId,
        branchLocalId: selectedBranchLocalId,
        rollNo: rollNumber,
        name: trimmedName,
        clientUpdatedAt,
      });

      await enqueueOp({
        entity: "student",
        recordId: String(created.local_id),
        opType: created.server_id ? "update" : "create",
        payload: {
          id: created.server_id ?? undefined,
          roll_no: created.roll_no,
          name: created.name,
          branch_name: branchName,
        },
        clientUpdatedAt,
      });

      const local = await listStudentsLocal(teacherId, selectedBranchLocalId);
      setStudents(local.map((s) => ({ id: s.local_id, roll_no: s.roll_no, name: s.name })));

      const online = await isOnline();
      if (online && accessToken) {
        await syncNow({ accessToken, teacherId });
        await refresh();
      }

      setRollInput("");
      setNameInput("");
      Keyboard.dismiss();
    } catch (err: any) {
      setAddError(friendlyError("Unable to add student. Please try again.", err));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!teacherId || !selectedBranchLocalId || deleting) return;

    const branchName = selectedBranch?.name ?? null;
    if (!branchName) return;

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

    setDeleting(true);

    try {
      const target = await getStudentLocalByRollNo({
        teacherId,
        branchLocalId: selectedBranchLocalId,
        rollNo: rollNumber,
      });
      if (!target || target.is_deleted) {
        setDeleteError("No student with that roll number in your roster.");
        return;
      }

      const clientUpdatedAt = new Date().toISOString();
      await softDeleteStudentLocal({ teacherId, localId: target.local_id, clientUpdatedAt });
      await enqueueOp({
        entity: "student",
        recordId: String(target.local_id),
        opType: "delete",
        payload: {
          id: target.server_id ?? undefined,
          roll_no: target.roll_no,
          branch_name: branchName,
        },
        clientUpdatedAt,
      });

      const local = await listStudentsLocal(teacherId, selectedBranchLocalId);
      setStudents(local.map((s) => ({ id: s.local_id, roll_no: s.roll_no, name: s.name })));

      const online = await isOnline();
      if (online && accessToken) {
        await syncNow({ accessToken, teacherId });
        await refresh();
      }

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
        <AppShell>
          <SyncStatusIndicator />

          {rosterHeader}

          <Card style={styles.formCard}>
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
                  placeholderTextColor={theme.colors.muted}
                  accessibilityLabel="Roll number"
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
                  placeholderTextColor={theme.colors.muted}
                  accessibilityLabel="Student name"
                />
              </View>
            </View>
            {addError ? <Text style={styles.errorText}>{addError}</Text> : null}
            <Button label="Add student" onPress={handleAdd} loading={adding} disabled={authLoading} />
          </Card>

          <Card style={styles.formCardDanger}>
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
                  placeholderTextColor={theme.colors.muted}
                  accessibilityLabel="Roll number to delete"
                />
              </View>
            </View>
            {deleteError ? <Text style={styles.errorText}>{deleteError}</Text> : null}
            {deleteMessage ? <Text style={styles.successText}>{deleteMessage}</Text> : null}
            <Button
              label="Delete student"
              onPress={handleDelete}
              loading={deleting}
              disabled={authLoading}
              variant="danger"
            />
          </Card>

          {authLoading || loading ? (
            <View style={styles.loaderRow}>
              <ActivityIndicator size="large" color={theme.colors.text} />
            </View>
          ) : error ? (
            <Card style={styles.feedbackCard}>
              <Text style={styles.feedbackText}>{error}</Text>
              <Button
                label="Try again"
                onPress={loadStudents}
                variant="secondary"
                style={styles.inlineButton}
              />
            </Card>
          ) : (
            <Card style={styles.listCard}>
              <Text style={styles.listTitle}>Current roster</Text>
              {sortedStudents.length === 0 ? (
                <Text style={styles.emptyState}>No students yet. Add your first student above.</Text>
              ) : (
                <FlatList
                  data={sortedStudents}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={renderStudent}
                  scrollEnabled={false}
                  initialNumToRender={24}
                  maxToRenderPerBatch={24}
                  updateCellsBatchingPeriod={50}
                  windowSize={5}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
              )}
            </Card>
          )}
        </AppShell>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

export default RosterScreen;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  headerBlock: {
    marginBottom: theme.spacing.xl,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.muted,
    marginBottom: theme.spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  screenSubhead: {
    fontSize: 15,
    color: theme.colors.text2,
  },
  loaderRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  feedbackCard: {
    marginBottom: theme.spacing.lg,
  },
  feedbackText: {
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  inlineButton: {
    alignSelf: "flex-start",
  },
  listCard: {
    marginBottom: theme.spacing.lg,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  emptyState: {
    fontSize: 15,
    color: theme.colors.text2,
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
    backgroundColor: theme.colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  studentInitial: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.text,
  },
  studentMeta: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
  },
  studentRoll: {
    fontSize: 14,
    color: theme.colors.muted,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.divider,
  },
  formCard: {
    marginBottom: theme.spacing.lg,
  },
  formCardDanger: {
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  formHint: {
    fontSize: 14,
    color: theme.colors.text2,
    marginBottom: theme.spacing.lg,
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
    color: theme.colors.muted,
    marginBottom: theme.spacing.sm,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
  successText: {
    fontSize: 13,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
