/**
 * Module: HPP Manager Tabbed
 * Purpose: Tabbed UI to manage HPP entries per marketplace (Shopee, Tokopedia, Lazada) and a combined view
 * Used by: src/app/hpp/page.tsx
 * Dependencies: /api/hpp/marketplace, /api/hpp/combined, lucide-react, formatRupiah
 * Public functions: HppManagerTabbed (default export)
 * Side effects: Fetches and mutates hpp_marketplace_entries via REST API calls
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  Upload,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import { useNotification } from "@/lib/notifications/notification-context";
import type { MarketplaceId, HppMarketplaceEntry, HppConflict } from "@/lib/types";

const TABS: Array<{ id: MarketplaceId | "gabungan"; label: string }> = [
  { id: "shopee", label: "Shopee" },
  { id: "tokopedia", label: "Tokopedia" },
  { id: "lazada", label: "Lazada" },
  { id: "gabungan", label: "Gabungan" },
];

interface MarketplaceTabState {
  entries: HppMarketplaceEntry[];
  loading: boolean;
  error: string | null;
  q: string;
  page: number;
  total: number;
  totalPages: number;
  uploadMessages: { warnings: string[]; errors: string[]; inserted?: number } | null;
}

interface CombinedTabState {
  entries: HppMarketplaceEntry[];
  conflicts: HppConflict[];
  loading: boolean;
  error: string | null;
  q: string;
  conflictsOnly: boolean;
  total: number;
}

const PAGE_LIMIT = 20;

function emptyMpState(): MarketplaceTabState {
  return {
    entries: [],
    loading: false,
    error: null,
    q: "",
    page: 1,
    total: 0,
    totalPages: 1,
    uploadMessages: null,
  };
}

export default function HppManagerTabbed() {
  const { notify } = useNotification();
  const [activeTab, setActiveTab] = useState<MarketplaceId | "gabungan">("shopee");

  const [mpState, setMpState] = useState<Record<MarketplaceId, MarketplaceTabState>>({
    shopee: emptyMpState(),
    tokopedia: emptyMpState(),
    lazada: emptyMpState(),
  });

  const [combined, setCombined] = useState<CombinedTabState>({
    entries: [],
    conflicts: [],
    loading: false,
    error: null,
    q: "",
    conflictsOnly: false,
    total: 0,
  });

  const [addForm, setAddForm] = useState<Record<MarketplaceId, { sku: string; productName: string; cost: string }>>({
    shopee: { sku: "", productName: "", cost: "" },
    tokopedia: { sku: "", productName: "", cost: "" },
    lazada: { sku: "", productName: "", cost: "" },
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCost, setEditCost] = useState("");
  const [addingRow, setAddingRow] = useState<Record<MarketplaceId, boolean>>({
    shopee: false, tokopedia: false, lazada: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);

  const fetchMarketplace = useCallback(async (mp: MarketplaceId, page = 1, q = "") => {
    setMpState((prev) => ({ ...prev, [mp]: { ...prev[mp], loading: true, error: null } }));
    try {
      const params = new URLSearchParams({
        marketplace: mp,
        page: String(page),
        limit: String(PAGE_LIMIT),
        q,
      });
      const res = await fetch(`/api/hpp/marketplace?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { entries: HppMarketplaceEntry[]; total: number; page: number; totalPages: number };
      setMpState((prev) => ({
        ...prev,
        [mp]: { ...prev[mp], entries: data.entries, total: data.total, page: data.page, totalPages: data.totalPages, loading: false },
      }));
    } catch (e) {
      setMpState((prev) => ({ ...prev, [mp]: { ...prev[mp], loading: false, error: String(e) } }));
    }
  }, []);

  const fetchCombined = useCallback(async (q = "", conflictsOnly = false) => {
    setCombined((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const params = new URLSearchParams({ q, conflictsOnly: String(conflictsOnly) });
      const res = await fetch(`/api/hpp/combined?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { entries: HppMarketplaceEntry[]; conflicts: HppConflict[]; total: number };
      setCombined((prev) => ({
        ...prev,
        entries: data.entries,
        conflicts: data.conflicts,
        total: data.total,
        loading: false,
      }));
    } catch (e) {
      setCombined((prev) => ({ ...prev, loading: false, error: String(e) }));
    }
  }, []);

  useEffect(() => {
    if (activeTab === "gabungan") {
      void fetchCombined(combined.q, combined.conflictsOnly);
    } else {
      const state = mpState[activeTab];
      void fetchMarketplace(activeTab, state.page, state.q);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleSearch = (mp: MarketplaceId, q: string) => {
    setMpState((prev) => ({ ...prev, [mp]: { ...prev[mp], q } }));
    void fetchMarketplace(mp, 1, q);
  };

  const handlePage = (mp: MarketplaceId, page: number) => {
    void fetchMarketplace(mp, page, mpState[mp].q);
  };

  const handleUpload = async (mp: MarketplaceId, file: File) => {
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setMpState((prev) => ({ ...prev, [mp]: { ...prev[mp], loading: true, uploadMessages: null } }));
    try {
      const form = new FormData();
      form.append("marketplace", mp);
      form.append("file", file);
      const res = await fetch("/api/hpp/marketplace", { method: "POST", body: form });
      const data = await res.json() as { inserted?: number; warnings?: string[]; errors?: string[]; error?: string };
      if (!res.ok) {
        notify("error", data.error ?? "Upload gagal");
        setMpState((prev) => ({ ...prev, [mp]: { ...prev[mp], loading: false, uploadMessages: { warnings: [], errors: data.errors ?? [data.error ?? "Upload gagal"], inserted: 0 } } }));
      } else {
        notify("success", `${data.inserted} baris diimport ke ${mp}`);
        setMpState((prev) => ({ ...prev, [mp]: { ...prev[mp], uploadMessages: { warnings: data.warnings ?? [], errors: data.errors ?? [], inserted: data.inserted } } }));
        void fetchMarketplace(mp, 1, mpState[mp].q);
      }
    } catch (e) {
      notify("error", String(e));
      setMpState((prev) => ({ ...prev, [mp]: { ...prev[mp], loading: false } }));
    } finally {
      uploadingRef.current = false;
    }
  };

  const handleAdd = async (mp: MarketplaceId) => {
    const form = addForm[mp];
    const cost = parseFloat(form.cost);
    if (!form.productName.trim()) { notify("error", "Nama produk wajib diisi"); return; }
    if (isNaN(cost) || cost < 0) { notify("error", "HPP harus berupa angka >= 0"); return; }

    setAddingRow((prev) => ({ ...prev, [mp]: true }));
    try {
      const res = await fetch("/api/hpp/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplace: mp, entry: { sku: form.sku.trim(), productName: form.productName.trim(), cost } }),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; notify("error", d.error ?? "Gagal menyimpan"); return; }
      notify("success", "HPP berhasil ditambahkan");
      setAddForm((prev) => ({ ...prev, [mp]: { sku: "", productName: "", cost: "" } }));
      void fetchMarketplace(mp, mpState[mp].page, mpState[mp].q);
    } catch (e) {
      notify("error", String(e));
    } finally {
      setAddingRow((prev) => ({ ...prev, [mp]: false }));
    }
  };

  const handleEditSave = async (mp: MarketplaceId, id: string) => {
    const cost = parseFloat(editCost);
    if (isNaN(cost) || cost < 0) { notify("error", "HPP tidak valid"); return; }
    const res = await fetch(`/api/hpp/marketplace/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cost }),
    });
    if (!res.ok) { notify("error", "Gagal update"); return; }
    setEditingId(null);
    notify("success", "HPP diperbarui");
    void fetchMarketplace(mp, mpState[mp].page, mpState[mp].q);
  };

  const handleDelete = async (mp: MarketplaceId, id: string) => {
    if (!confirm("Hapus entry ini?")) return;
    const res = await fetch(`/api/hpp/marketplace/${id}`, { method: "DELETE" });
    if (!res.ok) { notify("error", "Gagal hapus"); return; }
    notify("success", "Entry dihapus");
    void fetchMarketplace(mp, mpState[mp].page, mpState[mp].q);
  };

  return (
    <div className="panel-card">
      <div className="flex border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-blue-600 text-blue-600"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {activeTab !== "gabungan" ? (
          <MarketplaceTabPanel
            mp={activeTab}
            state={mpState[activeTab]}
            addFormState={addForm[activeTab]}
            addingRow={addingRow[activeTab]}
            editingId={editingId}
            editCost={editCost}
            fileInputRef={fileInputRef}
            onSearch={(q) => handleSearch(activeTab, q)}
            onPage={(page) => handlePage(activeTab, page)}
            onUpload={(file) => handleUpload(activeTab, file)}
            onAdd={() => handleAdd(activeTab)}
            onAddFormChange={(field, val) =>
              setAddForm((prev) => ({ ...prev, [activeTab]: { ...prev[activeTab as MarketplaceId], [field]: val } }))
            }
            onEditStart={(id, cost) => { setEditingId(id); setEditCost(String(cost)); }}
            onEditSave={(id) => handleEditSave(activeTab, id)}
            onEditCancel={() => setEditingId(null)}
            onEditCostChange={setEditCost}
            onDelete={(id) => handleDelete(activeTab, id)}
          />
        ) : (
          <CombinedTabPanel
            state={combined}
            onSearch={(q) => {
              setCombined((prev) => ({ ...prev, q }));
              void fetchCombined(q, combined.conflictsOnly);
            }}
            onToggleConflicts={() => {
              const next = !combined.conflictsOnly;
              setCombined((prev) => ({ ...prev, conflictsOnly: next }));
              void fetchCombined(combined.q, next);
            }}
          />
        )}
      </div>
    </div>
  );
}

interface MarketplaceTabPanelProps {
  mp: MarketplaceId;
  state: MarketplaceTabState;
  addFormState: { sku: string; productName: string; cost: string };
  addingRow: boolean;
  editingId: string | null;
  editCost: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSearch: (q: string) => void;
  onPage: (page: number) => void;
  onUpload: (file: File) => void;
  onAdd: () => void;
  onAddFormChange: (field: "sku" | "productName" | "cost", val: string) => void;
  onEditStart: (id: string, cost: number) => void;
  onEditSave: (id: string) => void;
  onEditCancel: () => void;
  onEditCostChange: (val: string) => void;
  onDelete: (id: string) => void;
}

function MarketplaceTabPanel({
  mp,
  state,
  addFormState,
  addingRow,
  editingId,
  editCost,
  fileInputRef,
  onSearch,
  onPage,
  onUpload,
  onAdd,
  onAddFormChange,
  onEditStart,
  onEditSave,
  onEditCancel,
  onEditCostChange,
  onDelete,
}: MarketplaceTabPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari SKU atau nama produk..."
            value={state.q}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <label className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
          <Upload className="w-4 h-4" />
          Import File
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {state.uploadMessages && (
        <div className="space-y-1">
          {state.uploadMessages.inserted !== undefined && (
            <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
              {state.uploadMessages.inserted} baris berhasil diimport
            </p>
          )}
          {state.uploadMessages.warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">{w}</p>
          ))}
          {state.uploadMessages.errors.map((err, i) => (
            <p key={i} className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{err}</p>
          ))}
        </div>
      )}

      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
      )}

      {state.loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-left">Nama Produk</th>
                <th className="px-4 py-3 text-left">Master SKU</th>
                <th className="px-4 py-3 text-right">HPP</th>
                <th className="px-4 py-3 text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">
                    Belum ada data HPP untuk {mp}. Import file atau tambah manual.
                  </td>
                </tr>
              ) : (
                state.entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{entry.sku || "—"}</td>
                    <td className="px-4 py-3 text-slate-900">{entry.productName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{entry.masterSku || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {editingId === entry.id ? (
                        <input
                          type="number"
                          value={editCost}
                          onChange={(e) => onEditCostChange(e.target.value)}
                          className="w-28 text-right border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                        />
                      ) : (
                        <span className="font-semibold text-slate-800">{formatRupiah(entry.cost)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {editingId === entry.id ? (
                          <>
                            <button onClick={() => onEditSave(entry.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={onEditCancel} className="p-1 text-slate-500 hover:bg-slate-100 rounded">
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => onEditStart(entry.id, entry.cost)} className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => onDelete(entry.id)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {state.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>Total: {state.total} entri</span>
          <div className="flex items-center gap-2">
            <button
              disabled={state.page <= 1}
              onClick={() => onPage(state.page - 1)}
              className="px-3 py-1 border border-slate-200 rounded disabled:opacity-40 hover:bg-slate-50"
            >
              &lsaquo;
            </button>
            <span>{state.page} / {state.totalPages}</span>
            <button
              disabled={state.page >= state.totalPages}
              onClick={() => onPage(state.page + 1)}
              className="px-3 py-1 border border-slate-200 rounded disabled:opacity-40 hover:bg-slate-50"
            >
              &rsaquo;
            </button>
          </div>
        </div>
      )}

      <div className="border border-dashed border-slate-300 rounded-lg p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tambah Manual</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="SKU (opsional)"
            value={addFormState.sku}
            onChange={(e) => onAddFormChange("sku", e.target.value)}
            className="flex-1 min-w-[120px] border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Nama Produk *"
            value={addFormState.productName}
            onChange={(e) => onAddFormChange("productName", e.target.value)}
            className="flex-[2] min-w-[180px] border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="number"
            placeholder="HPP (Rp)"
            value={addFormState.cost}
            onChange={(e) => onAddFormChange("cost", e.target.value)}
            className="w-32 border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={onAdd}
            disabled={addingRow}
            className="flex items-center gap-1 px-4 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {addingRow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Tambah
          </button>
        </div>
      </div>
    </div>
  );
}

interface CombinedTabPanelProps {
  state: CombinedTabState;
  onSearch: (q: string) => void;
  onToggleConflicts: () => void;
}

function CombinedTabPanel({ state, onSearch, onToggleConflicts }: CombinedTabPanelProps) {
  const conflictSkus = new Set(state.conflicts.map((c) => c.sku));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari SKU atau nama produk..."
            value={state.q}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={onToggleConflicts}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
            state.conflictsOnly
              ? "bg-amber-500 text-white border-amber-500"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Konflik saja {state.conflicts.length > 0 && `(${state.conflicts.length})`}
        </button>
      </div>

      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{state.error}</p>
      )}

      {state.loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-left">Nama Produk</th>
                <th className="px-4 py-3 text-right">HPP</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.entries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-slate-400">
                    Tidak ada data. Upload HPP per marketplace terlebih dahulu.
                  </td>
                </tr>
              ) : (
                state.entries.map((entry) => {
                  const hasConflict = conflictSkus.has(entry.sku);
                  return (
                    <tr key={entry.id} className={`hover:bg-slate-50 transition-colors ${hasConflict ? "bg-amber-50" : ""}`}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{entry.sku || "—"}</td>
                      <td className="px-4 py-3 text-slate-900">{entry.productName}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatRupiah(entry.cost)}</td>
                      <td className="px-4 py-3 text-center">
                        {hasConflict ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                            <AlertTriangle className="w-3 h-3" />
                            Konflik
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Gabungan: {state.total} entri · {state.conflicts.length} konflik HPP lintas marketplace
      </p>
    </div>
  );
}
