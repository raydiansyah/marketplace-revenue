/**
 * Module: StorePicker
 * Purpose: Dropdown to select or create a toko (store) for a given marketplace
 * Used by: /upload, /data-bank, /reports/new
 * Dependencies: /api/stores, auth-context
 * Public functions: StorePicker (default export)
 * Side effects: POST /api/stores when creating new store
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	ChevronDown,
	Plus,
	Check,
	Loader2,
	AlertCircle,
	X,
} from "lucide-react";
import type { MarketplaceId, StoreSummary } from "@/lib/types";

interface StorePickerProps {
	marketplace: MarketplaceId;
	value: string | null;
	onChange: (storeId: string) => void;
	disabled?: boolean;
}

type FetchState = "idle" | "loading" | "error";
type CreateState = "idle" | "loading" | "error";

export default function StorePicker({
	marketplace,
	value,
	onChange,
	disabled,
}: StorePickerProps) {
	const [stores, setStores] = useState<StoreSummary[]>([]);
	const [fetchState, setFetchState] = useState<FetchState>("idle");
	const [open, setOpen] = useState(false);
	const [showCreate, setShowCreate] = useState(false);
	const [newStoreName, setNewStoreName] = useState("");
	const [createState, setCreateState] = useState<CreateState>("idle");
	const [createError, setCreateError] = useState<string | null>(null);

	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const selectedStore = stores.find((s) => s.id === value) ?? null;

	const fetchStores = useCallback(async () => {
		setFetchState("loading");
		try {
			const res = await fetch(`/api/stores?marketplace=${marketplace}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as { stores: StoreSummary[] };
			setStores(data.stores ?? []);
			setFetchState("idle");
		} catch {
			setFetchState("error");
		}
	}, [marketplace]);

	// Refetch whenever marketplace changes
	useEffect(() => {
		void fetchStores();
	}, [fetchStores]);

	// Close dropdown on outside click
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
				setShowCreate(false);
				setNewStoreName("");
				setCreateError(null);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	// Focus create input when shown
	useEffect(() => {
		if (showCreate) inputRef.current?.focus();
	}, [showCreate]);

	async function handleCreate() {
		const name = newStoreName.trim();
		if (!name) return;
		setCreateState("loading");
		setCreateError(null);
		try {
			const res = await fetch("/api/stores", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ marketplace, storeName: name }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}
			const data = (await res.json()) as { store: StoreSummary };
			await fetchStores();
			onChange(data.store.id);
			setShowCreate(false);
			setNewStoreName("");
			setOpen(false);
			setCreateState("idle");
		} catch (err) {
			setCreateError(
				err instanceof Error ? err.message : "Gagal membuat toko.",
			);
			setCreateState("idle");
		}
	}

	function handleSelect(storeId: string) {
		onChange(storeId);
		setOpen(false);
		setShowCreate(false);
		setNewStoreName("");
		setCreateError(null);
	}

	const buttonLabel =
		fetchState === "loading"
			? "Memuat toko..."
			: selectedStore
				? selectedStore.storeName
				: "Pilih toko...";

	return (
		<div ref={containerRef} style={{ position: "relative" }}>
			{/* Trigger button */}
			<button
				type="button"
				disabled={disabled || fetchState === "loading"}
				onClick={() => setOpen((v) => !v)}
				style={{
					width: "100%",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "0.5rem",
					padding: "0.5rem 0.75rem",
					background: "var(--surface)",
					border: "1px solid var(--border-subtle)",
					borderRadius: "0.65rem",
					color: selectedStore ? "var(--foreground)" : "var(--text-subtle)",
					fontSize: "0.875rem",
					cursor:
						disabled || fetchState === "loading" ? "not-allowed" : "pointer",
					opacity: disabled ? 0.5 : 1,
					transition: "border-color 0.15s",
				}}
			>
				<span
					style={{
						display: "flex",
						alignItems: "center",
						gap: "0.4rem",
						minWidth: 0,
					}}
				>
					{fetchState === "loading" && (
						<Loader2
							style={{
								width: "0.875rem",
								height: "0.875rem",
								flexShrink: 0,
								animation: "spin 1s linear infinite",
							}}
						/>
					)}
					<span
						style={{
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{buttonLabel}
					</span>
				</span>
				<ChevronDown
					style={{
						width: "0.875rem",
						height: "0.875rem",
						flexShrink: 0,
						color: "var(--text-subtle)",
						transform: open ? "rotate(180deg)" : "none",
						transition: "transform 0.15s",
					}}
				/>
			</button>

			{fetchState === "error" && (
				<p
					style={{
						marginTop: "0.25rem",
						fontSize: "0.75rem",
						color: "var(--negative)",
						display: "flex",
						alignItems: "center",
						gap: "0.25rem",
					}}
				>
					<AlertCircle style={{ width: "0.75rem", height: "0.75rem" }} />
					Gagal memuat toko.{" "}
					<button
						type="button"
						onClick={() => void fetchStores()}
						style={{
							textDecoration: "underline",
							background: "none",
							border: "none",
							cursor: "pointer",
							color: "var(--negative)",
							fontSize: "inherit",
						}}
					>
						Coba lagi
					</button>
				</p>
			)}

			{/* Dropdown */}
			{open && (
				<div
					style={{
						position: "absolute",
						top: "calc(100% + 4px)",
						left: 0,
						right: 0,
						zIndex: 50,
						background: "var(--surface)",
						border: "1px solid var(--border-subtle)",
						borderRadius: "0.75rem",
						boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
						overflow: "hidden",
					}}
				>
					{/* Store list */}
					<ul style={{ listStyle: "none", margin: 0, padding: "0.375rem" }}>
						{stores.length === 0 && fetchState !== "loading" && (
							<li
								style={{
									padding: "0.5rem 0.75rem",
									fontSize: "0.8125rem",
									color: "var(--text-subtle)",
								}}
							>
								Belum ada toko. Buat yang pertama.
							</li>
						)}
						{stores.map((store) => (
							<li key={store.id}>
								<button
									type="button"
									onClick={() => handleSelect(store.id)}
									style={{
										width: "100%",
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										padding: "0.5rem 0.75rem",
										borderRadius: "0.5rem",
										background: "none",
										border: "none",
										cursor: "pointer",
										fontSize: "0.875rem",
										color: "var(--foreground)",
										textAlign: "left",
									}}
									onMouseEnter={(e) => {
										(e.currentTarget as HTMLButtonElement).style.background =
											"var(--surface-soft)";
									}}
									onMouseLeave={(e) => {
										(e.currentTarget as HTMLButtonElement).style.background =
											"none";
									}}
								>
									<span
										style={{
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{store.storeName}
									</span>
									{store.id === value && (
										<Check
											style={{
												width: "0.875rem",
												height: "0.875rem",
												flexShrink: 0,
												color: "var(--positive)",
											}}
										/>
									)}
								</button>
							</li>
						))}
					</ul>

					{/* Divider */}
					<div
						style={{
							height: "1px",
							background: "var(--border-subtle)",
							margin: "0 0.375rem",
						}}
					/>

					{/* Create section */}
					<div style={{ padding: "0.375rem" }}>
						{!showCreate ? (
							<button
								type="button"
								onClick={() => setShowCreate(true)}
								style={{
									width: "100%",
									display: "flex",
									alignItems: "center",
									gap: "0.4rem",
									padding: "0.5rem 0.75rem",
									borderRadius: "0.5rem",
									background: "none",
									border: "none",
									cursor: "pointer",
									fontSize: "0.875rem",
									color: "var(--accent)",
									fontWeight: 500,
								}}
								onMouseEnter={(e) => {
									(e.currentTarget as HTMLButtonElement).style.background =
										"var(--surface-soft)";
								}}
								onMouseLeave={(e) => {
									(e.currentTarget as HTMLButtonElement).style.background =
										"none";
								}}
							>
								<Plus style={{ width: "0.875rem", height: "0.875rem" }} />
								Tambah Toko Baru
							</button>
						) : (
							<div
								style={{
									padding: "0.25rem 0.375rem",
									display: "flex",
									flexDirection: "column",
									gap: "0.5rem",
								}}
							>
								<div style={{ display: "flex", gap: "0.375rem" }}>
									<input
										ref={inputRef}
										type="text"
										placeholder="Nama toko baru..."
										value={newStoreName}
										onChange={(e) => setNewStoreName(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") void handleCreate();
											if (e.key === "Escape") {
												setShowCreate(false);
												setNewStoreName("");
												setCreateError(null);
											}
										}}
										style={{
											flex: 1,
											padding: "0.4rem 0.625rem",
											background: "var(--surface-muted)",
											border: "1px solid var(--border-subtle)",
											borderRadius: "0.5rem",
											fontSize: "0.875rem",
											color: "var(--foreground)",
											outline: "none",
										}}
									/>
									<button
										type="button"
										onClick={() => void handleCreate()}
										disabled={!newStoreName.trim() || createState === "loading"}
										style={{
											padding: "0.4rem 0.75rem",
											background: "var(--brand)",
											color: "var(--background)",
											border: "none",
											borderRadius: "0.5rem",
											fontSize: "0.8125rem",
											fontWeight: 600,
											cursor:
												!newStoreName.trim() || createState === "loading"
													? "not-allowed"
													: "pointer",
											opacity:
												!newStoreName.trim() || createState === "loading"
													? 0.6
													: 1,
											display: "flex",
											alignItems: "center",
											gap: "0.25rem",
										}}
									>
										{createState === "loading" ? (
											<Loader2
												style={{
													width: "0.75rem",
													height: "0.75rem",
													animation: "spin 1s linear infinite",
												}}
											/>
										) : (
											"Simpan"
										)}
									</button>
									<button
										type="button"
										onClick={() => {
											setShowCreate(false);
											setNewStoreName("");
											setCreateError(null);
										}}
										style={{
											padding: "0.4rem",
											background: "none",
											border: "1px solid var(--border-subtle)",
											borderRadius: "0.5rem",
											cursor: "pointer",
											color: "var(--text-subtle)",
											display: "flex",
											alignItems: "center",
										}}
									>
										<X style={{ width: "0.875rem", height: "0.875rem" }} />
									</button>
								</div>
								{createError && (
									<p
										style={{
											fontSize: "0.75rem",
											color: "var(--negative)",
											display: "flex",
											alignItems: "center",
											gap: "0.25rem",
											margin: 0,
										}}
									>
										<AlertCircle
											style={{
												width: "0.75rem",
												height: "0.75rem",
												flexShrink: 0,
											}}
										/>
										{createError}
									</p>
								)}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
