/**
 * Module: MarketplaceTable
 * Purpose: Tabulasi ringkasan per marketplace dlm laporan revenue
 * Used by: /dashboard
 * Dependencies: types (RevenueReport, MarketplaceSummary), format utils, MARKETPLACE_COLORS/LABELS
 */
import { MARKETPLACE_COLORS, MARKETPLACE_LABELS } from "@/lib/types";
import { formatRupiah, formatNumber, formatPercent } from "@/lib/utils";
import type { RevenueReport } from "@/lib/types";

interface MarketplaceTableProps {
	reportData: RevenueReport;
}

export default function MarketplaceTable({ reportData }: MarketplaceTableProps) {
	if (!reportData) return null;

	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b border-[var(--border-subtle)]">
						<th className="text-left py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">
							Marketplace
						</th>
						<th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">
							Pesanan
						</th>
						<th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">
							Revenue
						</th>
						<th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">
							Biaya Platform
						</th>
						<th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">
							Gross Profit
						</th>
						<th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">
							Net Profit
						</th>
						<th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">
							Net Margin
						</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-[var(--border-subtle)]">
					{reportData.marketplaces.map((m) => (
						<tr key={m.marketplace} className="hover:bg-[var(--surface-soft)]">
							<td className="py-3 px-4">
								<div className="flex items-center gap-2">
									<div
										className="w-2.5 h-2.5 rounded-full"
										style={{ backgroundColor: MARKETPLACE_COLORS[m.marketplace] }}
									/>
									<span className="font-medium text-slate-800">
										{MARKETPLACE_LABELS[m.marketplace]}
									</span>
								</div>
							</td>
							<td className="py-3 px-4 text-right text-slate-600">
								{formatNumber(m.totalOrders)}
							</td>
							<td className="py-3 px-4 text-right font-medium text-slate-800">
								{formatRupiah(m.totalRevenue)}
							</td>
							<td className="py-3 px-4 text-right text-red-500">
								-{formatRupiah(m.totalPlatformFees)}
							</td>
							<td className="py-3 px-4 text-right text-emerald-600">
								{formatRupiah(m.totalGrossProfit)}
							</td>
							<td
								className={`py-3 px-4 text-right font-semibold ${
									m.totalNetProfit >= 0 ? "text-emerald-600" : "text-red-500"
								}`}
							>
								{formatRupiah(m.totalNetProfit)}
							</td>
							<td
								className={`py-3 px-4 text-right ${
									m.avgNetMargin >= 0 ? "text-emerald-600" : "text-red-500"
								}`}
							>
								{formatPercent(m.avgNetMargin)}
							</td>
						</tr>
					))}
				</tbody>
				<tfoot>
					<tr className="border-t-2 border-[var(--border-subtle)] bg-[var(--surface-muted)]">
						<td className="py-3 px-4 font-bold text-slate-800">Total</td>
						<td className="py-3 px-4 text-right font-bold text-slate-800">
							{formatNumber(reportData.marketplaces.reduce((s, m) => s + m.totalOrders, 0))}
						</td>
						<td className="py-3 px-4 text-right font-bold text-slate-800">
							{formatRupiah(reportData.totalRevenue)}
						</td>
						<td className="py-3 px-4 text-right font-bold text-red-500">
							-{formatRupiah(reportData.totalPlatformFees)}
						</td>
						<td className="py-3 px-4 text-right font-bold text-emerald-600">
							{formatRupiah(reportData.totalGrossProfit)}
						</td>
						<td
							className={`py-3 px-4 text-right font-bold ${
								reportData.totalNetProfit >= 0 ? "text-emerald-600" : "text-red-500"
							}`}
						>
							{formatRupiah(reportData.totalNetProfit)}
						</td>
						<td className="py-3 px-4 text-right font-bold text-[var(--text-subtle)]">
							{formatPercent(
								reportData.totalRevenue > 0
									? (reportData.totalNetProfit / reportData.totalRevenue) * 100
									: 0,
							)}
						</td>
					</tr>
				</tfoot>
			</table>
		</div>
	);
}