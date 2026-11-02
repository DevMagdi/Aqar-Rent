import { OrderView } from "@/components/OrderView";
import { RequireAuth } from "@/components/RequireAuth";
import { OwnerShell } from "@/components/OwnerShell";

export default async function OrderDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const l = locale === "en" ? "en" : "ar";
  return (
    <RequireAuth>
      <OwnerShell><OrderView locale={l} orderId={id} /></OwnerShell>
    </RequireAuth>
  );
}
