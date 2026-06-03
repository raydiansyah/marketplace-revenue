/**
 * Module: Data Bank
 * Purpose: Browser for monthly marketplace file archives (monthly_uploads)
 * Route: /data-bank
 * Used by: sellers to view/delete uploaded files per store per period
 * Dependencies: /api/monthly-uploads, /api/stores
 * Public functions: DataBankPage (default export)
 * Side effects: reads monthly_uploads (GET), can delete entries (DELETE)
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, Database, Trash2, AlertCircle, Loader2,
  ShoppingCart, DollarSign, RotateCcw, XCircle, TruckIcon,
} from "lucide-react";
import AuthAreaLayout from "@/components/AuthAreaLayout";
import type { MarketplaceId, FileType, MonthlyUploadRecord, StoreSummary } from "@/lib/types";
import { MARKETPLACE_LABELS } from "@/lib/types";

const MARKETPLACES: Array<{ id: MarketplaceId | ""; label: string }> = [
  { id: "", label: "Semua Marketplace" },
  { id: "shopee", label: "Shopee" },
  { id: "tokopedia", label: "Tokopedia / TikTok" },
  { id: "lazada", label: "Lazada" },
];

const FILE_TYPE_META: Record<FileType, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  order: { label: "Pesanan Selesai", color: "var(--accent)", bg: "var(--accent-soft)", icon: <ShoppingCart className="w-3.5 h-3.5" /> },
  income: { label: "Transaksi Pendapatan", color: "var(--positive)", bg: "var(--positive-bg)", icon: <DollarSign className="w-3.5 h-3.5" /> },
  return: { label: "Pesanan Retur", color: "var(--warning)", bg: "var(--warning-bg)", icon: <RotateCcw className="w-3.5 h-3.5" /> },
  cancel: { label: "Pesanan Cancel", color: "var(--text-subtle)", bg: "var(--surface-soft)", icon: <XCircle className="w-3.5 h-3.5" /> },
  failed: { label: "Failed Delivery", color: "var(--negative)", bg: "var(--negative-bg)", icon: <TruckIcon className="w-3.5 h-3.5" /> },
  ads: { label: "Iklan", color: "var(--accent)", bg: "var(--accent-soft)", icon: <Database className="w-3.5 h-3.5" /> },
  cashflow: { label: "Arus Kas", color: "var(--accent)", bg: "var(--accent-soft)", icon: <DollarSign className="w-3.5 h-3.5" /> },
};

function buildYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= 2023; y--) years.push(y);
  return years;
}

const MONTH_OPTIONS = [
  { value: 0, label: "Semua Bulan" },
  { value: 1, label: "Januari" }, { value: 2, label: "Februari" }, { value: 3, label: "Maret" },
  { value: 4, label: "April" }, { value: 5, label: "Mei" }, { value: 6, label: "Juni" },
  { value: 7, label: "Juli" }, { value: 8, label: "Agustus" }, { value: 9, label: "September" },
  { value: 10, label: "Oktober" }, { value: 11, label: "November" }, { value: 12, label: "Desember" },
];

function FileTypeBadge({ type }: { type: FileType }) {
  const meta = FILE_TYPE_META[type] ?? FILE_TYPE_META.order;
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ color: meta.color, background: meta.bg }}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-[var(--border-subtle)]">
      {[1, 2, 3, 4, 5].map((i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-3.5 rounded-md bg-[var(--surface-soft)] animate-pulse" style={{ width: `${40 + i * 10}%` }} />
        </td>
      ))}
    </tr>
  );
}

function ConfirmDialog({
  fileName, onConfirm, onCancel, deleting,
}: { fileName: string; onConfirm: () => void; onCancel: () => void; deleting: boolean }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="panel-card max-w-sm w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--danger-bg)] flex items-center justify-center">
            <Trash2 className="w-4 h-4 text-[var(--negative)]" />
          </span>
          <div>
            <p className="font-semibold text-[15px] text-[var(--foreground)] mb-1">Hapus file ini?</p>
            <p className="text-[13px] text-[var(--text-subtle)]">
              <strong className="text-[var(--foreground)]">{fileName}</strong> akan dihapus permanen dari Bank Data. Tindakan ini tidak bisa dibatalkan.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} disabled={deleting} className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--foreground)] text-sm font-semibold disabled:opacity-60 transition-opacity">
            Batal
          </button>
          <button type="button" onClick={onConfirm} disabled={deleting} className="px-4 py-2 rounded-lg bg-[var(--negative)] text-white text-sm font-semibold disabled:opacity-60 inline-flex items-center gap-1.5 transition-opacity">
            {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DataBankPage() {
  const router = useRouter();
  const currentYear = new Date().getFullYear();

  const [filterMarketplace, setFilterMarketplace] = useState<MarketplaceId | "">("");
  const [filterStoreId, setFilterStoreId] = useState<string>("");
  const [filterYear, setFilterYear] = useState<number>(currentYear);
  const [filterMonth, setFilterMonth] = useState<number>(0);

  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);

  const [records, setRecords] = useState<MonthlyUploadRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<MonthlyUploadRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setFilterStoreId("");
    if (!filterMarketplace) { setStores([]); return; }
    setStoresLoading(true);
    fetch(`/api/stores?marketplace=${filterMarketplace}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { stores: StoreSummary[] }) => setStores(data.stores ?? []))
      .catch(() => setStores([]))
      .finally(() => setStoresLoading(false));
  }, [filterMarketplace]);

  const fetchRecords = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const params = new URLSearchParams();
      if (filterMarketplace) params.set("marketplace", filterMarketplace);
      if (filterStoreId) params.set("storeId", filterStoreId);
      if (filterYear) params.set("year", String(filterYear));
      if (filterMonth > 0) params.set("month", String(filterMonth));
      const res = await fetch(`/api/monthly-uploads?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { uploads: MonthlyUploadRecord[] };
      setRecords(data.uploads ?? []);
    } catch {
      setDataError("Gagal memuat data. Coba lagi.");
    } finally {
      setDataLoading(false);
    }
  }, [filterMarketplace, filterStoreId, filterYear, filterMonth]);

  useEffect(() => { void fetchRecords(); }, [fetchRecords]);

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/monthly-uploads/${pendingDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRecords((prev) => prev.filter((r) => r.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch { /* keep dialog open */ } finally { setDeleting(false); }
  }

  function formatDate(date: Date | string) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const yearOptions = buildYearOptions();

  return (
    <AuthAreaLayout>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Bank Data</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Arsip file marketplace yang telah diunggah, per toko per periode.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/upload")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl action-primary text-sm font-semibold shrink-0"
          >
            <Upload className="w-4 h-4" />
            Upload Data Baru
          </button>
        </div>

        {/* Filter bar */}
        <div className="panel-card p-4 mb-6 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 min-w-[160px] flex-1 sm:flex-none">
            <label className="text-xs font-semibold text-muted-foreground">Marketplace</label>
            <select value={filterMarketplace} onChange={(e) => setFilterMarketplace(e.target.value as MarketplaceId | "")} className="field-input">
              {MARKETPLACES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-[180px] flex-1 sm:flex-none">
            <label className="text-xs font-semibold text-muted-foreground">Toko</label>
            <select value={filterStoreId} onChange={(e) => setFilterStoreId(e.target.value)} disabled={!filterMarketplace || storesLoading} className="field-input disabled:opacity-50">
              <option value="">Semua Toko</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.storeName}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-[100px]">
            <label className="text-xs font-semibold text-muted-foreground">Tahun</label>
            <select value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))} className="field-input">
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-[130px]">
            <label className="text-xs font-semibold text-muted-foreground">Bulan</label>
            <select value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))} className="field-input">
              {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        {/* Error */}
        {dataError && (
          <div className="mb-4 p-3 bg-[var(--danger-bg)] border border-red-200 dark:border-red-900 rounded-lg text-sm text-[var(--danger-text)] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {dataError}
            <button type="button" onClick={() => void fetchRecords()} className="ml-1 underline">Coba lagi</button>
          </div>
        )}

        {/* Table */}
        {!dataLoading && records.length === 0 && !dataError ? (
          <div className="panel-card text-center py-12 text-muted-foreground">
            <Database className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-[15px] font-medium">Belum ada data. Upload file marketplace terlebih dahulu.</p>
            <button type="button" onClick={() => router.push("/upload")} className="mt-4 action-primary px-5 py-2 rounded-lg text-sm font-semibold">
              Upload Sekarang
            </button>
          </div>
        ) : (
          <div className="panel-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--surface-soft)] border-b border-[var(--border-subtle)]">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Tipe</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Nama File</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">Baris</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase hidden sm:table-cell">Marketplace</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase hidden md:table-cell">Tanggal Upload</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {dataLoading ? (
                    <><SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
                  ) : (
                    records.map((record) => (
                      <tr key={record.id} className="hover:bg-[var(--surface-soft)] transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap"><FileTypeBadge type={record.fileType} /></td>
                        <td className="px-4 py-3 max-w-[200px] sm:max-w-[280px]">
                          <span className="text-[13px] text-foreground font-medium block truncate" title={record.fileName}>{record.fileName}</span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className="text-[13px] text-foreground font-semibold tabular-nums">{record.rawRowCount.toLocaleString("id-ID")}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
                          <span className="text-[13px] text-muted-foreground">{MARKETPLACE_LABELS[record.marketplace] ?? record.marketplace}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap hidden md:table-cell">
                          <span className="text-[13px] text-muted-foreground tabular-nums">{formatDate(record.uploadedAt)}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button type="button" onClick={() => setPendingDelete(record)} title="Hapus" className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!dataLoading && records.length > 0 && (
              <div className="px-4 py-2.5 border-t border-[var(--border-subtle)] text-xs text-muted-foreground">
                {records.length} file ditemukan
              </div>
            )}
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog fileName={pendingDelete.fileName} onConfirm={handleDelete} onCancel={() => setPendingDelete(null)} deleting={deleting} />
      )}
    </AuthAreaLayout>
  );
}
