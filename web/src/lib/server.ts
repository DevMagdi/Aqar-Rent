// Server-side fetch helpers (SSR / RSC). Talks to BACKEND_URL directly —
// never through the browser — so CORS and the preview host don't matter.

const BACKEND = process.env.BACKEND_URL || "http://localhost:8000";

export class ServerApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function fetchServer<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.token) headers.set("Authorization", `Bearer ${init.token}`);
  let res: Response;
  try {
    res = await fetch(`${BACKEND}/api/v1${path}`, { ...init, headers, cache: "no-store" });
  } catch (err) {
    throw new ServerApiError(503, "BACKEND_UNREACHABLE", `Backend unreachable: ${(err as Error).message}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const d = (data ?? {}) as { code?: string; message?: string; detail?: string };
    throw new ServerApiError(res.status, d.code || "ERROR", d.message || d.detail || `Request failed (${res.status})`);
  }
  return data as T;
}

/** Backend media URLs (`/api/v1/files/...`) for next/image on the server. */
export function backendMediaUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return url.startsWith("/") ? `${BACKEND}${url}` : `${BACKEND}/${url}`;
}
