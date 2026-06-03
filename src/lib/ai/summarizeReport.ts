/**
 * Module: Report Summarizer
 * Purpose: Compress a RevenueReport into a token-efficient text summary for AI prompts
 * Used by: src/app/api/ai/insights/route.ts
 * Dependencies: src/lib/types (RevenueReport)
 * Public functions: summarizeReport()
 * Side effects: None — pure computation, no I/O
 */

import type { RevenueReport, CalculatedOrder } from "@/lib/types";

const MONTH_NAMES = [
  "", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Ags", "Sep", "Okt", "Nov", "Des",
];

function fmt(n: number): string {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * Compress a RevenueReport to a structured text summary (target ≤3000 chars).
 * The kind parameter influences which extra detail is appended.
 */
export function summarizeReport(report: RevenueReport, kind: string): string {
  const lines: string[] = [];

  // --- Period ---
  let periodStr = "tidak diketahui";
  if (report.reportPeriod) {
    const { year, month } = report.reportPeriod;
    periodStr = `${MONTH_NAMES[month] ?? month} ${year}`;
  } else if (report.period) {
    periodStr = `${report.period.from} s/d ${report.period.to}`;
  }
  lines.push(`## Laporan Revenue — ${periodStr}`);
  lines.push(`Dibuat: ${report.generatedAt}`);
  lines.push("");

  // --- Totals ---
  lines.push("### Ringkasan Total");
  lines.push(`- Total Revenue    : Rp ${fmt(report.totalRevenue)}`);
  lines.push(`- Total HPP        : Rp ${fmt(report.totalHpp)}`);
  lines.push(`- Total Gross Profit: Rp ${fmt(report.totalGrossProfit)}`);
  lines.push(`- Total Platform Fees: Rp ${fmt(report.totalPlatformFees)}`);
  lines.push(`- Total Net Profit  : Rp ${fmt(report.totalNetProfit)}`);
  lines.push(`- Total Orders      : ${report.orders.length}`);
  lines.push("");

  // --- Per-marketplace ---
  lines.push("### Per Marketplace");
  for (const mp of report.marketplaces) {
    lines.push(
      `**${mp.marketplace}** — Orders: ${mp.totalOrders} | Revenue: Rp ${fmt(mp.totalRevenue)} | ` +
      `Fees: Rp ${fmt(mp.totalPlatformFees)} | Net: Rp ${fmt(mp.totalNetProfit)} | ` +
      `Margin: ${fmtPct(mp.avgNetMargin)}`
    );

    if (kind === "fee-anomaly") {
      const fb = mp.feeBreakdown;
      lines.push(
        `  Biaya: Komisi ${fmt(fb.commission)} | Transaksi ${fmt(fb.transactionFee)} | ` +
        `Gratis Ongkir ${fmt(fb.freeShipping)} | Order Processing ${fmt(fb.orderProcessing)} | ` +
        `Voucher ${fmt(fb.voucher)} | Affiliate ${fmt(fb.affiliate)} | Lain ${fmt(fb.other)}`
      );
    }
  }
  lines.push("");

  // --- Top 10 SKU by revenue ---
  const skuMap = new Map<string, {
    sku: string; productName: string; qty: number;
    revenue: number; grossProfit: number; netProfit: number; netMargin: number;
  }>();

  for (const order of report.orders) {
    const key = order.sku || order.productName;
    const existing = skuMap.get(key);
    if (existing) {
      existing.qty += order.qty;
      existing.revenue += order.revenue;
      existing.grossProfit += order.grossProfit;
      existing.netProfit += order.netProfit;
    } else {
      skuMap.set(key, {
        sku: order.sku,
        productName: order.productName,
        qty: order.qty,
        revenue: order.revenue,
        grossProfit: order.grossProfit,
        netProfit: order.netProfit,
        netMargin: order.netMargin,
      });
    }
  }

  const skuList = Array.from(skuMap.values());

  if (kind === "hpp-margin") {
    // Worst margin first
    const worst10 = skuList
      .sort((a, b) => a.netProfit - b.netProfit)
      .slice(0, 10);

    lines.push("### 10 SKU Margin Terburuk");
    for (const s of worst10) {
      lines.push(
        `- [${s.sku}] ${s.productName.slice(0, 50)} | Qty: ${s.qty} | ` +
        `Revenue: Rp ${fmt(s.revenue)} | Net Profit: Rp ${fmt(s.netProfit)} | ` +
        `Net Margin: ${fmtPct(s.netMargin)}`
      );
    }
  } else {
    // Top 10 by revenue
    const top10 = skuList
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    lines.push("### 10 SKU Teratas (by Revenue)");
    for (const s of top10) {
      lines.push(
        `- [${s.sku}] ${s.productName.slice(0, 50)} | Qty: ${s.qty} | ` +
        `Revenue: Rp ${fmt(s.revenue)} | Net Profit: Rp ${fmt(s.netProfit)} | ` +
        `Margin: ${fmtPct(s.netMargin)}`
      );
    }
  }
  lines.push("");

  // --- Return summary ---
  const totalReturnOrders = report.orders.filter((o: CalculatedOrder) => (o.returnQty ?? 0) > 0).length;
  const totalReturnRevLost = report.orders.reduce((sum: number, o: CalculatedOrder) => sum + (o.returnRevenue ?? 0), 0);
  if (totalReturnOrders > 0) {
    lines.push(`### Return`);
    lines.push(`- Order dengan return: ${totalReturnOrders}`);
    lines.push(`- Estimasi revenue hilang: Rp ${fmt(totalReturnRevLost)}`);
    lines.push("");
  }

  // --- Insight kind context ---
  lines.push(`### Konteks Analisa: ${kind}`);

  return lines.join("\n");
}
