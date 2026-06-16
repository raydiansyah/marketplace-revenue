/**
 * Module: HppMasterManager
 * Purpose: Main HPP management UI — import master Excel file and display HPP master table
 * Used by: src/app/hpp/page.tsx
 * Dependencies: /api/hpp/master, HppUnmatchedPanel, lucide-react, formatRupiah
 * Public functions: HppMasterManager (default export)
 * Side effects: GET /api/hpp/master (list), POST /api/hpp/master (import), POST /api/hpp/master/resolve
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Loader2, FileSpreadsheet, RefreshCw } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import HppUnmatchedPanel from "@/components/HppUnmatchedPanel";
import type { HppEntry } from "@/lib/types";

interface MasterEntry extends HppEntry {
  id: string;
}

interface FetchState {
  entries: MasterEntry[];
  total: number;
  page: number;
  totalPages: number;
}

export default function HppMasterManager() {
  const [data, setData] = useState<FetchState>({ entries: [], total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [importResult, setImportResult] = useState<{
    inserted: number;
    warnings: string[];
    unmatchedOrderSkus: string[];
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchEntries = useCallback(async (p: number, query: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20", q: query });
      const res = await fetch(`/api/hpp/master?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch {
      // keep stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries(page, q);
  }, [page, q, fetchEntries]);

  async function handleImport(file: File) {
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/hpp/master", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setImportError(json.error ?? "Import gagal");
        return;
      }
      setImportResult(json);
      setPage(1);
      await fetchEntries(1, q);
    } catch {
      setImportError("Terjadi kesalahan saat import");
    } finally {
      setImporting(false);
    }
  }

  async function handleResolve(orderSku: string, masterEntryId: string) {
    await fetch("/api/hpp/master/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderSku, masterEntryId }),
    });
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImport(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleImport(file);
  }

  return (
    <div className="space-y-6">
      {/* Import area */}
      <div
        className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-zinc-500 transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFilePick}
        />
        {importing ? (
          <div className="flex flex-col items-center gap-2 text-zinc-400">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Mengimport master HPP...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-500">
            <FileSpreadsheet className="w-8 h-8" />
            <p className="text-sm font-medium text-zinc-300">Import Master HPP</p>
            <p className="text-xs">Drag &amp; drop atau klik untuk pilih file Excel (.xlsx/.xls)</p>
          </div>
        )}
      </div>

      {/* Import result */}
      {importError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          {importError}
        </div>
      )}
      {importResult && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-3 text-sm text-green-300">
          {importResult.inserted} produk berhasil diimport.
          {importResult.warnings.length > 0 && (
            <ul className="mt-1 text-xs text-yellow-300 list-disc list-inside">
              {importResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Unmatched panel */}
      {importResult && importResult.unmatchedOrderSkus.length > 0 && (
        <HppUnmatchedPanel
          unmatchedSkus={importResult.unmatchedOrderSkus}
          masterEntries={data.entries}
          onResolve={handleResolve}
          onDismiss={() =>
            setImportResult((prev) =>
              prev ? { ...prev, unmatchedOrderSkus: [] } : null
            )
          }
        />
      )}

      {/* Table header */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Cari SKU atau nama produk..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <span className="text-xs text-zinc-500 shrink-0">{data.total} produk</span>
        <button
          onClick={() => fetchEntries(page, q)}
          className="p-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/60">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">SKU</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Nama Produk</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Master SKU</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">HPP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading && data.entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </td>
              </tr>
            ) : data.entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500 text-sm">
                  {q
                    ? "Tidak ada produk yang cocok"
                    : "Belum ada data HPP master. Import file Excel untuk memulai."}
                </td>
              </tr>
            ) : (
              data.entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-zinc-300">{entry.sku || "-"}</td>
                  <td className="px-4 py-3 text-zinc-200">{entry.productName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">{entry.masterSku || "-"}</td>
                  <td className="px-4 py-3 text-right text-zinc-200 font-medium">{formatRupiah(entry.cost)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-xs text-zinc-500">
            {page} / {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages}
            className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
