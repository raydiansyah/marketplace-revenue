/**
 * Module: ThemeToggle
 * Purpose: Sun/Monitor/Moon segmented control for light/dark/system theme
 * Used by: AppSidebar (bottom section), login page corner
 * Dependencies: next-themes
 * Public functions: ThemeToggle (default export)
 * Side effects: Sets theme via next-themes (updates <html> class attribute)
 */
"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Monitor, Moon } from "lucide-react";

const OPTIONS = [
  { value: "light", icon: Sun, label: "Terang" },
  { value: "system", icon: Monitor, label: "Sistem" },
  { value: "dark", icon: Moon, label: "Gelap" },
] as const;

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-8 w-24 rounded-lg bg-[var(--surface-muted)] animate-pulse" />;
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg p-0.5 bg-[var(--surface-muted)] border border-[var(--border-subtle)]">
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={label}
          className={`flex items-center justify-center rounded-md transition-all ${
            compact ? "w-6 h-6" : "w-8 h-8"
          } ${
            theme === value
              ? "bg-[var(--surface)] shadow-sm text-[var(--accent)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-subtle)]"
          }`}
        >
          <Icon className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
        </button>
      ))}
    </div>
  );
}
