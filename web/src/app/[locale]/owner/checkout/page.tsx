import { CheckoutView } from "@/components/CheckoutView";
import { RequireAuth } from "@/components/RequireAuth";
import { OwnerShell } from "@/components/OwnerShell";

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "ar";
  return (
    <RequireAuth>
      <OwnerShell><CheckoutView locale={l} /></OwnerShell>
    </RequireAuth>
  );
}
