import { AccountView } from "@/components/AccountView";
import { RequireAuth } from "@/components/RequireAuth";

export default function AccountPage() {
  return (
    <RequireAuth>
      <AccountView />
    </RequireAuth>
  );
}
