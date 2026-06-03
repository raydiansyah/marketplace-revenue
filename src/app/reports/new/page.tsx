/**
 * Module: Buat Laporan Baru
 * Purpose: UI untuk memilih store + periode lalu kalkulasi laporan dari monthly_uploads
 * Used by: AppSidebar ("Buat Laporan" link), /data-bank CTA
 * Dependencies: /api/reports/calculate, StorePicker, MonthPicker
 * Side effects: POST /api/reports/calculate → INSERT saved_reports → redirect /reports/[id]
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AuthAreaLayout from "@/components/AuthAreaLayout";
import StorePicker from "@/components/StorePicker";
import MonthPicker from "@/components/MonthPicker";
import { FilePlus, ChevronRight, AlertCircle, Loader2 } from "lucide-react";
import { MARKETPLACE_LABELS, MARKETPLACE_COLORS, type MarketplaceId } from "@/lib/types";

const MARKETPLACES: { id: MarketplaceId; label: string }[] = [
  { id: "shopee", label: MARKETPLACE_LABELS.shopee },
  { id: "tokopedia", label: MARKETPLACE_LABELS.tokopedia },
  { id: "lazada", label: MARKETPLACE_LABELS.lazada },
];

function getDefaultMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function NewReportPage() {
  const router = useRouter();
  const [marketplace, setMarketplace] = useState<MarketplaceId | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(getDefaultMonth());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCalculate = marketplace !== null && storeId !== null && month.length > 0;

  const handleCalculate = async () => {
    if (!canCalculate) return;
    const [yearStr, monthStr] = month.split("-");
    const periodYear = Number(yearStr);
    const periodMonth = Number(monthStr);

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/reports/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, periodYear, periodMonth }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Gagal menghitung laporan");
        return;
      }

      router.push(`/reports/${data.id}`);
    } catch {
      setError("Koneksi gagal. Periksa jaringan dan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthAreaLayout>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
              <FilePlus className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Buat Laporan Baru</h1>
              <p className="text-sm text-muted-foreground">Pilih toko dan periode untuk dikalkulasi</p>
            </div>
          </div>

          {/* Step 1: Marketplace */}
          <div className="panel-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[var(--accent)] text-[var(--background)] text-xs font-bold flex items-center justify-center">1</span>
              <h2 className="text-sm font-semibold text-foreground">Pilih Marketplace</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {MARKETPLACES.map((mp) => {
                const isSelected = marketplace === mp.id;
                const color = MARKETPLACE_COLORS[mp.id];
                return (
                  <button
                    key={mp.id}
                    onClick={() => { setMarketplace(mp.id); setStoreId(null); }}
                    className="px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left"
                    style={{
                      borderColor: isSelected ? color : "var(--border-subtle)",
                      background: isSelected ? `${color}15` : "var(--surface)",
                      color: isSelected ? color : "var(--text-subtle)",
                      boxShadow: isSelected ? `0 0 0 2px ${color}40` : "none",
                    }}
                  >
                    {mp.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Store + Period */}
          <div className={`panel-card p-5 space-y-4 transition-opacity ${marketplace ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[var(--accent)] text-[var(--background)] text-xs font-bold flex items-center justify-center">2</span>
              <h2 className="text-sm font-semibold text-foreground">Pilih Toko & Periode</h2>
            </div>

            {marketplace && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Toko</label>
                  <StorePicker marketplace={marketplace} value={storeId} onChange={setStoreId} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Periode</label>
                  <MonthPicker value={month} onChange={setMonth} />
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Kalkulasi */}
          <div className={`panel-card p-5 space-y-4 transition-opacity ${canCalculate ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-[var(--accent)] text-[var(--background)] text-xs font-bold flex items-center justify-center">3</span>
              <h2 className="text-sm font-semibold text-foreground">Hitung Laporan</h2>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-[var(--danger-bg)] rounded-xl border border-[var(--border-subtle)]">
                <AlertCircle className="w-4 h-4 text-[var(--danger-text)] shrink-0 mt-0.5" />
                <p className="text-sm text-[var(--danger-text)]">{error}</p>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Data dari semua file yang sudah diupload di Bank Data akan digabungkan dan dikalkulasi otomatis.
            </p>

            <button
              onClick={handleCalculate}
              disabled={!canCalculate || loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl action-primary text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Menghitung...</>
              ) : (
                <>Kalkulasi Laporan<ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </AuthAreaLayout>
  );
}
