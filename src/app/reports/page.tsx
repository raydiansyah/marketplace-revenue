/**
 * Module: Laporan Tersimpan
 * Purpose: Daftar semua saved reports dengan search, filter, rename, delete, dan paginasi
 * Used by: AppSidebar ("Laporan Tersimpan" link)
 * Dependencies: useAppStore, next/navigation, lucide-react
 * Public functions: SavedReportsPage (default export)
 * Side effects: Reads/writes savedReports dari Zustand store (persisted localStorage)
 */
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FolderOpen, Pencil, Save, Trash2, X } from "lucide-react";
import AuthAreaLayout from "@/components/AuthAreaLayout";
import { useAppStore } from "@/store/app-store";
import { formatRupiah } from "@/lib/utils";
import { MARKETPLACE_LABELS, MARKETPLACE_COLORS, type MarketplaceId } from "@/lib/types";

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];


export default function SavedReportsPage() {
  const router = useRouter();
  const { savedReports, deleteSavedReport, renameSavedReport } = useAppStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [search, setSearch] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState<"all" | MarketplaceId>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const handleRename = () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) return;
    renameSavedReport(editingId, trimmed);
    setEditingId(null);
    setEditingName("");
  };

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return savedReports.filter((item) => {
      if (marketplaceFilter !== "all" && item.marketplace !== marketplaceFilter) return false;
      if (!q) return true;
      return (
        item.id.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q) ||
        item.storeName.toLowerCase().includes(q)
      );
    });
  }, [savedReports, marketplaceFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredReports.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedReports = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredReports.slice(start, start + pageSize);
  }, [filteredReports, safePage]);

  const goToPage = (nextPage: number) => {
    setPage(Math.max(1, Math.min(totalPages, nextPage)));
  };

  return (
    <AuthAreaLayout>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Laporan Tersimpan</h1>
          <p className="mt-1 text-sm text-muted-foreground">Kelola, rename, dan buka ulang laporan tanpa upload ulang data.</p>
        </div>

        {/* Filter bar */}
        <div className="panel-card p-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <select
                value={marketplaceFilter}
                onChange={(e) => {
                  setMarketplaceFilter(e.target.value as "all" | MarketplaceId);
                  setPage(1);
                }}
                className="field-input sm:w-48 shrink-0"
              >
                <option value="all">Semua Marketplace</option>
                {Object.entries(MARKETPLACE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Cari nama toko, label, atau UUID laporan..."
                className="field-input w-full"
              />
            </div>
            <p className="text-xs text-[var(--text-subtle)] shrink-0">
              {filteredReports.length} laporan
            </p>
          </div>
        </div>

        {/* List */}
        <div className="panel-card">
          {savedReports.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
              <FileText className="w-10 h-10 text-[var(--text-subtle)] opacity-40" />
              <p className="text-sm font-medium text-[var(--text-subtle)]">Belum ada laporan tersimpan.</p>
              <p className="text-xs text-[var(--text-subtle)] max-w-xs">Buat laporan baru dari halaman "Buat Laporan" setelah mengupload data ke Bank Data.</p>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
              <FileText className="w-8 h-8 text-[var(--text-subtle)] opacity-40" />
              <p className="text-sm text-[var(--text-subtle)]">Tidak ada laporan yang cocok dengan filter/pencarian.</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {pagedReports.map((item) => {
                const isEditing = editingId === item.id;
                const periodLabel =
                  item.periodYear && item.periodMonth
                    ? `${MONTH_NAMES[(item.periodMonth - 1) % 12]} ${item.periodYear}`
                    : null;

                return (
                  <div key={item.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="field-input w-full max-w-md"
                          placeholder="Nama laporan"
                          autoFocus
                        />
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-[var(--foreground)] truncate">{item.label}</p>
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0"
                            style={{
                              color: MARKETPLACE_COLORS[item.marketplace],
                              backgroundColor: `${MARKETPLACE_COLORS[item.marketplace]}15`,
                              borderColor: `${MARKETPLACE_COLORS[item.marketplace]}30`,
                            }}
                          >
                            {MARKETPLACE_LABELS[item.marketplace]}
                          </span>
                          {periodLabel && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-[var(--border-subtle)] text-[10px] text-[var(--text-subtle)] shrink-0">
                              {periodLabel}
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-[var(--text-subtle)] mt-1">
                        {new Date(item.createdAt).toLocaleString("id-ID")} •{" "}
                        Revenue {formatRupiah(item.report.totalRevenue)} •{" "}
                        Net {formatRupiah(item.report.totalNetProfit)}
                      </p>
                      <p
                        className="text-[11px] text-[var(--text-subtle)] mt-0.5 font-mono truncate max-w-xs opacity-0 hover:opacity-100 transition-opacity cursor-default"
                        title={item.id}
                      >
                        {item.id}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <button
                        onClick={() => router.push(`/reports/${item.id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg text-[var(--foreground)] hover:bg-[var(--surface-soft)] transition-colors"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        Buka Detail
                      </button>

                      {isEditing ? (
                        <>
                          <button
                            onClick={handleRename}
                            disabled={!editingName.trim()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-emerald-500/30 text-emerald-400 rounded-lg hover:bg-emerald-400/10 disabled:opacity-40 transition-colors"
                          >
                            <Save className="w-3.5 h-3.5" />
                            Simpan
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setEditingName("");
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[var(--border-subtle)] text-[var(--text-subtle)] rounded-lg hover:bg-[var(--surface-soft)] transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                            Batal
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startRename(item.id, item.storeName)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-amber-500/30 text-amber-400 rounded-lg hover:bg-amber-400/10 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Rename
                        </button>
                      )}

                      <button
                        onClick={() => deleteSavedReport(item.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-500/30 text-red-400 rounded-lg hover:bg-red-400/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Hapus
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {filteredReports.length > pageSize && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--text-subtle)]">
              Halaman {safePage} dari {totalPages} •{" "}
              {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredReports.length)} dari {filteredReports.length} laporan
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => goToPage(safePage - 1)}
                disabled={safePage <= 1}
                className="px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg hover:bg-[var(--surface-soft)] disabled:opacity-40 transition-colors"
              >
                Sebelumnya
              </button>
              <button
                onClick={() => goToPage(safePage + 1)}
                disabled={safePage >= totalPages}
                className="px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg hover:bg-[var(--surface-soft)] disabled:opacity-40 transition-colors"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}

      </div>
    </AuthAreaLayout>
  );
}
