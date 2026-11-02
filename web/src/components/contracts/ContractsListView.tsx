"use client";
// My contracts list (owner + tenant roles).
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { EmptyState, ErrorState } from "../ui";
import { useI18n } from "../Providers";
import type { Contract } from "@/lib/contracts";

export function ContractsListView() {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<Contract[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Contract[]>("/contracts")
      .then(setItems)
      .catch((e) => setErr(e instanceof ApiError ? e.message : t("error_generic")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (err) return <ErrorState message={err} />;
  if (!items) return <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-stone-200" />)}</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-stone-900" data-testid="contracts-title">
          {t("contracts")}
        </h1>
        <Link href={`/${locale}/contracts/new`} data-testid="btn-new-contract" className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
          + {t("new_contract")}
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={t("contracts_empty")}
          action={
            <Link href={`/${locale}/contracts/new`} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white">
              + {t("new_contract")}
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3" data-testid="contracts-list">
          {items.map((c) => (
            <li key={c.id} data-testid="contract-row" data-status={c.status}>
              <Link
                href={`/${locale}/contracts/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4 hover:shadow-sm"
              >
                <div>
                  <p className="font-bold text-stone-900" dir="ltr">
                    {c.reference_no}
                  </p>
                  <p className="text-sm text-stone-500">
                    {c.listing_title || "—"} · {t(`tpl.${c.template}`)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    c.status === "confirmed"
                      ? "bg-emerald-100 text-emerald-800"
                      : c.status === "pending_confirmation"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-stone-100 text-stone-700"
                  }`}
                >
                  {t(`cstatus.${c.status}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
