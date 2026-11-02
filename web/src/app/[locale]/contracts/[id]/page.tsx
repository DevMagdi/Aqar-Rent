import { ContractDetail } from "@/components/contracts/ContractDetail";
import { RequireAuth } from "@/components/RequireAuth";
import { OwnerShell } from "@/components/OwnerShell";

export default async function ContractPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <OwnerShell><ContractDetail contractId={id} /></OwnerShell>
    </RequireAuth>
  );
}
