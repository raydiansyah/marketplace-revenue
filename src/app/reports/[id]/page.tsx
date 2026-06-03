"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import AuthAreaLayout from "@/components/AuthAreaLayout";
import { useAppStore } from "@/store/app-store";
import type { MarketplaceId, RevenueReport } from "@/lib/types";

interface SavedReportApiRow {
  id: string;
  storeName: string;
  marketplace: MarketplaceId;
  label: string;
  createdAt: string;
  reportJson: RevenueReport;
}

export default function SavedReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const setUploadPreviewReport = useAppStore((s) => s.setUploadPreviewReport);
  const setReport = useAppStore((s) => s.setReport);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { id } = await params;
        const res = await fetch(`/api/reports/${id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!active) return;
          setError(data?.error ?? "Gagal memuat detail laporan.");
          return;
        }
        const row = data.report as SavedReportApiRow;
        if (!active) return;
        // Set report ke store lalu redirect ke halaman result lengkap
        setUploadPreviewReport(row.reportJson);
        setReport(row.reportJson, "saved", row.id);
        router.replace("/upload/result");
      } catch {
        if (!active) return;
        setError("Gagal memuat detail laporan. Periksa koneksi dan coba lagi.");
      }
    })();
    return () => {
      active = false;
    };
  }, [params, router, setUploadPreviewReport, setReport]);

  return (
    <AuthAreaLayout contentClassName="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-xl">
        <Link href="/reports" className="inline-flex items-center gap-1 text-xs text-[var(--text-subtle)] hover:text-[var(--foreground)] mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke daftar laporan
        </Link>

        <div className="panel-card p-10 flex flex-col items-center justify-center gap-4 text-center">
          {error ? (
            <>
              <p className="text-sm text-red-400 font-medium">{error}</p>
              <Link
                href="/reports"
                className="text-xs text-[var(--text-subtle)] hover:text-[var(--foreground)] underline"
              >
                Kembali ke daftar laporan
              </Link>
            </>
          ) : (
            <>
              <Loader2 className="w-6 h-6 animate-spin text-[var(--text-subtle)]" />
              <p className="text-sm text-[var(--text-subtle)]">Memuat laporan...</p>
            </>
          )}
        </div>
      </div>
    </AuthAreaLayout>
  );
}
