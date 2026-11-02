import { OwnerDashboard } from "@/components/OwnerDashboard";
import { RequireAuth } from "@/components/RequireAuth";
import { OwnerShell } from "@/components/OwnerShell";

export default function OwnerPage() {
  return (
    <RequireAuth>
      <OwnerShell><OwnerDashboard /></OwnerShell>
    </RequireAuth>
  );
}
