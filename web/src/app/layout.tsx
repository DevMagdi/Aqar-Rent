import type { ReactNode } from "react";
import "@/app/globals.css";

// Root layout: html/body live in [locale]/layout (all pages are locale-prefixed).
export default function RootLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
