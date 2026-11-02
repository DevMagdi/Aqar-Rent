import { ContractsListView } from "@/components/contracts/ContractsListView";
import { RequireAuth } from "@/components/RequireAuth";
import { OwnerShell } from "@/components/OwnerShell";
import { makeT } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "ar";
  return { title: makeT(l)("contracts") };
}

export default async function ContractsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  void locale;
  return (
    <RequireAuth>
      <OwnerShell><ContractsListView /></OwnerShell>
    </RequireAuth>
  );
}
