import * as XLSX from "xlsx";
import type { RevenueReport, CalculatedOrder } from "../types";
import { MARKETPLACE_LABELS } from "../types";

function toSafeSheetName(name: string, used: Set<string>): string {
  const invalidChars = /[:\\/?*\[\]]/g;
  let safe = name.replace(invalidChars, "-").trim();
  if (!safe) safe = "Sheet";

  // Excel max sheet name length is 31 chars
  safe = safe.slice(0, 31);

  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }

  let counter = 2;
  while (true) {
    const suffix = `-${counter}`;
    const base = safe.slice(0, Math.max(1, 31 - suffix.length));
    const candidate = `${base}${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    counter += 1;
  }
}

function rupiah(n: number): string {
  return new Intl.NumberFormat("id-ID").format(Math.round(n));
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function exportToExcel(report: RevenueReport): void {
  const wb = XLSX.utils.book_new();
  const usedSheetNames = new Set<string>();

  // ─────────────────────────────────────────
  // Sheet 1: Ringkasan
  // ─────────────────────────────────────────
  const summaryRows = [
    ["LAPORAN REVENUE MARKETPLACE"],
    [`Digenerate: ${new Date(report.generatedAt).toLocaleString("id-ID")}`],
    [],
    ["Marketplace", "Pesanan", "Revenue (Rp)", "HPP (Rp)", "Gross Profit (Rp)", "Biaya Platform (Rp)", "Net Profit (Rp)", "Gross Margin", "Net Margin"],
    ...report.marketplaces.map((m) => [
      MARKETPLACE_LABELS[m.marketplace],
      m.totalOrders,
      rupiah(m.totalRevenue),
      rupiah(m.totalHpp),
      rupiah(m.totalGrossProfit),
      rupiah(m.totalPlatformFees),
      rupiah(m.totalNetProfit),
      pct(m.avgGrossMargin),
      pct(m.avgNetMargin),
    ]),
    [],
    [
      "TOTAL",
      report.marketplaces.reduce((s, m) => s + m.totalOrders, 0),
      rupiah(report.totalRevenue),
      rupiah(report.totalHpp),
      rupiah(report.totalGrossProfit),
      rupiah(report.totalPlatformFees),
      rupiah(report.totalNetProfit),
      pct(report.totalRevenue > 0 ? (report.totalGrossProfit / report.totalRevenue) * 100 : 0),
      pct(report.totalRevenue > 0 ? (report.totalNetProfit / report.totalRevenue) * 100 : 0),
    ],
    [],
    ["BREAKDOWN BIAYA PLATFORM PER MARKETPLACE"],
    ["Marketplace", "Komisi", "Transaction Fee", "Subsidi Ongkir", "Order Processing", "Voucher Seller", "Komisi Affiliate", "Biaya Lain", "Total"],
    ...report.marketplaces.map((m) => [
      MARKETPLACE_LABELS[m.marketplace],
      rupiah(m.feeBreakdown.commission),
      rupiah(m.feeBreakdown.transactionFee),
      rupiah(m.feeBreakdown.freeShipping),
      rupiah(m.feeBreakdown.orderProcessing),
      rupiah(m.feeBreakdown.voucher),
      rupiah(m.feeBreakdown.affiliate),
      rupiah(m.feeBreakdown.other),
      rupiah(m.totalPlatformFees),
    ]),
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary["!cols"] = [
    { wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 18 },
    { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, toSafeSheetName("Ringkasan", usedSheetNames));

  // ─────────────────────────────────────────
  // Sheet per Marketplace
  // ─────────────────────────────────────────
  const marketplaces = [...new Set(report.orders.map((o) => o.marketplace))];

  for (const mp of marketplaces) {
    const orders = report.orders.filter((o) => o.marketplace === mp);
    const rows = makeOrderRows(orders);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 18 }, { wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 6 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
      { wch: 14 }, { wch: 12 }, { wch: 12 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, toSafeSheetName(MARKETPLACE_LABELS[mp], usedSheetNames));
  }

  // ─────────────────────────────────────────
  // Sheet: Semua Pesanan
  // ─────────────────────────────────────────
  const allRows = makeOrderRows(report.orders);
  const wsAll = XLSX.utils.aoa_to_sheet(allRows);
  XLSX.utils.book_append_sheet(wb, wsAll, toSafeSheetName("Semua Pesanan", usedSheetNames));

  XLSX.writeFile(wb, `laporan-revenue-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function makeOrderRows(orders: CalculatedOrder[]): (string | number)[][] {
  const header = [
    "Order ID", "Tanggal", "Produk", "SKU", "Qty",
    "Harga Jual (Rp)", "Revenue (Rp)", "HPP (Rp)",
    "Biaya Platform (Rp)", "Gross Profit (Rp)", "Net Profit (Rp)",
    "Gross Margin", "Net Margin",
  ];

  const dataRows = orders.map((o) => [
    o.orderId,
    o.orderDate,
    o.productName,
    o.sku,
    o.qty,
    rupiah(o.actualPrice),
    rupiah(o.revenue),
    rupiah(o.hpp),
    rupiah(o.fees.totalPlatformFee),
    rupiah(o.grossProfit),
    rupiah(o.netProfit),
    pct(o.grossMargin),
    pct(o.netMargin),
  ]);

  // Baris total
  const total = [
    "TOTAL", "", "", "", orders.reduce((s, o) => s + o.qty, 0),
    "",
    rupiah(orders.reduce((s, o) => s + o.revenue, 0)),
    rupiah(orders.reduce((s, o) => s + o.hpp, 0)),
    rupiah(orders.reduce((s, o) => s + o.fees.totalPlatformFee, 0)),
    rupiah(orders.reduce((s, o) => s + o.grossProfit, 0)),
    rupiah(orders.reduce((s, o) => s + o.netProfit, 0)),
    "", "",
  ];

  return [header, ...dataRows, [], total];
}
