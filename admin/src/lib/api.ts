// Admin API client: bearer token in localStorage, JSON helpers, 401 → login.
const TOKEN_KEY = "aqar.admin.token";
const ROLE_KEY = "aqar.admin.role";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function getRole(): string | null {
  return localStorage.getItem(ROLE_KEY);
}
export function saveSession(token: string, role: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ROLE_KEY, role);
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = "ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(
  path: string,
  opts: Omit<RequestInit, "body"> & { body?: unknown; formData?: FormData } = {},
): Promise<T> {
  const { formData, headers, ...rest } = opts;
  const h = new Headers(headers);
  const token = getToken();
  if (token) h.set("Authorization", `Bearer ${token}`);
  let body: BodyInit | undefined;
  if (formData) {
    body = formData; // browser sets the multipart boundary
  } else if (rest.body !== undefined) {
    h.set("Content-Type", "application/json");
    body = JSON.stringify(rest.body);
  }
  const res = await fetch(`/api/v1${path}`, { ...rest, headers: h, body });
  if (res.status === 401) {
    clearSession();
    if (!location.pathname.startsWith("/login")) location.href = "/login";
    throw new ApiError(401, "Session expired");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const d = (data ?? {}) as { code?: string; message?: string; detail?: string };
    throw new ApiError(res.status, d.message || d.detail || `Request failed (${res.status})`, d.code || "ERROR");
  }
  return data as T;
}
