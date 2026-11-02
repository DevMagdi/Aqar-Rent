import { ListingWizard } from "@/components/ListingWizard";
import { RequireAuth } from "@/components/RequireAuth";
import { OwnerShell } from "@/components/OwnerShell";

export default async function NewListingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "ar";
  return (
    <RequireAuth>
      <OwnerShell><ListingWizard locale={l} /></OwnerShell>
    </RequireAuth>
  );
}
