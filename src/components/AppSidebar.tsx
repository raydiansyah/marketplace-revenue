/**
 * Module: AppSidebar
 * Purpose: Primary navigation sidebar — desktop persistent (collapsible), mobile overlay
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
  PanelLeftClose,
  PanelLeftOpen,
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

function NavLink({
  item,
  isActive,
  collapsed,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`w-full text-left px-3 py-2.5 rounded-xl inline-flex items-center gap-2.5 transition-all ${
        collapsed ? "justify-center" : ""
      } ${
        isActive
          ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] border border-[var(--sidebar-active-border)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
          : "text-[var(--sidebar-text)] hover:bg-[var(--surface-soft)]"
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export default function AppSidebar({
  mobileOpen = false,
  onClose,
  collapsed = false,
  onToggle,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
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

  const activeMainIndex = mainNavItems.findIndex((item) =>
    item.match(pathname, currentHash)
  );
  const activeUtilityIndex = utilityNavItems.findIndex((item) =>
    item.match(pathname, currentHash)
  );

  const sidebarContent = (
    <>
      {/* Header: logo + collapse toggle */}
      <div className={`mb-4 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && (
          <div>
            <p className="text-[11px] tracking-[0.14em] text-[var(--sidebar-muted)] uppercase">
              Admin Panel
            </p>
            <p className="text-lg leading-none font-bold text-[var(--sidebar-title)] mt-1">
              FinArchitect
            </p>
          </div>
        )}
        {collapsed && (
          <p className="text-sm font-bold text-[var(--sidebar-title)] select-none">FA</p>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden lg:inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--sidebar-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--sidebar-text)] transition-colors"
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* General section */}
      {!collapsed && (
        <div className="mb-2 rounded-xl border border-[var(--sidebar-section-border)] bg-[var(--sidebar-section-bg)] p-2.5">
          <p className="text-[11px] tracking-[0.12em] text-[var(--sidebar-muted)] uppercase">
            General
          </p>
        </div>
      )}
      {collapsed && <div className="mb-2 border-t border-[var(--sidebar-section-border)]" />}

      <nav className="space-y-1.5 text-sm">
        {mainNavItems.map((item, index) => (
          <div key={`${item.href}-${item.label}`} onClick={onClose}>
            <NavLink
              item={item}
              isActive={index === activeMainIndex}
              collapsed={collapsed}
            />
          </div>
        ))}

        {user.role === "superadmin" && (
          <>
            <Link
              href="/admin/users"
              title={collapsed ? "Manajemen User" : undefined}
              onClick={onClose}
              className={`w-full text-left px-3 py-2.5 rounded-xl inline-flex items-center gap-2.5 transition-all ${
                collapsed ? "justify-center" : ""
              } ${
                pathname === "/admin/users"
                  ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] border border-[var(--sidebar-active-border)]"
                  : "text-[var(--sidebar-text)] hover:bg-[var(--surface-soft)]"
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              {!collapsed && <span>Manajemen User</span>}
            </Link>
            <Link
              href="/admin/ai"
              title={collapsed ? "Manajemen AI" : undefined}
              onClick={onClose}
              className={`w-full text-left px-3 py-2.5 rounded-xl inline-flex items-center gap-2.5 transition-all ${
                collapsed ? "justify-center" : ""
              } ${
                pathname === "/admin/ai"
                  ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] border border-[var(--sidebar-active-border)]"
                  : "text-[var(--sidebar-text)] hover:bg-[var(--surface-soft)]"
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              {!collapsed && <span>Manajemen AI</span>}
            </Link>
          </>
        )}
      </nav>

      {/* Support section */}
      <div className="mt-5 mb-2">
        {!collapsed ? (
          <div className="rounded-xl border border-[var(--sidebar-section-border)] bg-[var(--sidebar-section-bg)] p-2.5">
            <p className="text-[11px] tracking-[0.12em] text-[var(--sidebar-muted)] uppercase">
              Support
            </p>
          </div>
        ) : (
          <div className="border-t border-[var(--sidebar-section-border)]" />
        )}
      </div>
      <div className="space-y-1.5 text-sm">
        {utilityNavItems.map((item, index) => (
          <div key={`${item.href}-${item.label}`} onClick={onClose}>
            <NavLink
              item={item}
              isActive={index === activeUtilityIndex}
              collapsed={collapsed}
            />
          </div>
        ))}
      </div>

      {/* Bottom: user card + theme + logout */}
      <div className="mt-auto space-y-2 pt-5 border-t border-[var(--sidebar-section-border)]">
        {!collapsed ? (
          <div className="px-3 py-2.5 rounded-xl border border-[var(--sidebar-section-border)] bg-[var(--surface)]">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--sidebar-title)] truncate">
                  {user.name}
                </p>
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
        ) : (
          <div
            title={`${user.name} (${roleLabel[user.role] ?? user.role})`}
            className="flex justify-center"
          >
            <ShieldCheck className="w-5 h-5 text-[var(--sidebar-active-text)]" />
          </div>
        )}

        {!collapsed && (
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] text-[var(--sidebar-muted)]">Tema</span>
            <ThemeToggle compact />
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center">
            <ThemeToggle compact />
          </div>
        )}

        <button
          onClick={() => {
            onClose?.();
            logout();
          }}
          title={collapsed ? "Keluar" : undefined}
          className={`w-full text-left px-3 py-2.5 rounded-xl inline-flex items-center gap-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors border border-red-100 dark:border-red-500/20 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && "Keluar"}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex shrink-0 border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] min-h-screen p-4 flex-col transition-[width] duration-200 ease-in-out overflow-hidden ${
          collapsed ? "w-16" : "w-[255px]"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            aria-label="Tutup sidebar"
          />
          <aside className="relative z-[61] h-full w-[82%] max-w-[320px] border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] p-4 flex flex-col shadow-2xl overflow-y-auto">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
