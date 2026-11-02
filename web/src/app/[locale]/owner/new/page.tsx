import { ListingWizard } from "@/components/ListingWizard";
import { RequireAuth } from "@/components/RequireAuth";

export default async function NewListingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "ar";
  return (
    <RequireAuth>
      <ListingWizard locale={l} />
    </RequireAuth>
  );
}
