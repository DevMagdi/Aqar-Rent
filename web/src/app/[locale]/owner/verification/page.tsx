import { VerificationView } from "@/components/VerificationView";
import { RequireAuth } from "@/components/RequireAuth";
import { OwnerShell } from "@/components/OwnerShell";

export default function VerificationPage() {
  return (
    <RequireAuth>
      <OwnerShell><VerificationView /></OwnerShell>
    </RequireAuth>
  );
}
