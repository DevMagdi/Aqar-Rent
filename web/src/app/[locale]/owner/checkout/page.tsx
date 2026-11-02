import { CheckoutView } from "@/components/CheckoutView";
import { RequireAuth } from "@/components/RequireAuth";

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "ar";
  return (
    <RequireAuth>
      <CheckoutView locale={l} />
    </RequireAuth>
  );
}
