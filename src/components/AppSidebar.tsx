"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Wallet,
  HandCoins,
  FolderKanban,
  Settings,
  HelpCircle,
} from "lucide-react";

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
    match: (pathname, hash) => pathname === "/upload" && hash !== "#hpp-manager",
  },
  {
    label: "Manajemen HPP",
    href: "/upload#hpp-manager",
    icon: HandCoins,
    match: (pathname, hash) => pathname === "/upload" && hash === "#hpp-manager",
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

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={`w-full text-left px-3 py-2 rounded-lg inline-flex items-center gap-2 transition-colors ${
        isActive
          ? "bg-blue-50 text-blue-700 border border-blue-100"
          : "text-slate-500 hover:bg-slate-50"
      }`}
    >
      <Icon className="w-4 h-4" /> {item.label}
    </Link>
  );
}

export default function AppSidebar() {
  const pathname = usePathname();
  const [currentHash, setCurrentHash] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncHash = () => setCurrentHash(window.location.hash || "");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathname]);

  const activeMainIndex = mainNavItems.findIndex((item) => item.match(pathname, currentHash));
  const activeUtilityIndex = utilityNavItems.findIndex((item) => item.match(pathname, currentHash));

  return (
    <aside className="hidden lg:flex w-64 shrink-0 border-r border-slate-200 bg-white min-h-screen p-4 flex-col">
      <p className="text-[11px] tracking-widest text-slate-400 uppercase">Admin Panel</p>
      <p className="text-sm font-semibold text-slate-700 mb-4">FinArchitect</p>

      <nav className="space-y-1 text-sm">
        {mainNavItems.map((item, index) => (
          <NavLink key={`${item.href}-${item.label}`} item={item} isActive={index === activeMainIndex} />
        ))}
      </nav>

      <div className="mt-auto space-y-2 pt-6 border-t border-slate-100 text-sm">
        {utilityNavItems.map((item, index) => (
          <NavLink key={`${item.href}-${item.label}`} item={item} isActive={index === activeUtilityIndex} />
        ))}
      </div>
    </aside>
  );
}
