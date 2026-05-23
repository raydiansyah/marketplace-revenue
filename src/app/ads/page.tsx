/**
 * Module: Ads & ROAS Page
 * Purpose: Display ads campaign performance data with KPI tiles, sortable table, and upload form
 * Used by: /ads route (sidebar: Iklan & ROAS)
 * Dependencies: AuthAreaLayout, MonthPicker, /api/ads, /api/stores, /api/ads/upload
 * Public functions: AdsPage (default export)
 * Side effects: GET /api/ads, GET /api/stores, POST /api/ads/upload
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Upload, RefreshCw } from "lucide-react";
import AuthAreaLayout from "@/components/AuthAreaLayout";
import MonthPicker, { parseYearMonth } from "@/components/MonthPicker";
import { formatRupiah, formatNumber } from "@/lib/utils";
import type { AdsEntry, AdsSummary, StoreSummary } from "@/lib/types";

interface StoresResponse {
  stores: StoreSummary[];
}

interface AdsResponse {
  entries: AdsEntry[];
  summary: AdsSummary;
}

const MARKETPLACE_OPTIONS = [
  { value: "shopee", label: "Shopee" },
  { value: "tokopedia", label: "Tokopedia / TikTok" },
  { value: "lazada", label: "Lazada" },
] as const;

type MarketplaceValue = (typeof MARKETPLACE_OPTIONS)[number]["value"];

function now(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdsPage() {
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [yearMonth, setYearMonth] = useState<string>(now());
  const [entries, setEntries] = useState<AdsEntry[]>([]);
  const [summary, setSummary] = useState<AdsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploadMarketplace, setUploadMarketplace] = useState<MarketplaceValue>("shopee");
  const [uploadStoreId, setUploadStoreId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sort
  const sortedEntries = [...entries].sort((a, b) => b.spend - a.spend);

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

  // Fetch ads data
  const fetchAds = useCallback(async () => {
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
      const res = await fetch(`/api/ads?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AdsResponse;
      setEntries(data.entries ?? []);
      setSummary(data.summary ?? null);
    } catch {
      setError("Gagal memuat data iklan.");
    } finally {
      setLoading(false);
    }
  }, [storeId, yearMonth]);

  useEffect(() => {
    void fetchAds();
  }, [fetchAds]);

  async function handleDelete(id: string) {
    if (!confirm("Hapus data iklan ini?")) return;
    try {
      const res = await fetch(`/api/ads/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      alert("Gagal menghapus data.");
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!uploadStoreId) {
      setUploadMsg("Pilih toko terlebih dahulu.");
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
      fd.append("marketplace", uploadMarketplace);
      fd.append("periodYear", String(ym.year));
      fd.append("periodMonth", String(ym.month));
      fd.append("file", file);

      const res = await fetch("/api/ads/upload", { method: "POST", body: fd });
      const body = (await res.json()) as { inserted?: number; error?: string };

      if (!res.ok) {
        setUploadMsg(body.error ?? "Upload gagal.");
      } else {
        setUploadMsg(`Berhasil mengimpor ${body.inserted ?? 0} baris data iklan.`);
        void fetchAds();
      }
    } catch {
      setUploadMsg("Upload gagal karena kesalahan jaringan.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const roasDisplay = summary ? summary.roas.toFixed(2) : "—";
  const cpaDisplay = summary ? formatRupiah(summary.cpa) : "—";

  return (
    <AuthAreaLayout>
      <div style={{ padding: "1.5rem 2rem", maxWidth: 1400, margin: "0 auto" }}>

        {/* Page title */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--foreground)", margin: 0 }}>
            Iklan & ROAS
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--text-subtle)", marginTop: "0.25rem" }}>
            Monitor performa kampanye iklan marketplace — biaya, konversi, dan ROAS.
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
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-subtle)" }}>
              Toko
            </label>
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
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-subtle)" }}>
              Periode
            </label>
            <MonthPicker value={yearMonth} onChange={setYearMonth} />
          </div>

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => void fetchAds()}
            disabled={loading}
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
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <Loader2 style={{ width: "0.875rem", height: "0.875rem", animation: "spin 1s linear infinite" }} />
            ) : (
              <RefreshCw style={{ width: "0.875rem", height: "0.875rem" }} />
            )}
            Muat
          </button>
        </div>

        {/* KPI tiles */}
        {summary && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "0.75rem",
              marginBottom: "1.5rem",
            }}
          >
            {[
              { label: "Total Biaya Iklan", value: formatRupiah(summary.totalSpend), accent: "var(--negative)" },
              { label: "Total Revenue Iklan", value: formatRupiah(summary.totalRevenue), accent: "var(--positive)" },
              { label: "ROAS", value: `${roasDisplay}x`, accent: "var(--accent)" },
              { label: "Total Klik", value: formatNumber(summary.totalClicks), accent: "var(--foreground)" },
              { label: "Konversi", value: formatNumber(summary.totalConversions), accent: "var(--foreground)" },
            ].map((tile) => (
              <div
                key={tile.label}
                style={{
                  padding: "1rem 1.25rem",
                  background: "var(--surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "0.875rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.375rem",
                }}
              >
                <p style={{ fontSize: "0.75rem", color: "var(--text-subtle)", margin: 0 }}>{tile.label}</p>
                <p style={{ fontSize: "1.375rem", fontWeight: 700, color: tile.accent, margin: 0 }}>
                  {tile.value}
                </p>
              </div>
            ))}
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
            Belum ada data iklan. Upload file iklan terlebih dahulu.
          </div>
        ) : (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "0.875rem",
              overflow: "hidden",
              marginBottom: "1.5rem",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr style={{ background: "var(--surface-soft)" }}>
                    {["Kampanye", "SKU", "Biaya Iklan", "Impressi", "Klik", "Konversi", "Revenue", "ROAS", ""].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "0.75rem 1rem",
                          textAlign: h === "" ? "center" : "left",
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
                  {sortedEntries.map((e) => {
                    const rowRoas = e.spend > 0 ? (e.revenue / e.spend).toFixed(2) : "—";
                    return (
                      <tr
                        key={e.id}
                        style={{ borderBottom: "1px solid var(--border-subtle)" }}
                      >
                        <td style={{ padding: "0.75rem 1rem", color: "var(--foreground)" }}>{e.campaignName}</td>
                        <td style={{ padding: "0.75rem 1rem", color: "var(--text-subtle)", fontFamily: "monospace", fontSize: "0.8125rem" }}>
                          {e.sku || "—"}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", color: "var(--negative)", fontWeight: 600 }}>
                          {formatRupiah(e.spend)}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>{formatNumber(e.impressions)}</td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>{formatNumber(e.clicks)}</td>
                        <td style={{ padding: "0.75rem 1rem", textAlign: "right" }}>{formatNumber(e.conversions)}</td>
                        <td style={{ padding: "0.75rem 1rem", color: "var(--positive)", fontWeight: 600 }}>
                          {formatRupiah(e.revenue)}
                        </td>
                        <td style={{ padding: "0.75rem 1rem", fontWeight: 700, color: "var(--accent)" }}>
                          {rowRoas !== "—" ? `${rowRoas}x` : "—"}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Upload section */}
        <div
          style={{
            padding: "1.25rem",
            background: "var(--surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "0.875rem",
          }}
        >
          <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--foreground)", margin: "0 0 1rem" }}>
            Upload File Iklan
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
            {/* Upload marketplace */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-subtle)" }}>
                Marketplace
              </label>
              <select
                value={uploadMarketplace}
                onChange={(e) => setUploadMarketplace(e.target.value as MarketplaceValue)}
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
                {MARKETPLACE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Upload store */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", minWidth: 180 }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-subtle)" }}>
                Toko
              </label>
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
                }}
              >
                <option value="">Pilih toko...</option>
                {stores
                  .filter((s) => s.marketplace === uploadMarketplace)
                  .map((s) => (
                    <option key={s.id} value={s.id}>{s.storeName}</option>
                  ))}
              </select>
            </div>

            {/* File input */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-subtle)" }}>
                File (.xlsx / .csv)
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
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
                {uploading ? "Mengupload..." : "Pilih File"}
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
          </div>

          {uploadMsg && (
            <p
              style={{
                marginTop: "0.75rem",
                fontSize: "0.875rem",
                color: uploadMsg.startsWith("Berhasil") ? "var(--positive)" : "var(--negative)",
              }}
            >
              {uploadMsg}
            </p>
          )}
        </div>
      </div>
    </AuthAreaLayout>
  );
}
