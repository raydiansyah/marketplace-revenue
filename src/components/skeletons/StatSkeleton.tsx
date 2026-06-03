/**
 * Module: StatSkeleton
 * Purpose: Loading skeleton for KPI stat tiles
 * Used by: Dashboard, Ads, Cashflow pages
 * Dependencies: None
 * Public functions: StatSkeleton (default export)
 * Side effects: None
 */
"use client";

export default function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid gap-4 animate-pulse"
      style={{ gridTemplateColumns: `repeat(${Math.min(count, 4)}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="panel-card p-5 space-y-3">
          <div className="h-3 w-20 rounded bg-[var(--surface-muted)]" />
          <div className="h-7 w-32 rounded bg-[var(--surface-muted)]" />
          <div className="h-3 w-16 rounded bg-[var(--surface-muted)]" />
        </div>
      ))}
    </div>
  );
}
