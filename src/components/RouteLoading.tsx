/**
 * Module: RouteLoading
 * Purpose: Skeleton fallback instan untuk navigasi antar-route (dipakai oleh loading.tsx).
 * Used by: per-route loading.tsx files under src/app
 * Dependencies: AuthAreaLayout
 * Public functions: RouteLoading (default export)
 * Side effects: None
 */
import AuthAreaLayout from "@/components/AuthAreaLayout";

export default function RouteLoading() {
  return (
    <AuthAreaLayout contentClassName="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1320px] space-y-6">
        {/* Header skeleton */}
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
          <div className="h-3 w-28 animate-pulse rounded bg-[var(--surface-muted)]" />
          <div className="mt-3 h-7 w-64 animate-pulse rounded bg-[var(--surface-muted)]" />
          <div className="mt-2 h-3 w-40 animate-pulse rounded bg-[var(--surface-muted)]" />
        </div>

        {/* Metric cards skeleton */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
              <div className="h-3 w-20 animate-pulse rounded bg-[var(--surface-muted)]" />
              <div className="mt-3 h-6 w-24 animate-pulse rounded bg-[var(--surface-muted)]" />
            </div>
          ))}
        </div>

        {/* Content blocks skeleton */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="h-[320px] animate-pulse rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)]" />
          <div className="h-[320px] animate-pulse rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)]" />
        </div>
        <div className="h-64 animate-pulse rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)]" />
      </div>
    </AuthAreaLayout>
  );
}
