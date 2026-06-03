/**
 * Module: MobileBottomNav
 * Purpose: 5-slot bottom tab bar for mobile (< lg breakpoint)
 * Used by: AuthAreaLayout (below content, lg:hidden)
 * Dependencies: lucide-react, next/navigation, next/link
 * Public functions: MobileBottomNav (default export)
 * Side effects: None
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Upload,
  PackageSearch,
  FolderKanban,
  MoreHorizontal,
} from "lucide-react";

const TABS = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Upload", href: "/upload", icon: Upload },
  { label: "HPP", href: "/hpp", icon: PackageSearch },
  { label: "Laporan", href: "/reports", icon: FolderKanban },
  { label: "Lainnya", href: "/settings", icon: MoreHorizontal },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--shell-header-bg)] border-t border-[var(--shell-border)] pb-safe-area-inset-bottom">
      <div className="flex items-stretch">
        {TABS.map(({ label, href, icon: Icon }) => {
          const isActive =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 text-[10px] font-medium transition-colors ${
                isActive
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-subtle)]"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
