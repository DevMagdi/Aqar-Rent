import { OwnerDashboard } from "@/components/OwnerDashboard";
import { RequireAuth } from "@/components/RequireAuth";

export default function OwnerPage() {
  return (
    <RequireAuth>
      <OwnerDashboard />
    </RequireAuth>
  );
}
