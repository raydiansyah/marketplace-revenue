/**
 * Module: Ads & ROAS Page
 * Purpose: Display ads campaign performance data with KPI tiles, sortable table, and upload form
 * Used by: /ads route (sidebar: Iklan & ROAS)
 * Dependencies: AuthAreaLayout, MonthPicker, /api/ads, /api/stores, /api/ads/upload
 * Public functions: AdsPage (default export)
 * Side effects: GET /api/ads, GET /api/stores, POST /api/ads/upload
 */

"use client";

import { Loader2, RefreshCw, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import AuthAreaLayout from "@/components/AuthAreaLayout";
import MonthPicker, { parseYearMonth } from "@/components/MonthPicker";
import type { AdsEntry, AdsSummary, StoreSummary } from "@/lib/types";
import { formatNumber, formatRupiah } from "@/lib/utils";

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
	const [uploadMarketplace, setUploadMarketplace] =
		useState<MarketplaceValue>("shopee");
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
				setUploadMsg(
					`Berhasil mengimpor ${body.inserted ?? 0} baris data iklan.`,
				);
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

	return (
		<AuthAreaLayout>
			<div className="mx-auto max-w-[1400px] px-6 py-6">
				{/* Page title */}
				<div className="mb-6">
					<h1 className="text-2xl font-bold text-foreground">Iklan & ROAS</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Monitor performa kampanye iklan marketplace — biaya, konversi, dan
						ROAS.
					</p>
				</div>

				{/* Filter bar */}
				<div className="panel-card p-4 mb-6 flex flex-wrap gap-3 items-end">
					{/* Store selector */}
					<div className="flex flex-col gap-1 min-w-[180px]">
						<label
							htmlFor="filter-store"
							className="text-xs font-semibold text-muted-foreground"
						>
							Toko
						</label>
						<select
							id="filter-store"
							value={storeId ?? ""}
							onChange={(e) => setStoreId(e.target.value || null)}
							className="field-input"
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
					<div className="flex flex-col gap-1">
						<span className="text-xs font-semibold text-muted-foreground">
							Periode
						</span>
						<MonthPicker value={yearMonth} onChange={setYearMonth} />
					</div>

					{/* Refresh button */}
					<button
						type="button"
						onClick={() => void fetchAds()}
						disabled={loading}
						className="flex items-center gap-1.5 px-4 py-2 bg-[var(--foreground)] text-[var(--background)] text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
					>
						{loading ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : (
							<RefreshCw className="w-4 h-4" />
						)}
						Muat
					</button>
				</div>

				{/* KPI tiles */}
				{summary && (
					<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
						<div className="stat-tile">
							<p className="text-xs text-muted-foreground">Total Biaya Iklan</p>
							<p className="text-2xl font-bold text-[var(--negative)]">
								{formatRupiah(summary.totalSpend)}
							</p>
						</div>
						<div className="stat-tile">
							<p className="text-xs text-muted-foreground">
								Total Revenue Iklan
							</p>
							<p className="text-2xl font-bold text-[var(--positive)]">
								{formatRupiah(summary.totalRevenue)}
							</p>
						</div>
						<div className="stat-tile">
							<p className="text-xs text-muted-foreground">ROAS</p>
							<p className="text-2xl font-bold text-[var(--accent)]">
								{roasDisplay}x
							</p>
						</div>
						<div className="stat-tile">
							<p className="text-xs text-muted-foreground">Total Klik</p>
							<p className="text-2xl font-bold text-foreground">
								{formatNumber(summary.totalClicks)}
							</p>
						</div>
						<div className="stat-tile">
							<p className="text-xs text-muted-foreground">Konversi</p>
							<p className="text-2xl font-bold text-foreground">
								{formatNumber(summary.totalConversions)}
							</p>
						</div>
					</div>
				)}

				{/* Error */}
				{error && (
					<div className="mb-4 p-3 bg-[var(--danger-bg)] border border-red-200 dark:border-red-900 rounded-lg text-sm text-[var(--danger-text)]">
						{error}
					</div>
				)}

				{/* Table */}
				{!loading && entries.length === 0 ? (
					<div className="panel-card text-center py-12 text-muted-foreground">
						Belum ada data iklan. Upload file iklan terlebih dahulu.
					</div>
				) : (
					<div className="panel-card overflow-hidden mb-6">
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead>
									<tr className="bg-[var(--surface-soft)] border-b border-[var(--border-subtle)]">
										<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
											Kampanye
										</th>
										<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
											SKU
										</th>
										<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
											Biaya Iklan
										</th>
										<th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">
											Impressi
										</th>
										<th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">
											Klik
										</th>
										<th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">
											Konversi
										</th>
										<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
											Revenue
										</th>
										<th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
											ROAS
										</th>
										<th className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase w-16"></th>
									</tr>
								</thead>
								<tbody className="divide-y divide-[var(--border-subtle)]">
									{sortedEntries.map((e) => {
										const rowRoas =
											e.spend > 0 ? (e.revenue / e.spend).toFixed(2) : "—";
										return (
											<tr
												key={e.id}
												className="hover:bg-[var(--surface-soft)] transition-colors"
											>
												<td className="px-4 py-3 text-foreground">
													{e.campaignName}
												</td>
												<td className="px-4 py-3 text-muted-foreground font-mono text-xs">
													{e.sku || "—"}
												</td>
												<td className="px-4 py-3 text-[var(--negative)] font-semibold">
													{formatRupiah(e.spend)}
												</td>
												<td className="px-4 py-3 text-right text-foreground">
													{formatNumber(e.impressions)}
												</td>
												<td className="px-4 py-3 text-right text-foreground">
													{formatNumber(e.clicks)}
												</td>
												<td className="px-4 py-3 text-right text-foreground">
													{formatNumber(e.conversions)}
												</td>
												<td className="px-4 py-3 text-[var(--positive)] font-semibold">
													{formatRupiah(e.revenue)}
												</td>
												<td className="px-4 py-3 font-bold text-[var(--accent)]">
													{rowRoas !== "—" ? `${rowRoas}x` : "—"}
												</td>
												<td className="px-4 py-3 text-center">
													<button
														type="button"
														onClick={() => void handleDelete(e.id)}
														title="Hapus"
														className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors"
													>
														<Trash2 className="w-4 h-4" />
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
				<div className="panel-card p-5">
					<h2 className="text-base font-bold text-foreground mb-4">
						Upload File Iklan
					</h2>
					<div className="flex flex-wrap gap-3 items-end">
						{/* Upload marketplace */}
						<div className="flex flex-col gap-1">
							<label
								htmlFor="upload-marketplace"
								className="text-xs font-semibold text-muted-foreground"
							>
								Marketplace
							</label>
							<select
								id="upload-marketplace"
								value={uploadMarketplace}
								onChange={(e) =>
									setUploadMarketplace(e.target.value as MarketplaceValue)
								}
								className="field-input min-w-[160px]"
							>
								{MARKETPLACE_OPTIONS.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</select>
						</div>

						{/* Upload store */}
						<div className="flex flex-col gap-1 min-w-[180px]">
							<label
								htmlFor="upload-store"
								className="text-xs font-semibold text-muted-foreground"
							>
								Toko
							</label>
							<select
								id="upload-store"
								value={uploadStoreId}
								onChange={(e) => setUploadStoreId(e.target.value)}
								className="field-input"
							>
								<option value="">Pilih toko...</option>
								{stores
									.filter((s) => s.marketplace === uploadMarketplace)
									.map((s) => (
										<option key={s.id} value={s.id}>
											{s.storeName}
										</option>
									))}
							</select>
						</div>

						{/* File input */}
						<div className="flex flex-col gap-1">
							<span className="text-xs font-semibold text-muted-foreground">
								File (.xlsx / .csv)
							</span>
							<label
								htmlFor="file-upload"
								className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all ${
									uploading
										? "bg-[var(--surface-soft)] text-muted-foreground cursor-not-allowed"
										: "bg-[var(--accent)] text-[var(--background)] hover:opacity-90"
								}`}
							>
								{uploading ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									<Upload className="w-4 h-4" />
								)}
								{uploading ? "Mengupload..." : "Pilih File"}
								<input
									id="file-upload"
									ref={fileInputRef}
									type="file"
									accept=".xlsx,.xls,.csv"
									className="hidden"
									disabled={uploading}
									onChange={(e) => void handleUpload(e)}
								/>
							</label>
						</div>
					</div>

					{uploadMsg && (
						<p
							className={`mt-3 text-sm ${
								uploadMsg.startsWith("Berhasil")
									? "text-[var(--positive)]"
									: "text-[var(--negative)]"
							}`}
						>
							{uploadMsg}
						</p>
					)}
				</div>
			</div>
		</AuthAreaLayout>
	);
}
