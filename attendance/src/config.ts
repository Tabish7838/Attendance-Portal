const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

const getDefaultBaseUrl = () => {
  if (typeof window !== "undefined") {
    const isSecure = window.location.protocol === "https:";
    return isSecure ? "https://localhost:3000" : "http://localhost:3000";
  }
  return "https://localhost:3000";
};

const resolvedBaseUrl = (() => {
  const envUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  if (envUrl) {
    return envUrl;
  }
  return getDefaultBaseUrl();
})();

export const API_BASE_URL = normalizeBaseUrl(resolvedBaseUrl);

export const buildApiUrl = (path: string) => {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
};
