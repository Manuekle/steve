import type { ReactNode } from "react";
import { AppShell } from "@/app/_components/app-shell";

/**
 * Every signed-in route renders inside the shell. It lives here rather than in
 * each page so the sidebar mounts once and stays mounted across navigation —
 * remounting it per page reset the collapsed state, refetched the badges and
 * replayed the entrance animation on every click.
 */
export default function AppLayout({ children }: { readonly children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
