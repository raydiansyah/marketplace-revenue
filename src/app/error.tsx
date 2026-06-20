/**
 * Module: Global Route Error Boundary
 * Purpose: Tangkap render/runtime error di seluruh route agar tidak white-screen (blank).
 * Used by: Next.js App Router (otomatis membungkus semua segmen di bawah app/).
 * Dependencies: next/navigation (implicit via reset), lucide-react
 * Public functions: GlobalRouteError (default export)
 * Side effects: console.error untuk logging; reset() me-remount segmen.
 */
"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RouteError]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15">
          <AlertTriangle className="h-6 w-6 text-rose-400" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-[var(--foreground)]">Terjadi kesalahan</h1>
        <p className="mt-2 text-sm text-[var(--text-subtle)]">
          Halaman gagal dimuat. Data Anda tidak hilang — coba muat ulang bagian ini.
        </p>
        {error?.digest && (
          <p className="mt-2 font-mono text-[10px] text-[var(--text-subtle)]/70">ref: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--brand,#0ea5e9)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <RotateCcw className="h-4 w-4" />
          Coba lagi
        </button>
      </div>
    </div>
  );
}
