/**
 * Module: StatTile
 * Purpose: KPI stat tile with label, value, optional delta badge
 * Used by: /dashboard page, /ads page
 * Dependencies: lucide-react
 * Public functions: StatTile (default export)
 * Side effects: None
 */
"use client";

import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatTileProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  delta?: number; // percentage change vs previous period
  format?: "currency" | "number" | "percent" | "raw";
  accentColor?: string; // CSS color for icon background
}

export default function StatTile({
  label,
  value,
  icon: Icon,
  delta,
  accentColor,
}: StatTileProps) {
  const hasDelta = delta !== undefined && delta !== null;
  const isPositive = (delta ?? 0) >= 0;

  return (
    <div className="stat-tile">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[var(--text-subtle)] truncate">{label}</p>
          <p className="text-2xl font-bold text-[var(--foreground)] mt-1 tabular-nums leading-none">
            {typeof value === "number" ? value.toLocaleString("id-ID") : value}
          </p>
        </div>
        {Icon && (
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: accentColor ?? "var(--accent-soft)" }}
          >
            <Icon
              className="w-5 h-5"
              style={{ color: accentColor ? "white" : "var(--accent)" }}
            />
          </div>
        )}
      </div>
      {hasDelta && (
        <div
          className={`inline-flex items-center gap-1 mt-2 ${
            isPositive ? "badge-positive" : "badge-negative"
          }`}
        >
          {isPositive ? (
            <TrendingUp className="w-3 h-3" />
          ) : (
            <TrendingDown className="w-3 h-3" />
          )}
          <span>{Math.abs(delta!).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}
