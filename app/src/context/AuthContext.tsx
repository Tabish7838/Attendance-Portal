import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { Session, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "../lib/supabase";

const STORAGE_KEY = "attendance-auth-session";

type AuthContextValue = {
  user: Session["user"] | null;
  session: Session | null;
  accessToken: string | null;
  isLoading: boolean;
  signIn: (params: { email: string; password: string }) => Promise<void>;
  requestEmailOtp: (params: { email: string; name?: string }) => Promise<void>;
  verifyEmailOtp: (params: { email: string; code: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  client: SupabaseClient;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const loadSessionFromSecureStore = async (): Promise<Session | null> => {
  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as Session;
  } catch (error) {
    console.warn("Failed to parse stored session", error);
    return null;
  }
};

const persistSession = async (session: Session | null) => {
  try {
    if (!session) {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
      return;
    }
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    console.warn("Unable to persist auth session", error);
  }
};

type AuthProviderProps = {
  children: ReactNode;
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const initialise = async () => {
      setIsLoading(true);

      try {
        const persisted = await loadSessionFromSecureStore();

        if (persisted?.access_token && persisted?.refresh_token) {
          const { data, error } = await supabase.auth.setSession({
            access_token: persisted.access_token,
            refresh_token: persisted.refresh_token,
          });

          if (!error && data.session && mounted) {
            setSession(data.session);
          }
        }

        const {
          data: { session: currentSession },
          error,
        } = await supabase.auth.getSession();

        if (mounted) {
          if (!error && currentSession) {
            setSession(currentSession);
            await persistSession(currentSession);
          } else if (!currentSession) {
            await persistSession(null);
          }
        }
      } catch (error) {
        if (__DEV__) {
          console.warn("Auth initialise failed", error);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initialise();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      if (newSession) {
        setSession(newSession);
        persistSession(newSession);
      } else {
        setSession(null);
        persistSession(null);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn: AuthContextValue["signIn"] = async ({ email, password }) => {
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.session) {
      setSession(data.session);
      await persistSession(data.session);
    }
  };

  const requestEmailOtp: AuthContextValue["requestEmailOtp"] = async ({ email, name }) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        ...(name
          ? {
              data: {
                name,
              },
            }
          : null),
      },
    });
    if (error) throw error;
  };

  const verifyEmailOtp: AuthContextValue["verifyEmailOtp"] = async ({ email, code }) => {
    const { error, data } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (error) throw error;
    if (data.session) {
      setSession(data.session);
      await persistSession(data.session);
    }
  };

  const signOut: AuthContextValue["signOut"] = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    await persistSession(null);
  };

  const refreshSession: AuthContextValue["refreshSession"] = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) {
      setSession(data.session);
      await persistSession(data.session);
    }
  };

  const value = useMemo<AuthContextValue>(() => {
    const accessToken = session?.access_token ?? null;
    return {
      user: session?.user ?? null,
      session,
      accessToken,
      isLoading,
      signIn,
      requestEmailOtp,
      verifyEmailOtp,
      signOut,
      refreshSession,
      client: supabase,
    };
  }, [session, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
