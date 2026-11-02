"use client";
// Browser API helper: same-origin /api/v1/* (proxied by Next rewrites),
// Bearer tokens in localStorage with a single-flight refresh on 401.

import type { TokenPair } from "./types";

const ACCESS_KEY = "aqar.access";
const REFRESH_KEY = "aqar.refresh";

export function getAccess(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}
export function getRefresh(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}
export function saveTokens(t: TokenPair) {
  localStorage.setItem(ACCESS_KEY, t.access_token);
  localStorage.setItem(REFRESH_KEY, t.refresh_token);
}
export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem("aqar.user");
}
export function saveUser(u: unknown) {
  localStorage.setItem("aqar.user", JSON.stringify(u));
}
export function readUser<T>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("aqar.user");
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refresh_token = getRefresh();
  if (!refresh_token) return false;
  try {
    const res = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token }),
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const tokens = (await res.json()) as TokenPair;
    saveTokens(tokens);
    return true;
  } catch {
    return false;
  }
}

export interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Skip Authorization header (public endpoints). */
  anonymous?: boolean;
  /** FormData passes through untouched. */
  formData?: FormData;
  retryed?: boolean;
}

/** Fetch JSON from the backend proxy. Throws ApiError on non-2xx. */
export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, anonymous, formData, retryed, headers, ...rest } = opts;
  const h = new Headers(headers);
  if (!formData && body !== undefined && !(body instanceof FormData)) {
    h.set("Content-Type", "application/json");
  }
  if (!anonymous) {
    const token = getAccess();
    if (token) h.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`/api/v1${path}`, {
    ...rest,
    headers: h,
    body: formData ?? (body !== undefined && !(body instanceof FormData) ? JSON.stringify(body) : undefined),
  });
  if (res.status === 204) return undefined as T;
  if (res.status === 401 && !anonymous && !retryed && getRefresh()) {
    if (!refreshPromise) refreshPromise = refreshTokens().finally(() => (refreshPromise = null));
    const ok = await refreshPromise;
    if (ok) return api<T>(path, { ...opts, retryed: true });
    clearTokens();
    throw new ApiError(401, "SESSION_EXPIRED", "Session expired, please log in again");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const d = (data ?? {}) as { code?: string; message?: string; detail?: string; details?: Record<string, unknown> };
    throw new ApiError(
      res.status,
      d.code || "ERROR",
      d.message || d.detail || `Request failed (${res.status})`,
      d.details,
    );
  }
  return data as T;
}
