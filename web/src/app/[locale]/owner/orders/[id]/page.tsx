import { OrderView } from "@/components/OrderView";
import { RequireAuth } from "@/components/RequireAuth";

export default async function OrderDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const l = locale === "en" ? "en" : "ar";
  return (
    <RequireAuth>
      <OrderView locale={l} orderId={id} />
    </RequireAuth>
  );
}
