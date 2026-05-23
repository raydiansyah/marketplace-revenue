"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Pencil, Save, Trash2, X } from "lucide-react";
import AuthAreaLayout from "@/components/AuthAreaLayout";
import { useAppStore } from "@/store/app-store";
import { formatRupiah } from "@/lib/utils";
import { MARKETPLACE_LABELS, type MarketplaceId } from "@/lib/types";

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
    <AuthAreaLayout contentClassName="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
          <div className="mb-6">
            <h1 className="text-3xl font-extrabold tracking-tight text-[var(--foreground)]">Laporan Tersimpan</h1>
            <p className="text-[var(--text-subtle)] mt-1 text-sm">Kelola, rename, dan buka ulang laporan tanpa upload ulang data.</p>
          </div>

          <div className="panel-card p-4 mb-4">
            <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <select
                  value={marketplaceFilter}
                  onChange={(e) => {
                    setMarketplaceFilter(e.target.value as "all" | MarketplaceId);
                    setPage(1);
                  }}
                  className="field-input"
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
                  placeholder="Cari nama toko, label, atau UUID laporan"
                  className="field-input w-full sm:min-w-[320px]"
                />
              </div>
              <p className="text-xs text-[var(--text-subtle)]">
                Menampilkan {filteredReports.length} laporan
              </p>
            </div>
          </div>

          <div className="panel-card">
            {savedReports.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">Belum ada laporan tersimpan.</p>
            ) : filteredReports.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">Tidak ada laporan yang cocok dengan filter/pencarian.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {pagedReports.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <div key={item.id} className="px-5 py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        {isEditing ? (
                          <input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="field-input w-full max-w-md"
                            placeholder="Nama toko"
                          />
                        ) : (
                          <p className="text-sm font-medium text-[var(--foreground)] truncate">{item.label}</p>
                        )}
                        <p className="text-xs text-[var(--text-subtle)] mt-1">
                          {new Date(item.createdAt).toLocaleString("id-ID")} • Revenue {formatRupiah(item.report.totalRevenue)} • Net {formatRupiah(item.report.totalNetProfit)}
                        </p>
                        <p className="text-[11px] text-[var(--text-subtle)] mt-0.5 font-mono">UUID: {item.id}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            router.push(`/reports/${item.id}`);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg hover:bg-[var(--surface-soft)] text-[var(--foreground)]"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          Buka Detail
                        </button>

                        {isEditing ? (
                          <>
                            <button
                              onClick={handleRename}
                              disabled={!editingName.trim()}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-40"
                            >
                              <Save className="w-3.5 h-3.5" />
                              Simpan
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(null);
                                setEditingName("");
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-[var(--border-subtle)] text-[var(--text-subtle)] rounded-lg hover:bg-[var(--surface-soft)]"
                            >
                              <X className="w-3.5 h-3.5" />
                              Batal
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => startRename(item.id, item.storeName)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Rename
                          </button>
                        )}

                        <button
                          onClick={() => deleteSavedReport(item.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
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

          {filteredReports.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-[var(--text-subtle)]">
                Halaman {safePage} dari {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(safePage - 1)}
                  disabled={safePage <= 1}
                  className="px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg disabled:opacity-40"
                >
                  Sebelumnya
                </button>
                <button
                  onClick={() => goToPage(safePage + 1)}
                  disabled={safePage >= totalPages}
                  className="px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg disabled:opacity-40"
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
