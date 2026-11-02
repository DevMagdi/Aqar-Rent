// XHR-based upload with real progress events + retry support.
import { getAccess } from "./api";

export function uploadWithProgress(
  path: string,
  formData: FormData,
  onProgress: (pct: number) => void,
): { promise: Promise<unknown>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<unknown>((resolve, reject) => {
    xhr.open("POST", `/api/v1${path}`);
    const token = getAccess();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null);
        } catch {
          resolve(null);
        }
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const d = JSON.parse(xhr.responseText);
          msg = d.message || d.detail || msg;
        } catch {
          /* keep default */
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onabort = () => reject(new Error("Aborted"));
    xhr.send(formData);
  });
  return { promise, abort: () => xhr.abort() };
}
