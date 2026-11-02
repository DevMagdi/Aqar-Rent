import { VerificationView } from "@/components/VerificationView";
import { RequireAuth } from "@/components/RequireAuth";

export default function VerificationPage() {
  return (
    <RequireAuth>
      <VerificationView />
    </RequireAuth>
  );
}
