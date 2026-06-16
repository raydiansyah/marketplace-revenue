/**
 * Module: SaveReportCard
 * Purpose: Form simpan laporan hasil hitung per toko
 * Used by: /dashboard
 */
"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useNotification } from "@/lib/notifications/notification-context";
import { MARKETPLACE_LABELS } from "@/lib/types";
import type { MarketplaceId, RevenueReport } from "@/lib/types";

interface SaveReportCardProps {
	buildReportForMarketplace: (marketplace: MarketplaceId) => RevenueReport;
	marketplaceOptions: MarketplaceId[];
}

export default function SaveReportCard({
	buildReportForMarketplace,
	marketplaceOptions,
}: SaveReportCardProps) {
	const saveStoreReport = useAppStore((state) => state.saveStoreReport);
	const { notify } = useNotification();
	const [storeName, setStoreName] = useState("");
	const [selectedMarketplace, setSelectedMarketplace] = useState<MarketplaceId | "">("");

	useEffect(() => {
		if (marketplaceOptions.length === 0) {
			setSelectedMarketplace("");
			return;
		}
		if (!selectedMarketplace || !marketplaceOptions.includes(selectedMarketplace)) {
			setSelectedMarketplace(marketplaceOptions[0]);
		}
	}, [marketplaceOptions, selectedMarketplace]);

	const handleSaveByStore = async () => {
		if (!selectedMarketplace) return;
		const trimmedStoreName = storeName.trim();
		if (!trimmedStoreName) {
			notify("warning", "Nama toko wajib diisi.");
			return;
		}

		const saved = buildReportForMarketplace(selectedMarketplace);
		if (saved.marketplaces.length === 0) {
			notify("warning", "Marketplace yang dipilih tidak ada di hasil hitung.");
			return;
		}

		const reportId = await saveStoreReport({
			marketplace: selectedMarketplace,
			storeName: trimmedStoreName,
			report: saved,
		});

		if (!reportId) {
			notify("error", "Gagal menyimpan laporan. Coba lagi.");
			return;
		}

		notify("success", `Tersimpan: ${MARKETPLACE_LABELS[selectedMarketplace]} - ${trimmedStoreName}`);
		setStoreName("");
	};

	return (
		<div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4 mb-6">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<h3 className="font-semibold text-[var(--foreground)]">Simpan Laporan per Toko</h3>
					<p className="text-xs text-[var(--text-subtle)] mt-1">
						Simpan hasil hitung dengan format: Marketplace - Nama Toko.
					</p>
				</div>
				<div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
					<select
						value={selectedMarketplace}
						onChange={(e) => setSelectedMarketplace(e.target.value as MarketplaceId)}
						className="border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
					>
						<option value="">Pilih marketplace</option>
						{marketplaceOptions.map((marketplace) => (
							<option key={marketplace} value={marketplace}>
								{MARKETPLACE_LABELS[marketplace]}
							</option>
						))}
					</select>
					<input
						value={storeName}
						onChange={(e) => setStoreName(e.target.value)}
						placeholder="Nama toko (contoh: Aquadrat)"
						className="border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
					/>
					<button
						onClick={handleSaveByStore}
						className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[var(--brand)] text-[var(--background)] rounded-lg text-sm font-medium hover:bg-[var(--brand-hover)]"
					>
						<Save className="w-4 h-4" />
						Simpan
					</button>
				</div>
			</div>
		</div>
	);
}
