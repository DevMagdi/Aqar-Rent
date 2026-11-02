// Router: login outside the shell, everything else role-gated inside it.
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { getToken, getRole } from "@/lib/api";
import { Shell } from "@/components/Shell";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Moderation } from "@/pages/Moderation";
import { Verifications } from "@/pages/Verifications";
import { Reports } from "@/pages/Reports";
import { Users } from "@/pages/Users";
import { Payments } from "@/pages/Payments";
import { BankTransfers } from "@/pages/BankTransfers";
import { Plans } from "@/pages/Plans";
import { StaffPage } from "@/pages/Staff";
import { AuditLog } from "@/pages/AuditLog";
import { Settings } from "@/pages/Settings";
import { NAV } from "@/components/Shell";

function Guard({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  if (!getToken()) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  const role = getRole() || "";
  const allowed = NAV.find((n) => loc.pathname === n.to);
  if (allowed && !allowed.roles.includes(role)) return <Navigate to="/" replace />;
  return <Shell>{children}</Shell>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Guard><Dashboard /></Guard>} />
      <Route path="/moderation" element={<Guard><Moderation /></Guard>} />
      <Route path="/verifications" element={<Guard><Verifications /></Guard>} />
      <Route path="/reports" element={<Guard><Reports /></Guard>} />
      <Route path="/users" element={<Guard><Users /></Guard>} />
      <Route path="/payments" element={<Guard><Payments /></Guard>} />
      <Route path="/bank-transfers" element={<Guard><BankTransfers /></Guard>} />
      <Route path="/plans" element={<Guard><Plans /></Guard>} />
      <Route path="/staff" element={<Guard><StaffPage /></Guard>} />
      <Route path="/audit" element={<Guard><AuditLog /></Guard>} />
      <Route path="/settings" element={<Guard><Settings /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
