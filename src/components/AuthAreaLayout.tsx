/**
 * Module: AuthAreaLayout
 * Purpose: Authenticated area shell — sidebar + header + content + mobile bottom nav
 * Used by: All authenticated pages (/dashboard, /upload, /reports, /settings, etc.)
 * Dependencies: AppSidebar, MobileBottomNav, next/navigation, lucide-react
 * Public functions: AuthAreaLayout (default export)
 * Side effects: None
 */
"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import { cn } from "@/lib/utils";

interface AuthAreaLayoutProps {
  children: ReactNode;
  contentClassName?: string;
}

export default function AuthAreaLayout({
  children,
  contentClassName,
}: AuthAreaLayoutProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div className="auth-skin min-h-screen bg-[var(--shell-bg)] flex">
      <AppSidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 border-b border-[var(--shell-border)] bg-[var(--shell-header-bg)] px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--shell-title)] hover:bg-[var(--surface-soft)] lg:hidden"
              aria-label="Buka menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold text-[var(--shell-title)]">FinArchitect Workspace</p>
          </div>
          <p className="text-xs text-[var(--shell-subtle)]">Login Area</p>
        </header>

        {/* Content with bottom padding for mobile nav */}
        <section className={cn("flex-1 pb-16 lg:pb-0", contentClassName)}>
          {children}
        </section>

        <footer className="hidden lg:flex border-t border-[var(--shell-border)] bg-[var(--shell-header-bg)] px-4 sm:px-6 lg:px-8 py-3 text-xs text-[var(--shell-subtle)] items-center justify-between">
          <span>© {new Date().getFullYear()} FinArchitect</span>
          <span>Marketplace Revenue System</span>
        </footer>
      </main>

      <MobileBottomNav />
    </div>
  );
}
