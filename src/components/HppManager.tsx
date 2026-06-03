"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, Edit2, Check, X, Search, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { parseProductMasterFileWithMeta } from "@/lib/parsers/productMaster";
import { formatRupiah } from "@/lib/utils";
import { useNotification } from "@/lib/notifications/notification-context";

type SortKey = "masterSku" | "productName" | "cost";
type SortDir = "asc" | "desc";

export default function HppManager({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const { hppEntries, addHppEntryAndSync, replaceHppEntriesAndSync, hppLoading, hppError, loadHpp } = useAppStore();
  const { notify } = useNotification();
  const [form, setForm] = useState({ sku: "", productName: "", cost: "" });
  const [open, setOpen] = useState(defaultOpen);
  const [duplicateKeys, setDuplicateKeys] = useState<string[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);
  const [adding, setAdding] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ cost: "", masterSku: "" });
  const [filterQuery, setFilterQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: SortDir }>({ key: "productName", dir: "asc" });
  const [filterByMasterSku, setFilterByMasterSku] = useState("");
  const [filterBySku, setFilterBySku] = useState("");
  const [filterByProductName, setFilterByProductName] = useState("");
  const [filterByHpp, setFilterByHpp] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const handleAdd = async () => {
    setAddError(null);
    if (!form.productName.trim()) {
      setAddError("Nama Produk wajib diisi.");
      return;
    }
    const cost = parseFloat(form.cost);
    if (!form.cost || isNaN(cost) || cost < 0) {
      setAddError("HPP harus berupa angka >= 0.");
      return;
    }
    setAdding(true);
    const ok = await addHppEntryAndSync({ sku: form.sku.trim(), productName: form.productName.trim(), cost });
    setAdding(false);
    if (!ok) {
      setAddError("Gagal menyimpan HPP ke server. Coba lagi.");
      notify("error", "Gagal menyimpan HPP ke database.");
      return;
    }
    setForm({ sku: "", productName: "", cost: "" });
    setAddSuccess(true);
    notify("success", "HPP berhasil disimpan.");
    setTimeout(() => setAddSuccess(false), 2000);
  };

  const handleImportMasterFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setSyncError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
    const content = isExcel ? await file.arrayBuffer() : await file.text();
    const { entries, duplicateLabels } = parseProductMasterFileWithMeta(content);
    setDuplicateKeys(duplicateLabels);
    setSavingChanges(true);
    const ok = await replaceHppEntriesAndSync(entries);
    setSavingChanges(false);
    if (!ok) {
      setSyncError("Gagal menyimpan hasil import HPP ke database.");
      notify("error", "Import HPP gagal disimpan ke database.");
      return;
    }
    notify("success", `Import HPP berhasil disimpan (${entries.length} entri).`);
    e.target.value = "";
  };

  const handleResetHpp = async () => {
    setSyncError(null);
    setSavingChanges(true);
    const ok = await replaceHppEntriesAndSync([]);
    setSavingChanges(false);
    if (!ok) {
      setSyncError("Gagal mereset HPP di database.");
      notify("error", "Reset HPP gagal disimpan ke database.");
      return;
    }
    notify("success", "Semua data HPP berhasil direset.");
    setDuplicateKeys([]);
    setForm({ sku: "", productName: "", cost: "" });
  };

  const handleEditStart = (entry: { key: string; masterSku: string; cost: number }) => {
    setEditingKey(entry.key);
    setEditValues({ cost: String(entry.cost), masterSku: entry.masterSku });
  };

  const handleEditSave = async (entry: { key: string; masterProductName: string; masterSku: string; cost: number }) => {
    setSyncError(null);
    const newCost = parseFloat(editValues.cost);
    if (isNaN(newCost) || newCost < 0) return;
    const newMasterSku = editValues.masterSku.trim();

    const updated = hppEntries.map((e) => {
      const eMasterProductName = (e.masterProductName || e.productName || "").trim().toLowerCase();
      const eMasterSku = (e.masterSku || e.sku || "").trim().toLowerCase();
      const isMatch =
        eMasterProductName === entry.masterProductName.trim().toLowerCase() &&
        eMasterSku === entry.masterSku.trim().toLowerCase() &&
        e.cost === entry.cost;
      if (!isMatch) return e;
      return { ...e, cost: newCost, masterSku: newMasterSku };
    });

    setSavingChanges(true);
    const ok = await replaceHppEntriesAndSync(updated);
    setSavingChanges(false);
    if (!ok) {
      setSyncError("Gagal menyimpan perubahan HPP.");
      notify("error", "Perubahan HPP gagal disimpan.");
      return;
    }
    notify("success", "Perubahan HPP berhasil disimpan.");
    setEditingKey(null);
  };

  const handleDelete = async (entry: { masterProductName: string; masterSku: string; cost: number }) => {
    if (!confirm(`Hapus entri HPP "${entry.masterProductName || entry.masterSku}"?`)) return;
    setSyncError(null);
    setSavingChanges(true);
    const ok = await replaceHppEntriesAndSync(
      hppEntries.filter((e) => {
        const eMasterProductName = (e.masterProductName || e.productName || "").trim().toLowerCase();
        const eMasterSku = (e.masterSku || e.sku || "").trim().toLowerCase();
        return !(
          eMasterProductName === entry.masterProductName.trim().toLowerCase() &&
          eMasterSku === entry.masterSku.trim().toLowerCase() &&
          e.cost === entry.cost
        );
      })
    );
    setSavingChanges(false);
    if (!ok) {
      setSyncError("Gagal menghapus entri HPP dari database.");
      notify("error", "Gagal menghapus entri HPP.");
      return;
    }
    notify("success", "Entri HPP berhasil dihapus.");
  };

  const hppPreviewEntries = Array.from(
    hppEntries.reduce(
      (acc, entry) => {
        const masterProductName = (entry.masterProductName || entry.productName || "").trim();
        const masterSku = (entry.masterSku || entry.sku || "").trim();
        const key = `${masterProductName.toLowerCase()}|${masterSku.toLowerCase()}|${entry.cost}`;

        if (!acc.has(key)) {
          acc.set(key, {
            key,
            masterProductName,
            masterSku,
            sku: entry.sku,
            productName: entry.productName,
            cost: entry.cost,
          });
        }

        return acc;
      },
      new Map<
        string,
        {
          key: string;
          masterProductName: string;
          masterSku: string;
          sku: string;
          productName: string;
          cost: number;
        }
      >()
    ).values()
  );

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  const filteredAndSortedEntries = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    const masterSkuQ = filterByMasterSku.trim().toLowerCase();
    const skuQ = filterBySku.trim().toLowerCase();
    const productNameQ = filterByProductName.trim().toLowerCase();
    const hppQ = filterByHpp.trim().toLowerCase();

    const filtered = hppPreviewEntries.filter((e) => {
      // Global search
      if (q && !e.masterSku.toLowerCase().includes(q) && !e.sku.toLowerCase().includes(q) && !(e.masterProductName || e.productName).toLowerCase().includes(q)) {
        return false;
      }
      // Column-specific filters
      if (masterSkuQ && !e.masterSku.toLowerCase().includes(masterSkuQ)) return false;
      if (skuQ && !e.sku.toLowerCase().includes(skuQ)) return false;
      if (productNameQ && !(e.masterProductName || e.productName).toLowerCase().includes(productNameQ)) return false;
      if (hppQ && !e.cost.toString().includes(hppQ)) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      let valA: string | number;
      let valB: string | number;
      if (sortConfig.key === "masterSku") {
        valA = a.masterSku.toLowerCase();
        valB = b.masterSku.toLowerCase();
      } else if (sortConfig.key === "cost") {
        valA = a.cost;
        valB = b.cost;
      } else {
        valA = (a.masterProductName || a.productName).toLowerCase();
        valB = (b.masterProductName || b.productName).toLowerCase();
      }
      if (valA < valB) return sortConfig.dir === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.dir === "asc" ? 1 : -1;
      return 0;
    });
  }, [hppPreviewEntries, filterQuery, filterByMasterSku, filterBySku, filterByProductName, filterByHpp, sortConfig]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedEntries.length / itemsPerPage);
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedEntries.slice(start, start + itemsPerPage);
  }, [filteredAndSortedEntries, currentPage, itemsPerPage]);

  const handleResetFilters = () => {
    setFilterQuery("");
    setFilterByMasterSku("");
    setFilterBySku("");
    setFilterByProductName("");
    setFilterByHpp("");
    setCurrentPage(1);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortConfig.key !== col) return <ArrowUpDown className="w-3 h-3 opacity-40 inline-block ml-1" />;
    return sortConfig.dir === "asc"
      ? <ArrowUp className="w-3 h-3 inline-block ml-1 text-cyan-400" />
      : <ArrowDown className="w-3 h-3 inline-block ml-1 text-cyan-400" />;
  };

  return (
    <div className="panel-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-soft)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-[var(--text)]">HPP (Harga Pokok Penjualan)</span>
          {hppEntries.length > 0 && (
            <span className="text-xs bg-[var(--surface-soft)] text-[var(--text-subtle)] px-2 py-0.5 rounded-full border border-[var(--border-subtle)] inline-flex items-center gap-1.5">
              {hppLoading && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
              {hppPreviewEntries.length} Master SKU
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-[var(--text-subtle)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-subtle)]" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-[var(--border-subtle)] pt-4 space-y-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <input
              placeholder="SKU (opsional)"
              value={form.sku}
              onChange={(e) => { setAddError(null); setForm({ ...form, sku: e.target.value }); }}
              className="field-input"
            />
            <input
              placeholder="Nama Produk *"
              value={form.productName}
              onChange={(e) => { setAddError(null); setForm({ ...form, productName: e.target.value }); }}
              className={`field-input${addError && !form.productName.trim() ? " border-red-400" : ""}`}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <div className="flex gap-2">
              <input
                placeholder="HPP (Rp) *"
                value={form.cost}
                onChange={(e) => { setAddError(null); setForm({ ...form, cost: e.target.value }); }}
                type="number"
                min={0}
                className={`field-input flex-1${addError && (!form.cost || isNaN(parseFloat(form.cost))) ? " border-red-400" : ""}`}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <button
                onClick={handleAdd}
                disabled={adding}
                className={`rounded-lg px-3 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${addSuccess ? "bg-emerald-600 text-white" : "action-primary"}`}
                title="Tambah entri HPP"
              >
                {adding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : addSuccess ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
          {addError && (
            <p className="text-xs text-red-400">{addError}</p>
          )}

          {hppLoading && hppEntries.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-subtle)] py-2">
              <Loader2 className="animate-spin w-3.5 h-3.5 shrink-0" />
              Memuat data HPP...
            </div>
          )}

          {hppError && !hppLoading && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-red-300">{hppError}</span>
              <button onClick={() => loadHpp()} className="text-xs text-red-300 hover:text-red-200 underline ml-3 shrink-0">Coba Lagi</button>
            </div>
          )}
          {syncError && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2">
              <span className="text-xs text-red-300">{syncError}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-[var(--text-subtle)]">
              Gunakan tombol reset untuk hapus seluruh data HPP.
              {savingChanges ? " Menyimpan perubahan..." : ""}
            </p>
            <button
              onClick={handleResetHpp}
              disabled={hppEntries.length === 0 || savingChanges}
              className="text-xs px-3 py-1.5 border border-[var(--border-subtle)] rounded-lg text-[var(--text-subtle)] hover:bg-[var(--surface-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset HPP
            </button>
          </div>

          <div className="rounded-lg p-3 border border-[var(--border-subtle)] bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(14,165,233,0.12))]">
            <p className="text-xs font-semibold text-[var(--text)] mb-1">Upload File HPP Produk (XLSX / CSV)</p>
            <p className="text-xs text-[var(--text-subtle)] mb-2">
              Kolom: Master Product Name, Variant Name, Master SKU, HPP New, HPP Old, Master variation ID, Channel variation ID
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleImportMasterFile}
              className="block w-full text-xs text-[var(--text-subtle)] file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-700"
            />
            <p className="text-[11px] text-cyan-300 mt-1 font-medium">HPP yang dipakai per Master SKU: HPP New (kolom H), fallback ke HPP Old (kolom G).</p>
          </div>

          {duplicateKeys.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
              <p className="text-xs font-medium text-amber-800">Ditemukan {duplicateKeys.length} data duplikat (SKU/Nama Produk).</p>
              <p className="text-xs text-amber-700 mt-1">Sistem otomatis memakai baris terakhir untuk key yang sama.</p>
            </div>
          )}

          {hppEntries.length > 0 && (
            <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-[var(--surface-soft)] border-b border-[var(--border-subtle)] flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-[var(--text-subtle)] shrink-0" />
                <input
                  type="text"
                  placeholder="Filter SKU atau nama produk..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="bg-transparent text-xs text-[var(--text)] placeholder:text-[var(--text-subtle)] outline-none flex-1"
                />
                {filterQuery && (
                  <button onClick={() => setFilterQuery("")} className="text-[var(--text-subtle)] hover:text-[var(--text)]">
                    <X className="w-3 h-3" />
                  </button>
                )}
                <span className="text-xs text-[var(--text-subtle)] shrink-0">
                  {filteredAndSortedEntries.length}/{hppPreviewEntries.length}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-soft)]">
                  <tr>
                    <th
                      className="text-left px-3 py-2 text-xs text-[var(--text-subtle)] cursor-pointer select-none hover:text-[var(--text)] whitespace-nowrap"
                      onClick={() => handleSort("masterSku")}
                    >
                      Master SKU<SortIcon col="masterSku" />
                    </th>
                    <th className="text-left px-3 py-2 text-xs text-[var(--text-subtle)]">SKU</th>
                    <th
                      className="text-left px-3 py-2 text-xs text-[var(--text-subtle)] cursor-pointer select-none hover:text-[var(--text)] whitespace-nowrap"
                      onClick={() => handleSort("productName")}
                    >
                      Nama Produk<SortIcon col="productName" />
                    </th>
                    <th
                      className="text-right px-3 py-2 text-xs text-[var(--text-subtle)] cursor-pointer select-none hover:text-[var(--text)] whitespace-nowrap"
                      onClick={() => handleSort("cost")}
                    >
                      HPP/unit<SortIcon col="cost" />
                    </th>
                    <th className="px-2 py-2" />
                  </tr>
                  <tr className="bg-[var(--surface-soft)] border-b-2 border-[var(--border-subtle)]">
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={filterByMasterSku}
                        onChange={(e) => {
                          setFilterByMasterSku(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="field-input w-full text-xs"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={filterBySku}
                        onChange={(e) => {
                          setFilterBySku(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="field-input w-full text-xs"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={filterByProductName}
                        onChange={(e) => {
                          setFilterByProductName(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="field-input w-full text-xs"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={filterByHpp}
                        onChange={(e) => {
                          setFilterByHpp(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="field-input w-full text-xs text-right"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      {(filterByMasterSku || filterBySku || filterByProductName || filterByHpp) && (
                        <button
                          onClick={handleResetFilters}
                          className="text-[var(--text-subtle)] hover:text-[var(--text)]"
                          title="Reset filters"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {paginatedEntries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-xs text-[var(--text-subtle)]">
                        {filteredAndSortedEntries.length === 0 ? "Tidak ada hasil" : "Halaman kosong"}
                      </td>
                    </tr>
                  )}
                  {paginatedEntries.map((entry) =>
                    editingKey === entry.key ? (
                      <tr key={entry.key} className="bg-[var(--surface-soft)]">
                        <td className="px-3 py-1.5">
                          <input
                            value={editValues.masterSku}
                            onChange={(e) => setEditValues((v) => ({ ...v, masterSku: e.target.value }))}
                            placeholder="Master SKU"
                            className="field-input w-full font-mono text-xs"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-[var(--text-subtle)] font-mono text-xs">{entry.sku}</td>
                        <td className="px-3 py-1.5 text-[var(--text)] text-sm">{entry.masterProductName || entry.productName}</td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min={0}
                            value={editValues.cost}
                            onChange={(e) => setEditValues((v) => ({ ...v, cost: e.target.value }))}
                            className="field-input w-full text-right"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleEditSave(entry);
                              if (e.key === "Escape") setEditingKey(null);
                            }}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEditSave(entry)}
                              className="text-emerald-400 hover:text-emerald-300"
                              title="Simpan"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingKey(null)}
                              className="text-[var(--text-subtle)] hover:text-[var(--text)]"
                              title="Batal"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={entry.key} className="hover:bg-[var(--surface-soft)]">
                        <td className="px-3 py-2 text-[var(--text-subtle)] font-mono text-xs">{entry.masterSku || "-"}</td>
                        <td className="px-3 py-2 text-[var(--text-subtle)] font-mono text-xs">{entry.sku}</td>
                        <td className="px-3 py-2 text-[var(--text)]">{entry.masterProductName || entry.productName}</td>
                        <td className="px-3 py-2 text-right text-cyan-300 font-medium">{formatRupiah(entry.cost)}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEditStart(entry)}
                              className="text-[var(--text-subtle)] hover:text-[var(--text)]"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(entry)}
                              className="text-[var(--text-subtle)] hover:text-red-400"
                              title="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
              <div className="px-3 py-2 bg-[var(--surface-soft)] border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-subtle)]">
                <div className="flex items-center gap-3">
                  <span>
                    Tampilkan:
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="ml-2 bg-transparent border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-xs text-[var(--text)] cursor-pointer"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                    per halaman
                  </span>
                </div>
                <span>
                  {filteredAndSortedEntries.length === 0
                    ? "0 entri"
                    : `${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, filteredAndSortedEntries.length)} dari ${filteredAndSortedEntries.length}`}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded hover:bg-[var(--surface)] disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Halaman sebelumnya"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="mx-1 min-w-[40px] text-center">
                    {filteredAndSortedEntries.length === 0 ? "0" : currentPage} / {totalPages || 1}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded hover:bg-[var(--surface)] disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Halaman berikutnya"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
