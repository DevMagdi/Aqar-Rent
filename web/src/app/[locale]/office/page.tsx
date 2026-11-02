import { OfficeWorkspace } from "@/components/OfficeWorkspace";
import { RequireAuth } from "@/components/RequireAuth";

export default function OfficePage() {
  return (
    <RequireAuth>
      <OfficeWorkspace />
    </RequireAuth>
  );
}
