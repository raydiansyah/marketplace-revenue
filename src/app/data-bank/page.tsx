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

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const MARKETPLACES: Array<{ id: MarketplaceId | ""; label: string }> = [
  { id: "", label: "Semua Marketplace" },
  { id: "shopee", label: "Shopee" },
  { id: "tokopedia", label: "Tokopedia / TikTok" },
  { id: "lazada", label: "Lazada" },
];

const FILE_TYPE_META: Record<FileType, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  order: {
    label: "Pesanan Selesai",
    color: "#2563eb",
    bg: "#2563eb18",
    icon: <ShoppingCart style={{ width: "0.875rem", height: "0.875rem" }} />,
  },
  income: {
    label: "Transaksi Pendapatan",
    color: "#059669",
    bg: "#05966918",
    icon: <DollarSign style={{ width: "0.875rem", height: "0.875rem" }} />,
  },
  return: {
    label: "Pesanan Retur",
    color: "#f97316",
    bg: "#f9731618",
    icon: <RotateCcw style={{ width: "0.875rem", height: "0.875rem" }} />,
  },
  cancel: {
    label: "Pesanan Cancel",
    color: "#6b7280",
    bg: "#6b728018",
    icon: <XCircle style={{ width: "0.875rem", height: "0.875rem" }} />,
  },
  failed: {
    label: "Failed Delivery",
    color: "#6b7280",
    bg: "#6b728018",
    icon: <TruckIcon style={{ width: "0.875rem", height: "0.875rem" }} />,
  },
  ads: {
    label: "Iklan",
    color: "#7c3aed",
    bg: "#7c3aed18",
    icon: <Database style={{ width: "0.875rem", height: "0.875rem" }} />,
  },
  cashflow: {
    label: "Arus Kas",
    color: "#0891b2",
    bg: "#0891b218",
    icon: <DollarSign style={{ width: "0.875rem", height: "0.875rem" }} />,
  },
};

// ──────────────────────────────────────────────────────────────
// Helper: build month/year options
// ──────────────────────────────────────────────────────────────

function buildYearOptions(): number[] {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= 2023; y--) {
    years.push(y);
  }
  return years;
}

const MONTH_OPTIONS = [
  { value: 0, label: "Semua Bulan" },
  { value: 1, label: "Januari" },
  { value: 2, label: "Februari" },
  { value: 3, label: "Maret" },
  { value: 4, label: "April" },
  { value: 5, label: "Mei" },
  { value: 6, label: "Juni" },
  { value: 7, label: "Juli" },
  { value: 8, label: "Agustus" },
  { value: 9, label: "September" },
  { value: 10, label: "Oktober" },
  { value: 11, label: "November" },
  { value: 12, label: "Desember" },
];

// ──────────────────────────────────────────────────────────────
// File type badge
// ──────────────────────────────────────────────────────────────

function FileTypeBadge({ type }: { type: FileType }) {
  const meta = FILE_TYPE_META[type] ?? FILE_TYPE_META.order;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        padding: "0.2rem 0.6rem",
        borderRadius: "999px",
        fontSize: "0.7rem",
        fontWeight: 600,
        color: meta.color,
        background: meta.bg,
        whiteSpace: "nowrap",
      }}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// Skeleton row
// ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <td key={i} style={{ padding: "0.875rem 1rem" }}>
          <div
            style={{
              height: "0.875rem",
              borderRadius: "0.375rem",
              background: "var(--surface-soft)",
              width: i === 1 ? "60%" : i === 2 ? "80%" : i === 3 ? "40%" : i === 4 ? "55%" : "30%",
              animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
            }}
          />
        </td>
      ))}
    </tr>
  );
}

// ──────────────────────────────────────────────────────────────
// Confirm delete dialog
// ──────────────────────────────────────────────────────────────

function ConfirmDialog({
  fileName,
  onConfirm,
  onCancel,
  deleting,
}: {
  fileName: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(2px)",
        padding: "1rem",
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="panel-card"
        style={{ maxWidth: "24rem", width: "100%", padding: "1.5rem" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", marginBottom: "1rem" }}>
          <span
            style={{
              flexShrink: 0,
              width: "2.25rem",
              height: "2.25rem",
              borderRadius: "50%",
              background: "var(--danger-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Trash2 style={{ width: "1rem", height: "1rem", color: "var(--negative)" }} />
          </span>
          <div>
            <p style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--foreground)", marginBottom: "0.25rem" }}>
              Hapus file ini?
            </p>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-subtle)" }}>
              <strong style={{ color: "var(--foreground)" }}>{fileName}</strong> akan dihapus permanen dari Bank Data.
              Tindakan ini tidak bisa dibatalkan.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.625rem",
              border: "1px solid var(--border-subtle)",
              background: "var(--surface)",
              color: "var(--foreground)",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: deleting ? "not-allowed" : "pointer",
              opacity: deleting ? 0.6 : 1,
            }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.625rem",
              border: "none",
              background: "var(--negative)",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: deleting ? "not-allowed" : "pointer",
              opacity: deleting ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
            }}
          >
            {deleting && <Loader2 style={{ width: "0.875rem", height: "0.875rem", animation: "spin 1s linear infinite" }} />}
            Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────────────────

export default function DataBankPage() {
  const router = useRouter();
  const currentYear = new Date().getFullYear();

  // ── Filters ────────────────────────────────────────────────
  const [filterMarketplace, setFilterMarketplace] = useState<MarketplaceId | "">("");
  const [filterStoreId, setFilterStoreId] = useState<string>("");
  const [filterYear, setFilterYear] = useState<number>(currentYear);
  const [filterMonth, setFilterMonth] = useState<number>(0); // 0 = all

  // ── Store list (refetches on marketplace change) ───────────
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);

  // ── Data ──────────────────────────────────────────────────
  const [records, setRecords] = useState<MonthlyUploadRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // ── Delete confirm ─────────────────────────────────────────
  const [pendingDelete, setPendingDelete] = useState<MonthlyUploadRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch stores when marketplace filter changes
  useEffect(() => {
    setFilterStoreId("");
    if (!filterMarketplace) {
      setStores([]);
      return;
    }
    setStoresLoading(true);
    fetch(`/api/stores?marketplace=${filterMarketplace}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { stores: StoreSummary[] }) => setStores(data.stores ?? []))
      .catch(() => setStores([]))
      .finally(() => setStoresLoading(false));
  }, [filterMarketplace]);

  // Fetch records when any filter changes
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

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  // Delete handler
  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/monthly-uploads/${pendingDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRecords((prev) => prev.filter((r) => r.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch {
      // Keep dialog open on error — user can retry
    } finally {
      setDeleting(false);
    }
  }

  const yearOptions = buildYearOptions();

  // Format upload date
  function formatDate(date: Date | string) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <AuthAreaLayout contentClassName="w-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--foreground)]">Bank Data</h1>
            <p className="text-sm text-[var(--text-subtle)] mt-1">
              Arsip file marketplace yang telah diunggah, per toko per periode.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/upload")}
            className="action-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity"
          >
            <Upload style={{ width: "1rem", height: "1rem" }} />
            Upload Data Baru
          </button>
        </div>

        {/* Filter bar */}
        <div className="panel-card p-3 mb-5">
          <div className="flex flex-wrap items-end gap-3">
            {/* Marketplace */}
            <div style={{ flex: "1 1 10rem" }}>
              <label
                style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.375rem" }}
              >
                Marketplace
              </label>
              <select
                value={filterMarketplace}
                onChange={(e) => setFilterMarketplace(e.target.value as MarketplaceId | "")}
                className="field-input"
              >
                {MARKETPLACES.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Store */}
            <div style={{ flex: "1 1 12rem" }}>
              <label
                style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.375rem" }}
              >
                Toko
              </label>
              <select
                value={filterStoreId}
                onChange={(e) => setFilterStoreId(e.target.value)}
                disabled={!filterMarketplace || storesLoading}
                className="field-input"
                style={{ opacity: !filterMarketplace || storesLoading ? 0.5 : 1 }}
              >
                <option value="">Semua Toko</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.storeName}</option>
                ))}
              </select>
            </div>

            {/* Year */}
            <div style={{ flex: "0 1 7rem" }}>
              <label
                style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.375rem" }}
              >
                Tahun
              </label>
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(Number(e.target.value))}
                className="field-input"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Month */}
            <div style={{ flex: "0 1 9rem" }}>
              <label
                style={{ display: "block", fontSize: "0.7rem", fontWeight: 600, color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.375rem" }}
              >
                Bulan
              </label>
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(Number(e.target.value))}
                className="field-input"
              >
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="panel-card overflow-hidden">
          {dataError && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.875rem 1.25rem",
                background: "var(--danger-bg)",
                color: "var(--danger-text)",
                fontSize: "0.875rem",
              }}
            >
              <AlertCircle style={{ width: "1rem", height: "1rem", flexShrink: 0 }} />
              {dataError}
              <button
                type="button"
                onClick={() => void fetchRecords()}
                style={{ marginLeft: "0.5rem", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "inherit" }}
              >
                Coba lagi
              </button>
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-muted)" }}>
                  {["Tipe", "Nama File", "Baris", "Marketplace", "Tanggal Upload", "Aksi"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "0.625rem 1rem",
                        textAlign: "left",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        color: "var(--text-subtle)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataLoading ? (
                  <>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                  </>
                ) : records.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "3rem 1rem", textAlign: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
                        <Database style={{ width: "2.5rem", height: "2.5rem", color: "var(--border-subtle)" }} />
                        <p style={{ color: "var(--text-subtle)", fontSize: "0.9375rem", fontWeight: 500 }}>
                          Belum ada data. Upload file marketplace terlebih dahulu.
                        </p>
                        <button
                          type="button"
                          onClick={() => router.push("/upload")}
                          className="action-primary"
                          style={{ padding: "0.5rem 1.25rem", borderRadius: "0.625rem", fontSize: "0.875rem", fontWeight: 600, border: "none", cursor: "pointer" }}
                        >
                          Upload Sekarang
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  records.map((record) => (
                    <tr
                      key={record.id}
                      style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.1s" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--surface-muted)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                    >
                      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                        <FileTypeBadge type={record.fileType} />
                      </td>
                      <td style={{ padding: "0.75rem 1rem", maxWidth: "18rem" }}>
                        <span
                          style={{
                            fontSize: "0.8125rem",
                            color: "var(--foreground)",
                            fontWeight: 500,
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={record.fileName}
                        >
                          {record.fileName}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                        <span
                          style={{
                            fontSize: "0.8125rem",
                            color: "var(--foreground)",
                            fontWeight: 600,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {record.rawRowCount.toLocaleString("id-ID")}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: "0.8125rem", color: "var(--text-subtle)" }}>
                          {MARKETPLACE_LABELS[record.marketplace] ?? record.marketplace}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: "0.8125rem", color: "var(--text-subtle)", fontVariantNumeric: "tabular-nums" }}>
                          {formatDate(record.uploadedAt)}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(record)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            padding: "0.375rem 0.625rem",
                            borderRadius: "0.5rem",
                            border: "1px solid var(--danger-bg)",
                            background: "var(--danger-bg)",
                            color: "var(--negative)",
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "opacity 0.15s",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.75"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                        >
                          <Trash2 style={{ width: "0.875rem", height: "0.875rem" }} />
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!dataLoading && records.length > 0 && (
            <div
              style={{
                padding: "0.625rem 1rem",
                borderTop: "1px solid var(--border-subtle)",
                fontSize: "0.75rem",
                color: "var(--text-subtle)",
              }}
            >
              {records.length} file ditemukan
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm dialog */}
      {pendingDelete && (
        <ConfirmDialog
          fileName={pendingDelete.fileName}
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
          deleting={deleting}
        />
      )}
    </AuthAreaLayout>
  );
}
