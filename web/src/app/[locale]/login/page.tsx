import { Suspense } from "react";
import { LoginView } from "@/components/LoginView";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md h-64 animate-pulse rounded-3xl bg-surface-2" />}>
      <LoginView />
    </Suspense>
  );
}
