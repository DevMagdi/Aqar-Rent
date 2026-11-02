"use client";
// Owner contact box: Call + WhatsApp — login required, backend logs the event.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth, useI18n, useToast } from "./Providers";
import { normalizePhone, telHref, waHref } from "@/lib/utils";
import type { ContactInfo } from "@/lib/types";

export function ContactBox({ listingId, ownerName }: { listingId: string; ownerName?: string | null }) {
  const { locale, t } = useI18n();
  const { user, ready } = useAuth();
  const toast = useToast();
  const pathname = usePathname() || `/${locale}`;
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [loading, setLoading] = useState(false);

  async function reveal(channel: "call" | "whatsapp") {
    if (!user) {
      toast.show(t("login_required"), "err");
      return;
    }
    setLoading(true);
    try {
      const c = await api<ContactInfo>(`/listings/${listingId}/contact?channel=${channel}`, { anonymous: false });
      setContact(c);
      if (channel === "call") window.location.href = telHref(c.phone);
      else window.location.href = waHref(c.phone, t("contact_owner"));
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : t("error_generic"), "err");
    } finally {
      setLoading(false);
    }
  }

  if (contact) {
    const phone = normalizePhone(contact.phone);
    return (
      <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4" data-testid="contact-revealed">
        <p className="text-sm font-semibold text-emerald-800">
          {contact.full_name || ownerName || t("owner")}: <span data-testid="owner-phone" dir="ltr">{phone}</span>
        </p>
        <div className="flex gap-2">
          <a href={telHref(phone)} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-center text-sm font-bold text-white hover:bg-emerald-700">
            ☎ {t("call")}
          </a>
          <a
            href={waHref(phone, t("contact_owner"))}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-xl bg-[#25D366] px-3 py-2.5 text-center text-sm font-bold text-white hover:brightness-95"
            data-testid="whatsapp-link"
          >
            {t("whatsapp")}
          </a>
        </div>
      </div>
    );
  }

  if (!ready) return <div className="h-24 animate-pulse rounded-2xl bg-stone-100" />;

  if (!user) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-sm text-stone-600">{t("login_contact")}</p>
        <Link
          href={`/${locale}/login?next=${encodeURIComponent(pathname)}`}
          data-testid="login-for-contact"
          className="mt-3 block rounded-xl bg-brand-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-700"
        >
          {t("nav_login")}
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        data-testid="btn-call"
        disabled={loading}
        onClick={() => reveal("call")}
        className="rounded-xl bg-emerald-600 px-3 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        ☎ {t("call")}
      </button>
      <button
        type="button"
        data-testid="btn-whatsapp"
        disabled={loading}
        onClick={() => reveal("whatsapp")}
        className="rounded-xl bg-[#25D366] px-3 py-3 text-sm font-bold text-white hover:brightness-95 disabled:opacity-60"
      >
        {t("whatsapp")}
      </button>
      {!contact && loading && <p className="col-span-2 text-center text-xs text-stone-500">{t("loading")}</p>}
    </div>
  );
}
