import { ContractDetail } from "@/components/contracts/ContractDetail";
import { RequireAuth } from "@/components/RequireAuth";

export default async function ContractPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <ContractDetail contractId={id} />
    </RequireAuth>
  );
}
