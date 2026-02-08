import { Platform } from "react-native";

const ANDROID_LOCALHOST = "http://10.0.2.2:3000";
const IOS_LOCALHOST = "http://localhost:3000";

const DEFAULT_API_BASE = Platform.select({
  android: ANDROID_LOCALHOST,
  ios: IOS_LOCALHOST,
  default: IOS_LOCALHOST,
});

function normalizeBaseUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasProtocol = /^https?:\/\//i.test(trimmed);
  const url = hasProtocol ? trimmed : `https://${trimmed}`;
  return url.replace(/\/$/, "");
}

function requireEnvVar(name: string, value: string | null): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Please define an EXPO_PUBLIC_${name} environment variable before running the app.`
    );
  }
  return value;
}

const resolvedApiBase =
  normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL) ?? normalizeBaseUrl(DEFAULT_API_BASE)!;

export const API_BASE_URL = resolvedApiBase;

export function buildApiUrl(path: string): string {
  const sanitizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${API_BASE_URL}/${sanitizedPath}`;
}

export const SUPABASE_URL = requireEnvVar(
  "SUPABASE_URL",
  normalizeBaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL)
);

export const SUPABASE_ANON_KEY = requireEnvVar(
  "SUPABASE_ANON_KEY",
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? null
);
