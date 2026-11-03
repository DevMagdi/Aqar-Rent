"use client";
// Edit view: fetch the draft contract, then open the wizard prefilled.
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { ContractWizard } from "@/components/contracts/ContractWizard";
import { RequireAuth } from "@/components/RequireAuth";
import { OwnerShell } from "@/components/OwnerShell";
import { useI18n } from "@/components/Providers";
import type { Contract } from "@/lib/contracts";

function EditInner({ id }: { id: string }) {
  const { t } = useI18n();
  const [contract, setContract] = useState<Contract | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Contract>(`/contracts/${id}`)
      .then((c) => {
        if (c.status !== "draft") {
          setErr(t("cstatus." + c.status));
          return;
        }
        setContract(c);
      })
      .catch((e) => setErr(e instanceof ApiError ? e.message : t("error_generic")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (err)
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-danger/20 bg-danger-bg p-6 text-center text-sm text-danger" role="alert">
        {err}
      </div>
    );
  if (!contract) return <div className="mx-auto h-96 max-w-3xl animate-pulse rounded-3xl bg-track" />;
  return <ContractWizard editContract={contract} />;
}

export default function EditContractPage() {
  const params = useParams<{ id: string }>();
  return (
    <RequireAuth>
      <OwnerShell>
        <EditInner id={params.id} />
      </OwnerShell>
    </RequireAuth>
  );
}
