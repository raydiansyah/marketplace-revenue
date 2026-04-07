"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Upload, Settings, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/settings", label: "Pengaturan Fee", icon: Settings },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="bg-white/90 border-b border-slate-200 sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="font-extrabold tracking-tight text-slate-800 text-lg">
            RevCalc
          </Link>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
                  pathname === href
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-white hover:text-slate-800"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
