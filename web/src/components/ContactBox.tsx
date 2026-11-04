"use client";
// Owner contact box: Call + WhatsApp — login required, backend logs the event.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth, useI18n, useToast } from "./Providers";
import { normalizePhone, telHref, waHref } from "@/lib/utils";
import type { ContactInfo } from "@/lib/types";
import { Icon } from "./Icon";

export function ContactBox({ listingId, ownerName, variant = "default" }: { listingId: string; ownerName?: string | null; variant?: "default" | "dock" }) {
  const dock = variant === "dock";
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
      <div className="space-y-2 rounded-2xl border border-success/20 bg-success-bg p-4" data-testid={dock ? "contact-revealed-dock" : "contact-revealed"}>
        <p className="text-sm font-semibold text-success">
          {contact.full_name || ownerName || t("owner")}: <span data-testid="owner-phone" dir="ltr">{phone}</span>
        </p>
        <div className="flex gap-2">
          <a href={telHref(phone)} className={`press focus-ring flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-bold transition-colors duration-150 ${dock ? "bg-brand text-on-dark hover:bg-network" : "bg-success text-on-dark hover:bg-success/90"}`} data-testid={dock ? "btn-call-dock-link" : undefined}>
            <Icon name="phone" size={15} />
            {t("call")}
          </a>
          <a
            href={waHref(phone, t("contact_owner"))}
            target="_blank"
            rel="noopener noreferrer"
            className={`press focus-ring flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-bold transition-colors duration-150 ${dock ? "bg-gold text-gold-text hover:bg-gold-light" : "bg-whatsapp text-gold-text hover:brightness-95"}`}
            data-testid={dock ? "btn-whatsapp-dock-link" : "whatsapp-link"}
          >
            {t("whatsapp")}
          </a>
        </div>
      </div>
    );
  }

  if (!ready) return <div className="skeleton h-24" aria-label={t("loading")} />;

  if (!user) {
    return (
      <div className="rounded-2xl border border-border bg-bg p-4">
        <p className="text-sm text-muted">{t("login_contact")}</p>
        <Link
          href={`/${locale}/login?next=${encodeURIComponent(pathname)}`}
          data-testid={dock ? "login-for-contact-dock" : "login-for-contact"}
          className="press focus-ring mt-3 block rounded-xl bg-gold px-4 py-2.5 text-center text-sm font-semibold text-gold-text hover:bg-gold-light"
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
        data-testid={dock ? "btn-call-dock" : "btn-call"}
        disabled={loading}
        onClick={() => reveal("call")}
        className={`press focus-ring rounded-xl px-3 py-3 text-sm font-bold transition-colors duration-150 disabled:opacity-60 ${dock ? "bg-brand text-on-dark hover:bg-network" : "bg-success text-on-dark hover:bg-success/90"}`}
      >
        <Icon name="phone" size={15} />
        {t("call")}
      </button>
      <button
        type="button"
        data-testid={dock ? "btn-whatsapp-dock" : "btn-whatsapp"}
        disabled={loading}
        onClick={() => reveal("whatsapp")}
        className={`press focus-ring rounded-xl px-3 py-3 text-sm font-bold transition-colors duration-150 disabled:opacity-60 ${dock ? "bg-gold text-gold-text hover:bg-gold-light" : "bg-whatsapp text-gold-text hover:brightness-95"}`}
      >
        {t("whatsapp")}
      </button>
      {!contact && loading && <p className="col-span-2 text-center text-xs text-muted">{t("loading")}</p>}
    </div>
  );
}
