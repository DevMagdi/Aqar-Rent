import { OrdersListView } from "@/components/OrdersListView";
import { RequireAuth } from "@/components/RequireAuth";

export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "ar";
  return (
    <RequireAuth>
      <OrdersListView locale={l} />
    </RequireAuth>
  );
}
