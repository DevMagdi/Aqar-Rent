"use client";
// Favorite / share / report actions for the detail page.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth, useI18n, useToast } from "./Providers";

const REPORT_REASONS = ["fraud", "broker", "duplicate", "wrong_info", "scam", "inappropriate", "other"];

export function FavoriteButton({ listingId }: { listingId: string }) {
  const { t } = useI18n();
  const { user, ready } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [fav, setFav] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    api<{ items: { id: string }[] }>(`/favorites?limit=50`, { anonymous: false })
      .then((p) => setFav(p.items.some((i) => i.id === listingId)))
      .catch(() => {});
  }, [user, listingId]);

  async function toggle() {
    if (!ready) return;
    if (!user) {
      toast.show(t("login_required"), "err");
      const pathname = window.location.pathname;
      router.push(`/${t("nav_home") === "الرئيسية" ? "ar" : "en"}/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setBusy(true);
    try {
      if (fav) {
        await api(`/favorites/${listingId}`, { method: "DELETE" });
        setFav(false);
      } else {
        await api(`/favorites/${listingId}`, { method: "PUT" });
        setFav(true);
        toast.show(t("favorite_add"));
      }
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : t("error_generic"), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      data-testid="btn-favorite"
      aria-pressed={fav}
      disabled={busy}
      onClick={toggle}
      className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
        fav ? "border-red-300 bg-red-50 text-red-600" : "border-stone-300 bg-white text-stone-700 hover:border-brand-400"
      }`}
    >
      {fav ? "♥" : "♡"} {fav ? t("favorite_remove") : t("favorite_add")}
    </button>
  );
}

export function ShareButton({ title }: { title: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [href, setHref] = useState("");
  useEffect(() => setHref(window.location.href), []);

  return (
    <button
      type="button"
      data-testid="btn-share"
      onClick={async () => {
        const url = window.location.href;
        if (navigator.share) {
          try {
            await navigator.share({ title, url });
            return;
          } catch {
            /* fall through to copy */
          }
        }
        try {
          await navigator.clipboard.writeText(url);
          toast.show(t("copied"));
        } catch {
          toast.show(url);
        }
      }}
      className="flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700 hover:border-brand-400"
      // eslint-disable-next-line react/no-unknown-property
      data-href={href || undefined}
    >
      🔗 {t("share")}
    </button>
  );
}

export function ReportButton({ listingId }: { listingId: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("fraud");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!user) {
      toast.show(t("login_required"), "err");
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await api(`/listings/${listingId}/report`, { method: "POST", body: { reason, note: note || null } });
      setOpen(false);
      setNote("");
      toast.show(t("report_sent"));
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : t("error_generic"), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="btn-report"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-500 hover:border-red-300 hover:text-red-600"
      >
        ⚑ {t("report")}
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={t("report_title")} className="fixed inset-0 z-[900] grid place-items-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()} data-testid="report-modal">
            <h2 className="text-lg font-bold text-stone-900">{t("report_title")}</h2>
            <label className="mt-4 block text-sm font-medium text-stone-700" htmlFor="rep-reason">
              {t("report")}
            </label>
            <select
              id="rep-reason"
              data-testid="report-reason"
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <label className="mt-3 block text-sm font-medium text-stone-700" htmlFor="rep-note">
              {t("report_note")}
            </label>
            <textarea
              id="rep-note"
              data-testid="report-note"
              rows={3}
              maxLength={1000}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100">
                {t("cancel")}
              </button>
              <button
                type="button"
                data-testid="report-submit"
                disabled={busy}
                onClick={submit}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {t("send")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
