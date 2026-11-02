import { ContractWizard } from "@/components/contracts/ContractWizard";
import { RequireAuth } from "@/components/RequireAuth";
import { makeT } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "ar";
  return { title: makeT(l)("new_contract") };
}

export default async function NewContractPage({ params }: { params: Promise<{ locale: string }> }) {
  await params;
  return (
    <RequireAuth>
      <ContractWizard />
    </RequireAuth>
  );
}
