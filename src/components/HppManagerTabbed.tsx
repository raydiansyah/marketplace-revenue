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
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import { useNotification } from "@/lib/notifications/notification-context";
import type {
	MarketplaceId,
	HppMarketplaceEntry,
	HppConflict,
} from "@/lib/types";

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
	uploadMessages: {
		warnings: string[];
		errors: string[];
		inserted?: number;
	} | null;
}

interface CombinedTabState {
	entries: HppMarketplaceEntry[];
	conflicts: HppConflict[];
	loading: boolean;
	error: string | null;
	q: string;
	conflictsOnly: boolean;
	page: number;
	total: number;
	totalPages: number;
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

// ── Paginator ──────────────────────────────────────────────────────────────

interface PaginatorProps {
	page: number;
	totalPages: number;
	total: number;
	pageSize: number;
	onPage: (p: number) => void;
}

function buildPageWindow(
	page: number,
	totalPages: number,
): (number | "el" | "er")[] {
	if (totalPages <= 7)
		return Array.from({ length: totalPages }, (_, i) => i + 1);
	const result: (number | "el" | "er")[] = [1];
	const left = Math.max(2, page - 1);
	const right = Math.min(totalPages - 1, page + 1);
	if (left > 2) result.push("el");
	for (let i = left; i <= right; i++) result.push(i);
	if (right < totalPages - 1) result.push("er");
	result.push(totalPages);
	return result;
}

function PagBtn({
	children,
	onClick,
	disabled,
	active,
	title,
}: {
	children: React.ReactNode;
	onClick: () => void;
	disabled?: boolean;
	active?: boolean;
	title?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			title={title}
			className={`min-w-[28px] h-7 px-1.5 flex items-center justify-center rounded text-xs font-medium transition-colors
        ${
					active
						? "bg-[var(--accent)] text-[var(--background)] cursor-default"
						: "border border-[var(--border-subtle)] text-[var(--text-subtle)] hover:bg-[var(--surface-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
				}`}
		>
			{children}
		</button>
	);
}

function Paginator({
	page,
	totalPages,
	total,
	pageSize,
	onPage,
}: PaginatorProps) {
	const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
	const to = Math.min(page * pageSize, total);
	const pages = buildPageWindow(page, totalPages);

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 text-sm">
			<span className="text-[var(--text-subtle)] text-xs">
				{total === 0
					? "Tidak ada entri"
					: `Menampilkan ${from}–${to} dari ${total} entri`}
			</span>

			{totalPages > 1 && (
				<div className="flex items-center gap-1">
					<PagBtn
						onClick={() => onPage(1)}
						disabled={page <= 1}
						title="Halaman pertama"
					>
						<ChevronsLeft className="w-3.5 h-3.5" />
					</PagBtn>
					<PagBtn
						onClick={() => onPage(page - 1)}
						disabled={page <= 1}
						title="Sebelumnya"
					>
						<ChevronLeft className="w-3.5 h-3.5" />
					</PagBtn>

					{pages.map((p, i) =>
						p === "el" || p === "er" ? (
							<span
								key={`${p}-${i}`}
								className="px-1 text-[var(--text-subtle)] text-xs select-none"
							>
								…
							</span>
						) : (
							<PagBtn
								key={p}
								onClick={() => onPage(p as number)}
								disabled={p === page}
								active={p === page}
							>
								{p}
							</PagBtn>
						),
					)}

					<PagBtn
						onClick={() => onPage(page + 1)}
						disabled={page >= totalPages}
						title="Berikutnya"
					>
						<ChevronRight className="w-3.5 h-3.5" />
					</PagBtn>
					<PagBtn
						onClick={() => onPage(totalPages)}
						disabled={page >= totalPages}
						title="Halaman terakhir"
					>
						<ChevronsRight className="w-3.5 h-3.5" />
					</PagBtn>
				</div>
			)}
		</div>
	);
}

// ── Main component ─────────────────────────────────────────────────────────

export default function HppManagerTabbed() {
	const { notify } = useNotification();
	const [activeTab, setActiveTab] = useState<MarketplaceId | "gabungan">(
		"shopee",
	);

	const [mpState, setMpState] = useState<
		Record<MarketplaceId, MarketplaceTabState>
	>({
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
		page: 1,
		total: 0,
		totalPages: 1,
	});

	const [addForm, setAddForm] = useState<
		Record<MarketplaceId, { sku: string; productName: string; cost: string }>
	>({
		shopee: { sku: "", productName: "", cost: "" },
		tokopedia: { sku: "", productName: "", cost: "" },
		lazada: { sku: "", productName: "", cost: "" },
	});

	const [editingId, setEditingId] = useState<string | null>(null);
	const [editCost, setEditCost] = useState("");
	const [addingRow, setAddingRow] = useState<Record<MarketplaceId, boolean>>({
		shopee: false,
		tokopedia: false,
		lazada: false,
	});

	const fileInputRef = useRef<HTMLInputElement>(null);
	const uploadingRef = useRef(false);

	const fetchMarketplace = useCallback(
		async (mp: MarketplaceId, page = 1, q = "") => {
			setMpState((prev) => ({
				...prev,
				[mp]: { ...prev[mp], loading: true, error: null },
			}));
			try {
				const params = new URLSearchParams({
					marketplace: mp,
					page: String(page),
					limit: String(PAGE_LIMIT),
					q,
				});
				const res = await fetch(`/api/hpp/marketplace?${params}`);
				if (!res.ok) throw new Error(await res.text());
				const data = (await res.json()) as {
					entries: HppMarketplaceEntry[];
					total: number;
					page: number;
					totalPages: number;
				};
				setMpState((prev) => ({
					...prev,
					[mp]: {
						...prev[mp],
						entries: data.entries,
						total: data.total,
						page: data.page,
						totalPages: data.totalPages,
						loading: false,
					},
				}));
			} catch (e) {
				setMpState((prev) => ({
					...prev,
					[mp]: { ...prev[mp], loading: false, error: String(e) },
				}));
			}
		},
		[],
	);

	const fetchCombined = useCallback(
		async (q = "", conflictsOnly = false, page = 1) => {
			setCombined((prev) => ({ ...prev, loading: true, error: null }));
			try {
				const params = new URLSearchParams({
					q,
					conflictsOnly: String(conflictsOnly),
					page: String(page),
					limit: String(PAGE_LIMIT),
				});
				const res = await fetch(`/api/hpp/combined?${params}`);
				if (!res.ok) throw new Error(await res.text());
				const data = (await res.json()) as {
					entries: HppMarketplaceEntry[];
					conflicts: HppConflict[];
					total: number;
					page: number;
					totalPages: number;
				};
				setCombined((prev) => ({
					...prev,
					entries: data.entries,
					conflicts: data.conflicts,
					total: data.total,
					page: data.page,
					totalPages: data.totalPages,
					loading: false,
				}));
			} catch (e) {
				setCombined((prev) => ({ ...prev, loading: false, error: String(e) }));
			}
		},
		[],
	);

	useEffect(() => {
		if (activeTab === "gabungan") {
			void fetchCombined(combined.q, combined.conflictsOnly, 1);
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

	const handleCombinedPage = (page: number) => {
		void fetchCombined(combined.q, combined.conflictsOnly, page);
	};

	const handleUpload = async (mp: MarketplaceId, file: File) => {
		if (uploadingRef.current) return;
		uploadingRef.current = true;
		setMpState((prev) => ({
			...prev,
			[mp]: { ...prev[mp], loading: true, uploadMessages: null },
		}));
		try {
			const form = new FormData();
			form.append("marketplace", mp);
			form.append("file", file);
			const res = await fetch("/api/hpp/marketplace", {
				method: "POST",
				body: form,
			});
			const data = (await res.json()) as {
				inserted?: number;
				warnings?: string[];
				errors?: string[];
				error?: string;
			};
			if (!res.ok) {
				notify("error", data.error ?? "Upload gagal");
				setMpState((prev) => ({
					...prev,
					[mp]: {
						...prev[mp],
						loading: false,
						uploadMessages: {
							warnings: [],
							errors: data.errors ?? [data.error ?? "Upload gagal"],
							inserted: 0,
						},
					},
				}));
			} else {
				notify("success", `${data.inserted} baris diimport ke ${mp}`);
				setMpState((prev) => ({
					...prev,
					[mp]: {
						...prev[mp],
						uploadMessages: {
							warnings: data.warnings ?? [],
							errors: data.errors ?? [],
							inserted: data.inserted,
						},
					},
				}));
				void fetchMarketplace(mp, 1, mpState[mp].q);
			}
		} catch (e) {
			notify("error", String(e));
			setMpState((prev) => ({
				...prev,
				[mp]: { ...prev[mp], loading: false },
			}));
		} finally {
			uploadingRef.current = false;
		}
	};

	const handleAdd = async (mp: MarketplaceId) => {
		const form = addForm[mp];
		const cost = parseFloat(form.cost);
		if (!form.productName.trim()) {
			notify("error", "Nama produk wajib diisi");
			return;
		}
		if (isNaN(cost) || cost < 0) {
			notify("error", "HPP harus berupa angka >= 0");
			return;
		}

		setAddingRow((prev) => ({ ...prev, [mp]: true }));
		try {
			const res = await fetch("/api/hpp/marketplace", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					marketplace: mp,
					entry: {
						sku: form.sku.trim(),
						productName: form.productName.trim(),
						cost,
					},
				}),
			});
			if (!res.ok) {
				const d = (await res.json()) as { error?: string };
				notify("error", d.error ?? "Gagal menyimpan");
				return;
			}
			notify("success", "HPP berhasil ditambahkan");
			setAddForm((prev) => ({
				...prev,
				[mp]: { sku: "", productName: "", cost: "" },
			}));
			void fetchMarketplace(mp, mpState[mp].page, mpState[mp].q);
		} catch (e) {
			notify("error", String(e));
		} finally {
			setAddingRow((prev) => ({ ...prev, [mp]: false }));
		}
	};

	const handleEditSave = async (mp: MarketplaceId, id: string) => {
		const cost = parseFloat(editCost);
		if (isNaN(cost) || cost < 0) {
			notify("error", "HPP tidak valid");
			return;
		}
		const res = await fetch(`/api/hpp/marketplace/${id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cost }),
		});
		if (!res.ok) {
			notify("error", "Gagal update");
			return;
		}
		setEditingId(null);
		notify("success", "HPP diperbarui");
		void fetchMarketplace(mp, mpState[mp].page, mpState[mp].q);
	};

	const handleDelete = async (mp: MarketplaceId, id: string) => {
		if (!confirm("Hapus entry ini?")) return;
		const res = await fetch(`/api/hpp/marketplace/${id}`, { method: "DELETE" });
		if (!res.ok) {
			notify("error", "Gagal hapus");
			return;
		}
		notify("success", "Entry dihapus");
		void fetchMarketplace(mp, mpState[mp].page, mpState[mp].q);
	};

	return (
		<div className="panel-card">
			<div className="flex border-b border-[var(--border-subtle)]">
				{TABS.map((tab) => (
					<button
						key={tab.id}
						onClick={() => setActiveTab(tab.id)}
						className={`px-5 py-3 text-sm font-semibold transition-colors ${
							activeTab === tab.id
								? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
								: "text-[var(--text-subtle)] hover:text-[var(--foreground)]"
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
							setAddForm((prev) => ({
								...prev,
								[activeTab]: {
									...prev[activeTab as MarketplaceId],
									[field]: val,
								},
							}))
						}
						onEditStart={(id, cost) => {
							setEditingId(id);
							setEditCost(String(cost));
						}}
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
							void fetchCombined(q, combined.conflictsOnly, 1);
						}}
						onToggleConflicts={() => {
							const next = !combined.conflictsOnly;
							setCombined((prev) => ({ ...prev, conflictsOnly: next }));
							void fetchCombined(combined.q, next, 1);
						}}
						onPage={handleCombinedPage}
					/>
				)}
			</div>
		</div>
	);
}

// ── MarketplaceTabPanel ────────────────────────────────────────────────────

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
			{/* Toolbar */}
			<div className="flex flex-wrap gap-3 items-center justify-between">
				<div className="relative flex-1 min-w-[200px] max-w-sm">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-subtle)]" />
					<input
						type="text"
						placeholder="Cari SKU atau nama produk..."
						value={state.q}
						onChange={(e) => onSearch(e.target.value)}
						className="w-full pl-9 pr-3 py-2 text-sm bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
					/>
				</div>
				<label className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--background)] text-sm font-medium rounded-lg cursor-pointer hover:opacity-90 transition-opacity">
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

			{/* Upload messages */}
			{state.uploadMessages && (
				<div className="space-y-1">
					{state.uploadMessages.inserted !== undefined && (
						<p className="text-sm text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 px-3 py-2 rounded-lg">
							{state.uploadMessages.inserted} baris berhasil diimport
						</p>
					)}
					{state.uploadMessages.warnings.map((w, i) => (
						<p
							key={i}
							className="text-sm text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 px-3 py-2 rounded-lg"
						>
							{w}
						</p>
					))}
					{state.uploadMessages.errors.map((err, i) => (
						<p
							key={i}
							className="text-sm text-red-700 bg-red-50 dark:bg-red-950/30 dark:text-red-400 px-3 py-2 rounded-lg"
						>
							{err}
						</p>
					))}
				</div>
			)}

			{state.error && (
				<p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400 px-3 py-2 rounded-lg">
					{state.error}
				</p>
			)}

			{/* Table */}
			{state.loading ? (
				<div className="flex justify-center py-10">
					<Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
				</div>
			) : (
				<div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
					<table className="w-full text-sm">
						<thead className="bg-[var(--surface-soft)] text-[var(--text-subtle)] text-xs uppercase">
							<tr>
								<th className="px-4 py-3 text-left">SKU</th>
								<th className="px-4 py-3 text-left">Nama Produk</th>
								<th className="px-4 py-3 text-left">Master SKU</th>
								<th className="px-4 py-3 text-right">HPP</th>
								<th className="px-4 py-3 text-center w-24">Aksi</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-[var(--border-subtle)]">
							{state.entries.length === 0 ? (
								<tr>
									<td
										colSpan={5}
										className="text-center py-10 text-[var(--text-subtle)]"
									>
										Belum ada data HPP untuk {mp}. Import file atau tambah
										manual.
									</td>
								</tr>
							) : (
								state.entries.map((entry) => (
									<tr
										key={entry.id}
										className="hover:bg-[var(--surface-soft)] transition-colors"
									>
										<td className="px-4 py-3 font-mono text-xs text-[var(--text-subtle)]">
											{entry.sku || "—"}
										</td>
										<td className="px-4 py-3 text-[var(--foreground)]">
											{entry.productName}
										</td>
										<td className="px-4 py-3 font-mono text-xs text-[var(--text-subtle)]">
											{entry.masterSku || "—"}
										</td>
										<td className="px-4 py-3 text-right">
											{editingId === entry.id ? (
												<input
													type="number"
													value={editCost}
													onChange={(e) => onEditCostChange(e.target.value)}
													className="w-28 text-right bg-[var(--surface)] border border-[var(--accent)] rounded px-2 py-1 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
													autoFocus
												/>
											) : (
												<span className="font-semibold text-[var(--foreground)]">
													{formatRupiah(entry.cost)}
												</span>
											)}
										</td>
										<td className="px-4 py-3">
											<div className="flex items-center justify-center gap-1">
												{editingId === entry.id ? (
													<>
														<button
															onClick={() => onEditSave(entry.id)}
															className="p-1 text-green-500 hover:bg-green-500/10 rounded"
														>
															<Check className="w-4 h-4" />
														</button>
														<button
															onClick={onEditCancel}
															className="p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-soft)] rounded"
														>
															<X className="w-4 h-4" />
														</button>
													</>
												) : (
													<>
														<button
															onClick={() => onEditStart(entry.id, entry.cost)}
															className="p-1 text-[var(--accent)] hover:bg-[var(--accent)]/10 rounded"
														>
															<Edit2 className="w-4 h-4" />
														</button>
														<button
															onClick={() => onDelete(entry.id)}
															className="p-1 text-red-500 hover:bg-red-500/10 rounded"
														>
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

			{/* Pagination */}
			<Paginator
				page={state.page}
				totalPages={state.totalPages}
				total={state.total}
				pageSize={PAGE_LIMIT}
				onPage={onPage}
			/>

			{/* Manual add form */}
			<div className="border border-dashed border-[var(--border-subtle)] rounded-lg p-4 space-y-3">
				<p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">
					Tambah Manual
				</p>
				<div className="flex flex-wrap gap-2">
					<input
						type="text"
						placeholder="SKU (opsional)"
						value={addFormState.sku}
						onChange={(e) => onAddFormChange("sku", e.target.value)}
						className="flex-1 min-w-[120px] bg-[var(--surface)] border border-[var(--border-subtle)] rounded px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
					/>
					<input
						type="text"
						placeholder="Nama Produk *"
						value={addFormState.productName}
						onChange={(e) => onAddFormChange("productName", e.target.value)}
						className="flex-[2] min-w-[180px] bg-[var(--surface)] border border-[var(--border-subtle)] rounded px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
					/>
					<input
						type="number"
						placeholder="HPP (Rp)"
						value={addFormState.cost}
						onChange={(e) => onAddFormChange("cost", e.target.value)}
						className="w-32 bg-[var(--surface)] border border-[var(--border-subtle)] rounded px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
					/>
					<button
						onClick={onAdd}
						disabled={addingRow}
						className="flex items-center gap-1 px-4 py-2 bg-[var(--foreground)] text-[var(--background)] text-sm rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
					>
						{addingRow ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : (
							<Plus className="w-4 h-4" />
						)}
						Tambah
					</button>
				</div>
			</div>
		</div>
	);
}

// ── CombinedTabPanel ───────────────────────────────────────────────────────

interface CombinedTabPanelProps {
	state: CombinedTabState;
	onSearch: (q: string) => void;
	onToggleConflicts: () => void;
	onPage: (page: number) => void;
}

function CombinedTabPanel({
	state,
	onSearch,
	onToggleConflicts,
	onPage,
}: CombinedTabPanelProps) {
	const conflictSkus = new Set(state.conflicts.map((c) => c.sku));

	return (
		<div className="space-y-4">
			{/* Toolbar */}
			<div className="flex flex-wrap gap-3 items-center justify-between">
				<div className="relative flex-1 min-w-[200px] max-w-sm">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-subtle)]" />
					<input
						type="text"
						placeholder="Cari SKU atau nama produk..."
						value={state.q}
						onChange={(e) => onSearch(e.target.value)}
						className="w-full pl-9 pr-3 py-2 text-sm bg-[var(--surface)] border border-[var(--border-subtle)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
					/>
				</div>
				<button
					onClick={onToggleConflicts}
					className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
						state.conflictsOnly
							? "bg-amber-500 text-[var(--background)] border-amber-500"
							: "bg-[var(--surface)] text-[var(--text-subtle)] border-[var(--border-subtle)] hover:bg-[var(--surface-soft)]"
					}`}
				>
					<AlertTriangle className="w-4 h-4" />
					Konflik saja{" "}
					{state.conflicts.length > 0 && `(${state.conflicts.length})`}
				</button>
			</div>

			{state.error && (
				<p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400 px-3 py-2 rounded-lg">
					{state.error}
				</p>
			)}

			{/* Table */}
			{state.loading ? (
				<div className="flex justify-center py-10">
					<Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
				</div>
			) : (
				<div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
					<table className="w-full text-sm">
						<thead className="bg-[var(--surface-soft)] text-[var(--text-subtle)] text-xs uppercase">
							<tr>
								<th className="px-4 py-3 text-left">SKU</th>
								<th className="px-4 py-3 text-left">Nama Produk</th>
								<th className="px-4 py-3 text-right">HPP</th>
								<th className="px-4 py-3 text-center">Status</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-[var(--border-subtle)]">
							{state.entries.length === 0 ? (
								<tr>
									<td
										colSpan={4}
										className="text-center py-10 text-[var(--text-subtle)]"
									>
										Tidak ada data. Upload HPP per marketplace terlebih dahulu.
									</td>
								</tr>
							) : (
								state.entries.map((entry, idx) => {
									const hasConflict = conflictSkus.has(entry.sku);
									return (
										<tr
											key={entry.id ?? `combined-${idx}`}
											className={`hover:bg-[var(--surface-soft)] transition-colors ${
												hasConflict ? "bg-amber-500/5" : ""
											}`}
										>
											<td className="px-4 py-3 font-mono text-xs text-[var(--text-subtle)]">
												{entry.sku || "—"}
											</td>
											<td className="px-4 py-3 text-[var(--foreground)]">
												{entry.productName}
											</td>
											<td className="px-4 py-3 text-right font-semibold text-[var(--foreground)]">
												{formatRupiah(entry.cost)}
											</td>
											<td className="px-4 py-3 text-center">
												{hasConflict ? (
													<span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-medium rounded-full">
														<AlertTriangle className="w-3 h-3" />
														Konflik
													</span>
												) : (
													<span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/15 text-green-600 dark:text-green-400 text-xs font-medium rounded-full">
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

			{/* Pagination */}
			<Paginator
				page={state.page}
				totalPages={state.totalPages}
				total={state.total}
				pageSize={PAGE_LIMIT}
				onPage={onPage}
			/>
		</div>
	);
}
