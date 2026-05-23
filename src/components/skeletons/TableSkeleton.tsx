/**
 * Module: TableSkeleton
 * Purpose: Loading skeleton for table data
 * Used by: Data Bank, HPP Manager, Reports list
 * Dependencies: None
 * Public functions: TableSkeleton (default export)
 * Side effects: None
 */
"use client";

export default function TableSkeleton({
  rows = 5,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="space-y-2 w-full animate-pulse">
      {/* Header */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-4 rounded bg-[var(--surface-muted)]" />
        ))}
      </div>
      <div className="h-px bg-[var(--border-subtle)] my-2" />
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-4 rounded bg-[var(--surface-muted)]"
              style={{ opacity: 1 - r * 0.12 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
