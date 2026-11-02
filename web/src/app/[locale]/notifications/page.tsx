import { NotificationsView } from "@/components/NotificationsView";
import { RequireAuth } from "@/components/RequireAuth";

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationsView />
    </RequireAuth>
  );
}
