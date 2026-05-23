/**
 * Module: Kas Keuangan (Cashflow) Page
 * Purpose: Display cashflow entries with income/expense summary, manual add form, and file upload
 * Used by: /cashflow route (sidebar: Kas Keuangan)
 * Dependencies: AuthAreaLayout, MonthPicker, /api/cashflow, /api/stores, /api/cashflow/upload
 * Public functions: CashflowPage (default export)
 * Side effects: GET /api/cashflow, GET /api/stores, POST /api/cashflow, POST /api/cashflow/upload
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Upload, Plus, X } from "lucide-react";
import AuthAreaLayout from "@/components/AuthAreaLayout";
import MonthPicker, { parseYearMonth } from "@/components/MonthPicker";
import { formatRupiah } from "@/lib/utils";
import type { CashflowEntry, CashflowSummary, CashflowCategory, StoreSummary } from "@/lib/types";

interface StoresResponse {
  stores: StoreSummary[];
}

interface CashflowResponse {
  entries: CashflowEntry[];
  summary: CashflowSummary;
}

type CategoryFilter = "all" | CashflowCategory;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function now(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateShort(iso: string): string {
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  const m = parseInt(parts[1], 10);
  return `${parts[2]} ${MONTHS[(m - 1)] ?? parts[1]} ${parts[0]}`;
}

export default function CashflowPage() {
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [yearMonth, setYearMonth] = useState<string>(now());
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [entries, setEntries] = useState<CashflowEntry[]>([]);
  const [summary, setSummary] = useState<CashflowSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addStoreId, setAddStoreId] = useState("");
  const [addCategory, setAddCategory] = useState<CashflowCategory>("expense");
  const [addSubCategory, setAddSubCategory] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [addDate, setAddDate] = useState(todayDate());
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Upload state
  const [uploadStoreId, setUploadStoreId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sorted entries
  const filteredEntries = entries
    .filter((e) => categoryFilter === "all" || e.category === categoryFilter)
    .sort((a, b) => (b.txnDate > a.txnDate ? 1 : -1));

  // Fetch stores
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/stores");
        if (!res.ok) return;
        const data = (await res.json()) as StoresResponse;
        setStores(data.stores ?? []);
      } catch {
        // non-critical
      }
    })();
  }, []);

  // Fetch cashflow
  const fetchCashflow = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ym = parseYearMonth(yearMonth);
      const params = new URLSearchParams();
      if (storeId) params.set("storeId", storeId);
      if (ym) {
        params.set("year", String(ym.year));
        params.set("month", String(ym.month));
      }
      if (categoryFilter !== "all") params.set("category", categoryFilter);

      const res = await fetch(`/api/cashflow?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CashflowResponse;
      setEntries(data.entries ?? []);
      setSummary(data.summary ?? null);
    } catch {
      setError("Gagal memuat data keuangan.");
    } finally {
      setLoading(false);
    }
  }, [storeId, yearMonth, categoryFilter]);

  useEffect(() => {
    void fetchCashflow();
  }, [fetchCashflow]);

  async function handleDelete(id: string) {
    if (!confirm("Hapus data keuangan ini?")) return;
    try {
      const res = await fetch(`/api/cashflow/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      alert("Gagal menghapus data.");
    }
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    setAddError(null);

    const ym = parseYearMonth(yearMonth);
    if (!ym) {
      setAddError("Pilih periode bulan terlebih dahulu.");
      setAddLoading(false);
      return;
    }
    if (!addStoreId) {
      setAddError("Pilih toko terlebih dahulu.");
      setAddLoading(false);
      return;
    }
    const amountNum = parseFloat(addAmount.replace(/[^0-9.]/g, ""));
    if (isNaN(amountNum) || amountNum <= 0) {
      setAddError("Jumlah harus lebih dari 0.");
      setAddLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/cashflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: addStoreId,
          periodYear: ym.year,
          periodMonth: ym.month,
          category: addCategory,
          subCategory: addSubCategory,
          amount: amountNum,
          description: addDescription,
          txnDate: addDate,
        }),
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Gagal menyimpan.");

      // Reset form
      setShowAddForm(false);
      setAddSubCategory("");
      setAddAmount("");
      setAddDescription("");
      setAddDate(todayDate());
      void fetchCashflow();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!uploadStoreId) {
      setUploadMsg("Pilih toko untuk upload terlebih dahulu.");
      return;
    }
    const ym = parseYearMonth(yearMonth);
    if (!ym) {
      setUploadMsg("Pilih periode bulan terlebih dahulu.");
      return;
    }

    setUploading(true);
    setUploadMsg(null);

    try {
      const fd = new FormData();
      fd.append("storeId", uploadStoreId);
      fd.append("periodYear", String(ym.year));
      fd.append("periodMonth", String(ym.month));
      fd.append("file", file);

      const res = await fetch("/api/cashflow/upload", { method: "POST", body: fd });
      const body = (await res.json()) as { inserted?: number; error?: string };

      if (!res.ok) {
        setUploadMsg(body.error ?? "Upload gagal.");
      } else {
        setUploadMsg(`Berhasil mengimpor ${body.inserted ?? 0} baris data keuangan.`);
        void fetchCashflow();
      }
    } catch {
      setUploadMsg("Upload gagal karena kesalahan jaringan.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const categoryLabel = (cat: CashflowCategory) =>
    cat === "income" ? "Pemasukan" : "Pengeluaran";

  const categoryColor = (cat: CashflowCategory) =>
    cat === "income" ? "var(--positive)" : "var(--negative)";

  return (
    <AuthAreaLayout>
      <div style={{ padding: "1.5rem 2rem", maxWidth: 1400, margin: "0 auto" }}>

        {/* Page title */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
            Kas Keuangan
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--text-subtle)", marginTop: "0.25rem" }}>
            Catat dan monitor arus kas masuk dan keluar bisnis Anda.
          </p>
        </div>

        {/* Filter bar */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "flex-end",
            marginBottom: "1.5rem",
            padding: "1rem",
            background: "var(--surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "0.875rem",
          }}
        >
          {/* Store selector */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 180 }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-subtle)" }}>Toko</label>
            <select
              value={storeId ?? ""}
              onChange={(e) => setStoreId(e.target.value || null)}
              style={{
                padding: "0.5rem 0.75rem",
                background: "var(--surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "0.65rem",
                fontSize: "0.875rem",
                color: "var(--foreground)",
              }}
            >
              <option value="">Semua toko</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.storeName} ({s.marketplace})
                </option>
              ))}
            </select>
          </div>

          {/* Month picker */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-subtle)" }}>Periode</label>
            <MonthPicker value={yearMonth} onChange={setYearMonth} />
          </div>

          {/* Category toggle */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-subtle)" }}>Kategori</label>
            <div style={{ display: "flex", gap: "0.375rem" }}>
              {(["all", "income", "expense"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  style={{
                    padding: "0.4rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "0.8125rem",
                    fontWeight: categoryFilter === cat ? 700 : 400,
                    background: categoryFilter === cat ? "var(--brand)" : "var(--surface)",
                    color: categoryFilter === cat ? "#fff" : "var(--foreground)",
                    cursor: "pointer",
                  }}
                >
                  {cat === "all" ? "Semua" : cat === "income" ? "Pemasukan" : "Pengeluaran"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "0.75rem",
              marginBottom: "1.5rem",
            }}
          >
            <div style={{ padding: "1rem 1.25rem", background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "0.875rem" }}>
              <p style={{ fontSize: "0.75rem", color: "var(--text-subtle)", margin: "0 0 0.25rem" }}>Pemasukan</p>
              <p style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--positive)", margin: 0 }}>
                {formatRupiah(summary.totalIncome)}
              </p>
            </div>
            <div style={{ padding: "1rem 1.25rem", background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "0.875rem" }}>
              <p style={{ fontSize: "0.75rem", color: "var(--text-subtle)", margin: "0 0 0.25rem" }}>Pengeluaran</p>
              <p style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--negative)", margin: 0 }}>
                {formatRupiah(summary.totalExpense)}
              </p>
            </div>
            <div style={{ padding: "1rem 1.25rem", background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "0.875rem" }}>
              <p style={{ fontSize: "0.75rem", color: "var(--text-subtle)", margin: "0 0 0.25rem" }}>Kas Bersih</p>
              <p
                style={{
                  fontSize: "1.375rem",
                  fontWeight: 700,
                  color: summary.netCashflow >= 0 ? "var(--accent)" : "var(--negative)",
                  margin: 0,
                }}
              >
                {formatRupiah(summary.netCashflow)}
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "0.75rem",
              color: "#dc2626",
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}
          >
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.5rem 1rem",
              background: "var(--brand)",
              color: "#fff",
              border: "none",
              borderRadius: "0.65rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {showAddForm ? <X style={{ width: "0.875rem", height: "0.875rem" }} /> : <Plus style={{ width: "0.875rem", height: "0.875rem" }} />}
            {showAddForm ? "Tutup Form" : "Tambah Manual"}
          </button>

          {/* Upload inline */}
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <select
              value={uploadStoreId}
              onChange={(e) => setUploadStoreId(e.target.value)}
              style={{
                padding: "0.5rem 0.75rem",
                background: "var(--surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "0.65rem",
                fontSize: "0.875rem",
                color: "var(--foreground)",
                minWidth: 160,
              }}
            >
              <option value="">Pilih toko untuk upload</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.storeName}
                </option>
              ))}
            </select>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.5rem 1rem",
                background: uploading ? "var(--surface-soft)" : "var(--accent)",
                color: uploading ? "var(--text-subtle)" : "#fff",
                borderRadius: "0.65rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: uploading ? "not-allowed" : "pointer",
              }}
            >
              {uploading ? (
                <Loader2 style={{ width: "0.875rem", height: "0.875rem", animation: "spin 1s linear infinite" }} />
              ) : (
                <Upload style={{ width: "0.875rem", height: "0.875rem" }} />
              )}
              Upload File
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                disabled={uploading}
                onChange={(e) => void handleUpload(e)}
              />
            </label>
          </div>

          {uploadMsg && (
            <span
              style={{
                fontSize: "0.875rem",
                color: uploadMsg.startsWith("Berhasil") ? "var(--positive)" : "var(--negative)",
              }}
            >
              {uploadMsg}
            </span>
          )}
        </div>

        {/* Manual add form */}
        {showAddForm && (
          <form
            onSubmit={(e) => void handleAddSubmit(e)}
            style={{
              marginBottom: "1.25rem",
              padding: "1.25rem",
              background: "var(--surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "0.875rem",
            }}
          >
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, margin: "0 0 1rem", color: "var(--foreground)" }}>
              Tambah Transaksi Manual
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem" }}>
              {/* Store */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-subtle)" }}>Toko *</label>
                <select
                  required
                  value={addStoreId}
                  onChange={(e) => setAddStoreId(e.target.value)}
                  style={{ padding: "0.5rem 0.75rem", background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "0.65rem", fontSize: "0.875rem", color: "var(--foreground)" }}
                >
                  <option value="">Pilih toko...</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>{s.storeName}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-subtle)" }}>Tanggal *</label>
                <input
                  type="date"
                  required
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                  style={{ padding: "0.5rem 0.75rem", background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "0.65rem", fontSize: "0.875rem", color: "var(--foreground)" }}
                />
              </div>

              {/* Category */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-subtle)" }}>Kategori *</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {(["income", "expense"] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setAddCategory(cat)}
                      style={{
                        flex: 1,
                        padding: "0.45rem",
                        borderRadius: "0.5rem",
                        border: `1px solid ${addCategory === cat ? (cat === "income" ? "#22c55e" : "#ef4444") : "var(--border-subtle)"}`,
                        background: addCategory === cat ? (cat === "income" ? "#f0fdf4" : "#fef2f2") : "var(--surface)",
                        color: addCategory === cat ? (cat === "income" ? "#16a34a" : "#dc2626") : "var(--text-subtle)",
                        fontWeight: addCategory === cat ? 700 : 400,
                        fontSize: "0.8125rem",
                        cursor: "pointer",
                      }}
                    >
                      {cat === "income" ? "Pemasukan" : "Pengeluaran"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sub-category */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-subtle)" }}>Sub-Kategori</label>
                <input
                  type="text"
                  placeholder="misal: Ongkir, Iklan, Gaji..."
                  value={addSubCategory}
                  onChange={(e) => setAddSubCategory(e.target.value)}
                  style={{ padding: "0.5rem 0.75rem", background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "0.65rem", fontSize: "0.875rem", color: "var(--foreground)" }}
                />
              </div>

              {/* Amount */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-subtle)" }}>Jumlah (Rp) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  placeholder="0"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  style={{ padding: "0.5rem 0.75rem", background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "0.65rem", fontSize: "0.875rem", color: "var(--foreground)" }}
                />
              </div>

              {/* Description */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-subtle)" }}>Keterangan</label>
                <input
                  type="text"
                  placeholder="Keterangan transaksi..."
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  style={{ padding: "0.5rem 0.75rem", background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "0.65rem", fontSize: "0.875rem", color: "var(--foreground)" }}
                />
              </div>
            </div>

            {addError && (
              <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--negative)" }}>{addError}</p>
            )}

            <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
              <button
                type="submit"
                disabled={addLoading}
                style={{
                  padding: "0.5rem 1.25rem",
                  background: "var(--brand)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "0.65rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: addLoading ? "not-allowed" : "pointer",
                  opacity: addLoading ? 0.7 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.375rem",
                }}
              >
                {addLoading && <Loader2 style={{ width: "0.875rem", height: "0.875rem", animation: "spin 1s linear infinite" }} />}
                Simpan
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setAddError(null); }}
                style={{
                  padding: "0.5rem 1rem",
                  background: "var(--surface-soft)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "0.65rem",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                Batal
              </button>
            </div>
          </form>
        )}

        {/* Table */}
        {!loading && entries.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "3rem 1rem",
              color: "var(--text-subtle)",
              fontSize: "0.9375rem",
              background: "var(--surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "0.875rem",
            }}
          >
            Belum ada data kas keuangan.
          </div>
        ) : (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "0.875rem",
              overflow: "hidden",
            }}
          >
            {loading && (
              <div style={{ padding: "1rem", display: "flex", justifyContent: "center" }}>
                <Loader2 style={{ width: "1.25rem", height: "1.25rem", animation: "spin 1s linear infinite", color: "var(--text-subtle)" }} />
              </div>
            )}
            {!loading && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr style={{ background: "var(--surface-soft)" }}>
                      {["Tanggal", "Kategori", "Sub-Kategori", "Keterangan", "Jumlah", ""].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: "0.75rem 1rem",
                            textAlign: h === "Jumlah" ? "right" : h === "" ? "center" : "left",
                            fontWeight: 600,
                            color: "var(--text-subtle)",
                            fontSize: "0.75rem",
                            whiteSpace: "nowrap",
                            borderBottom: "1px solid var(--border-subtle)",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((e) => (
                      <tr key={e.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "0.75rem 1rem", whiteSpace: "nowrap", color: "var(--text-subtle)", fontSize: "0.8125rem" }}>
                          {formatDateShort(e.txnDate)}
                        </td>
                        <td style={{ padding: "0.75rem 1rem" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "0.2rem 0.6rem",
                              borderRadius: "999px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              background: e.category === "income" ? "#f0fdf4" : "#fef2f2",
                              color: categoryColor(e.category),
                            }}
                          >
                            {categoryLabel(e.category)}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 1rem", color: "var(--text-subtle)", fontSize: "0.8125rem" }}>
                          {e.subCategory || "—"}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", color: "var(--foreground)" }}>{e.description || "—"}</td>
                        <td
                          style={{
                            padding: "0.75rem 1rem",
                            textAlign: "right",
                            fontWeight: 700,
                            color: categoryColor(e.category),
                            whiteSpace: "nowrap",
                          }}
                        >
                          {e.category === "expense" ? "− " : "+ "}
                          {formatRupiah(e.amount)}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => void handleDelete(e.id)}
                            title="Hapus"
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "var(--text-subtle)",
                              padding: "0.25rem",
                              borderRadius: "0.375rem",
                            }}
                          >
                            <Trash2 style={{ width: "0.875rem", height: "0.875rem" }} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AuthAreaLayout>
  );
}
