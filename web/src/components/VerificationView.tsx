"use client";
// Verification upload: doc type + file (≤8MB jpeg/png/webp/pdf), status list.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { EmptyState, ErrorState, StatusBadge } from "./ui";
import { useAuth, useI18n, useToast } from "./Providers";
import { formatDateTime } from "@/lib/utils";
import type { VerificationList } from "@/lib/types";

const DOC_TYPES = ["electricity_bill", "water_bill", "ownership_contract", "id_authorization"];

export function VerificationView() {
  const { locale, t } = useI18n();
  const { refreshUser } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<VerificationList | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    setErr(null);
    api<VerificationList>("/me/verification")
      .then(setData)
      .catch((e) => setErr(e instanceof ApiError ? e.message : t("error_generic")));
  }, [t]);
  useEffect(load, [load]);

  async function upload(e?: React.FormEvent) {
    e?.preventDefault();
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("doc_type", docType);
      fd.append("file", file);
      await api("/me/verification", { method: "POST", formData: fd });
      toast.show(t("saved"));
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await refreshUser();
      load();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : t("error_generic"));
    } finally {
      setBusy(false);
    }
  }

  const vstatus = data?.user_verification_status || "unverified";
  const label = t(`vstatus.${vstatus}`) !== `vstatus.${vstatus}` ? t(`vstatus.${vstatus}`) : vstatus;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="rounded-3xl border border-stone-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-stone-900">{t("verification")}</h1>
          <StatusBadge status={vstatus} label={label} />
        </div>
        <p className="mt-2 text-sm text-stone-600">{t("verification_sub")}</p>

        <form onSubmit={upload} className="mt-5 space-y-4" data-testid="verification-form">
          <div>
            <label className="text-sm font-semibold text-stone-700" htmlFor="doc-type">
              {t("doc_type")}
            </label>
            <select
              id="doc-type"
              data-testid="select-doc-type"
              className="mt-1 w-full rounded-xl border border-stone-300 px-4 py-3 text-sm"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              {DOC_TYPES.map((d) => (
                <option key={d} value={d}>
                  {t(`doc.${d}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-stone-700" htmlFor="doc-file">
              {t("upload_doc")}
            </label>
            <input
              id="doc-file"
              ref={inputRef}
              data-testid="input-doc-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="mt-1 block w-full text-sm text-stone-600 file:me-3 file:rounded-xl file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="mt-1 text-xs text-stone-400">JPEG / PNG / WebP / PDF · ≤ 8 MB</p>
          </div>
          {err && (
            <p role="alert" className="text-sm text-red-600" data-testid="verification-error">
              {err}
            </p>
          )}
          <button
            type="submit"
            data-testid="btn-upload-doc"
            disabled={!file || busy}
            className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? t("uploading") : t("upload_doc")}
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white p-6">
        <h2 className="font-bold text-stone-900">{t("verify_status")}</h2>
        {err && !data ? (
          <ErrorState message={err} onRetry={load} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title={t("empty")} />
        ) : (
          <ul className="mt-3 space-y-3" data-testid="verification-list">
            {data.items.map((v) => (
              <li key={v.id} className="rounded-2xl border border-stone-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-stone-800">{t(`doc.${v.doc_type}`)}</p>
                  <StatusBadge status={v.status} label={v.status} />
                </div>
                <p className="mt-1 text-xs text-stone-500">{formatDateTime(v.created_at, locale)}</p>
                {v.reject_reason && <p className="mt-1 text-xs text-red-600">{t("rejected_reason")}: {v.reject_reason}</p>}
                {v.file_url && (
                  <a href={v.file_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-brand-600 hover:underline">
                    ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
