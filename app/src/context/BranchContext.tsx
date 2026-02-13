import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { hydrateBranchesFromServer, listBranchesLocal, upsertBranchLocal } from "../offline/repo";
import { isOnline } from "../offline/sync";

export type Branch = {
  local_id: number;
  name: string;
  server_id: number | null;
};

type BranchContextValue = {
  branches: Branch[];
  selectedBranchLocalId: number | null;
  selectedBranch: Branch | null;
  setSelectedBranchLocalId: (localId: number) => Promise<void>;
  createBranch: (name: string) => Promise<{ success: boolean; error?: string }>;
  refreshBranches: () => Promise<void>;
  loading: boolean;
  error: string | null;
};

const BranchContext = createContext<BranchContextValue | undefined>(undefined);

function storageKey(teacherId: string) {
  return `selected_branch_local_id:${teacherId}`;
}

export const BranchProvider = ({ children }: { children: ReactNode }) => {
  const { user, accessToken } = useAuth();
  const teacherId = user?.id ?? null;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchLocalId, setSelectedBranchLocalIdState] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBranches = useCallback(async () => {
    if (!teacherId) {
      setBranches([]);
      setSelectedBranchLocalIdState(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const online = await isOnline();
      if (online && accessToken) {
        const response = await fetch(
          buildApiUrl(`/branches?teacher_id=${encodeURIComponent(teacherId)}`),
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
        if (response.ok) {
          const serverBranches: Array<{ id: number; name: string }> = await response.json();
          await hydrateBranchesFromServer({ teacherId, branches: serverBranches || [] });
        }
      }

      const next = await listBranchesLocal(teacherId);
      setBranches(next);

      if (next.length === 0) {
        setSelectedBranchLocalIdState(null);
        await AsyncStorage.removeItem(storageKey(teacherId));
        return;
      }

      const stored = await AsyncStorage.getItem(storageKey(teacherId));
      const storedId = stored ? Number(stored) : null;
      const fallbackId = next[0]?.local_id ?? null;

      const nextSelected =
        storedId && next.some((b) => b.local_id === storedId) ? storedId : fallbackId;

      setSelectedBranchLocalIdState(nextSelected);
      if (nextSelected != null) {
        await AsyncStorage.setItem(storageKey(teacherId), String(nextSelected));
      }
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Unable to load branches.");
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    void refreshBranches();
  }, [refreshBranches]);

  const setSelectedBranchLocalId = useCallback(
    async (localId: number) => {
      if (!teacherId) return;
      setSelectedBranchLocalIdState(localId);
      await AsyncStorage.setItem(storageKey(teacherId), String(localId));
    },
    [teacherId]
  );

  const createBranch = useCallback(
    async (name: string) => {
      if (!teacherId) return { success: false, error: "Not signed in." };

      const trimmed = name.trim();
      if (!trimmed) return { success: false, error: "Enter a branch name." };

      try {
        const online = await isOnline();
        if (online && accessToken) {
          const response = await fetch(buildApiUrl("/branches"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ name: trimmed }),
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            return {
              success: false,
              error:
                typeof payload?.message === "string" ? payload.message : `Unable to create branch (${response.status}).`,
            };
          }

          const serverBranch: { id: number; name: string } = await response.json();
          const local = await upsertBranchLocal({
            teacherId,
            name: serverBranch.name,
            serverId: serverBranch.id,
            clientUpdatedAt: new Date().toISOString(),
          });
          await setSelectedBranchLocalId(local.local_id);
        } else {
          const local = await upsertBranchLocal({
            teacherId,
            name: trimmed,
            serverId: null,
            clientUpdatedAt: new Date().toISOString(),
          });
          await setSelectedBranchLocalId(local.local_id);
        }

        await refreshBranches();
        return { success: true };
      } catch (e: any) {
        return {
          success: false,
          error: typeof e?.message === "string" ? e.message : "Unable to create branch.",
        };
      }
    },
    [refreshBranches, setSelectedBranchLocalId, teacherId, accessToken]
  );

  const selectedBranch = useMemo(() => {
    if (selectedBranchLocalId == null) return null;
    return branches.find((b) => b.local_id === selectedBranchLocalId) ?? null;
  }, [branches, selectedBranchLocalId]);

  const value = useMemo<BranchContextValue>(
    () => ({
      branches,
      selectedBranchLocalId,
      selectedBranch,
      setSelectedBranchLocalId,
      createBranch,
      refreshBranches,
      loading,
      error,
    }),
    [
      branches,
      selectedBranchLocalId,
      selectedBranch,
      setSelectedBranchLocalId,
      createBranch,
      refreshBranches,
      loading,
      error,
    ]
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
};

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used within a BranchProvider");
  return ctx;
}
