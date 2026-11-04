import { ListingWizard } from "@/components/ListingWizard";
import { RequireAuth } from "@/components/RequireAuth";
import { OwnerShell } from "@/components/OwnerShell";

export default async function EditListingPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const l = locale === "en" ? "en" : "ar";
  return (
    <RequireAuth>
      <OwnerShell>
        <ListingWizard locale={l} editId={id} />
      </OwnerShell>
    </RequireAuth>
  );
}
