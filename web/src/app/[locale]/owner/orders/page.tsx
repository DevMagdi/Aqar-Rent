import { OrdersListView } from "@/components/OrdersListView";
import { RequireAuth } from "@/components/RequireAuth";
import { OwnerShell } from "@/components/OwnerShell";

export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "ar";
  return (
    <RequireAuth>
      <OwnerShell><OrdersListView locale={l} /></OwnerShell>
    </RequireAuth>
  );
}
