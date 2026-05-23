/**
 * Module: AppSidebar
 * Purpose: Primary navigation sidebar — desktop persistent, mobile overlay
 * Used by: AuthAreaLayout
 * Dependencies: useAuth, next/navigation, lucide-react, ThemeToggle
 * Public functions: AppSidebar (default export)
 * Side effects: Reads auth state; triggers logout on button click
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Wallet,
  FolderKanban,
  Settings,
  HelpCircle,
  Users,
  LogOut,
  ShieldCheck,
  ChevronRight,
  PackageSearch,
  Database,
  FilePlus,
  Megaphone,
  Banknote,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import ThemeToggle from "@/components/ThemeToggle";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  match: (pathname: string, hash: string) => boolean;
};

const mainNavItems: NavItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: LayoutDashboard,
    match: (pathname) => pathname === "/dashboard",
  },
  {
    label: "Modul Pendapatan",
    href: "/upload",
    icon: Wallet,
    match: (pathname) => pathname === "/upload",
  },
  {
    label: "Bank Data",
    href: "/data-bank",
    icon: Database,
    match: (pathname) => pathname === "/data-bank",
  },
  {
    label: "Iklan & ROAS",
    href: "/ads",
    icon: Megaphone,
    match: (pathname) => pathname === "/ads",
  },
  {
    label: "Kas Keuangan",
    href: "/cashflow",
    icon: Banknote,
    match: (pathname) => pathname === "/cashflow",
  },
  {
    label: "Manajemen HPP",
    href: "/hpp",
    icon: PackageSearch,
    match: (pathname) => pathname === "/hpp",
  },
  {
    label: "Buat Laporan",
    href: "/reports/new",
    icon: FilePlus,
    match: (pathname) => pathname === "/reports/new",
  },
  {
    label: "Laporan Tersimpan",
    href: "/reports",
    icon: FolderKanban,
    match: (pathname) => pathname === "/reports",
  },
];

const utilityNavItems: NavItem[] = [
  {
    label: "Pengaturan",
    href: "/settings",
    icon: Settings,
    match: (pathname) => pathname === "/settings",
  },
  {
    label: "Bantuan",
    href: "/",
    icon: HelpCircle,
    match: (pathname) => pathname === "/",
  },
];

const roleBadgeStyle: Record<string, string> = {
  superadmin: "bg-purple-100 text-purple-700",
  admin: "bg-blue-100 text-blue-700",
  finance: "bg-green-100 text-green-700",
};

const roleLabel: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  finance: "Finance",
};

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`w-full text-left px-3 py-2.5 rounded-xl inline-flex items-center gap-2.5 transition-all ${
        isActive
          ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] border border-[var(--sidebar-active-border)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
          : "text-[var(--sidebar-text)] hover:bg-[var(--surface-soft)]"
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export default function AppSidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const [currentHash, setCurrentHash] = useState("");
  const { user, loading, logout } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncHash = () => setCurrentHash(window.location.hash || "");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathname]);

  if (loading || !user) return null;

  const activeMainIndex = mainNavItems.findIndex((item) => item.match(pathname, currentHash));
  const activeUtilityIndex = utilityNavItems.findIndex((item) => item.match(pathname, currentHash));
  const isAdminActive = pathname.startsWith("/admin");

  const sidebarContent = (
    <>
      <div className="mb-4">
        <p className="text-[11px] tracking-[0.14em] text-[var(--sidebar-muted)] uppercase">Admin Panel</p>
        <p className="text-lg leading-none font-bold text-[var(--sidebar-title)] mt-1">FinArchitect</p>
      </div>

      <div className="mb-2 rounded-xl border border-[var(--sidebar-section-border)] bg-[var(--sidebar-section-bg)] p-2.5">
        <p className="text-[11px] tracking-[0.12em] text-[var(--sidebar-muted)] uppercase">General</p>
      </div>
      <nav className="space-y-1.5 text-sm">
        {mainNavItems.map((item, index) => (
          <div key={`${item.href}-${item.label}`} onClick={onClose}>
            <NavLink item={item} isActive={index === activeMainIndex} />
          </div>
        ))}

        {user.role === "superadmin" && (
          <>
            <Link
              href="/admin/users"
              className={`w-full text-left px-3 py-2.5 rounded-xl inline-flex items-center gap-2.5 transition-all ${
                pathname === "/admin/users"
                  ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] border border-[var(--sidebar-active-border)]"
                  : "text-[var(--sidebar-text)] hover:bg-[var(--surface-soft)]"
              }`}
              onClick={onClose}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Manajemen User</span>
            </Link>
            <Link
              href="/admin/ai"
              className={`w-full text-left px-3 py-2.5 rounded-xl inline-flex items-center gap-2.5 transition-all ${
                pathname === "/admin/ai"
                  ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] border border-[var(--sidebar-active-border)]"
                  : "text-[var(--sidebar-text)] hover:bg-[var(--surface-soft)]"
              }`}
              onClick={onClose}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Manajemen AI</span>
            </Link>
          </>
        )}
      </nav>

      <div className="mt-5 mb-2 rounded-xl border border-[var(--sidebar-section-border)] bg-[var(--sidebar-section-bg)] p-2.5">
        <p className="text-[11px] tracking-[0.12em] text-[var(--sidebar-muted)] uppercase">Support</p>
      </div>
      <div className="space-y-1.5 text-sm">
        {utilityNavItems.map((item, index) => (
          <div key={`${item.href}-${item.label}`} onClick={onClose}>
            <NavLink item={item} isActive={index === activeUtilityIndex} />
          </div>
        ))}
      </div>

      <div className="mt-auto space-y-2 pt-5 border-t border-[var(--sidebar-section-border)]">
        <div className="px-3 py-2.5 rounded-xl border border-[var(--sidebar-section-border)] bg-[var(--surface)]">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--sidebar-title)] truncate">{user.name}</p>
              <p className="text-[11px] text-[var(--sidebar-muted)] truncate">{user.email}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--sidebar-muted)] shrink-0" />
          </div>
          <div className="mt-2 inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--sidebar-active-text)]" />
            <span
              className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                roleBadgeStyle[user.role] ?? "bg-slate-100 text-slate-600"
              }`}
            >
              {roleLabel[user.role] ?? user.role}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-[var(--sidebar-muted)]">Tema</span>
          <ThemeToggle compact />
        </div>
        <button
          onClick={() => {
            onClose?.();
            logout();
          }}
          className="w-full text-left px-3 py-2.5 rounded-xl inline-flex items-center gap-2 text-red-500 hover:bg-red-50 transition-colors border border-red-100"
        >
          <LogOut className="w-4 h-4" /> Keluar
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside className="hidden lg:flex w-[255px] shrink-0 border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] min-h-screen p-4 flex-col">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            aria-label="Tutup sidebar"
          />
          <aside className="relative z-[61] h-full w-[82%] max-w-[320px] border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] p-4 flex flex-col shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
