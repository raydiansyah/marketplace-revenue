import type { RevenueReport } from "../types";
import { MARKETPLACE_LABELS, MARKETPLACE_COLORS } from "../types";

function rupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export async function exportToPdf(report: RevenueReport): Promise<void> {
  // Gunakan browser print dialog dengan custom print CSS
  // Ini lebih reliable dibanding @react-pdf/renderer untuk tabel kompleks
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Popup diblokir browser. Izinkan popup untuk ekspor PDF.");
    return;
  }

  const totalRevenue = report.totalRevenue;
  const netMargin = totalRevenue > 0 ? (report.totalNetProfit / totalRevenue) * 100 : 0;
  const grossMargin = totalRevenue > 0 ? (report.totalGrossProfit / totalRevenue) * 100 : 0;

  const marketplaceRows = report.marketplaces
    .map(
      (m) => `
      <tr>
        <td>
          <span class="dot" style="background:${MARKETPLACE_COLORS[m.marketplace]}"></span>
          ${MARKETPLACE_LABELS[m.marketplace]}
        </td>
        <td class="num">${m.totalOrders.toLocaleString("id-ID")}</td>
        <td class="num">${rupiah(m.totalRevenue)}</td>
        <td class="num red">-${rupiah(m.totalPlatformFees)}</td>
        <td class="num green">${rupiah(m.totalGrossProfit)}</td>
        <td class="num ${m.totalNetProfit >= 0 ? "green" : "red"}">${rupiah(m.totalNetProfit)}</td>
        <td class="num ${m.avgNetMargin >= 0 ? "green" : "red"}">${pct(m.avgNetMargin)}</td>
      </tr>`
    )
    .join("");

  const feeRows = report.marketplaces
    .map(
      (m) => `
      <tr>
        <td>${MARKETPLACE_LABELS[m.marketplace]}</td>
        <td class="num">${rupiah(m.feeBreakdown.commission)}</td>
        <td class="num">${rupiah(m.feeBreakdown.transactionFee)}</td>
        <td class="num">${rupiah(m.feeBreakdown.freeShipping)}</td>
        <td class="num">${rupiah(m.feeBreakdown.orderProcessing)}</td>
        <td class="num">${rupiah(m.feeBreakdown.voucher)}</td>
        <td class="num">${rupiah(m.feeBreakdown.affiliate)}</td>
        <td class="num bold">${rupiah(m.totalPlatformFees)}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Laporan Revenue Marketplace</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 24px; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 11px; margin-bottom: 24px; }
  h2 { font-size: 13px; margin: 20px 0 10px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
  .card-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
  .card-value { font-size: 16px; font-weight: bold; margin-top: 4px; }
  .card-sub { font-size: 9px; color: #aaa; margin-top: 2px; }
  .green { color: #059669; }
  .red { color: #dc2626; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #f9fafb; text-align: right; padding: 6px 8px; font-size: 9px; color: #666; text-transform: uppercase; }
  th:first-child { text-align: left; }
  td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
  td.num { text-align: right; }
  td.bold { font-weight: bold; }
  tfoot tr { border-top: 2px solid #e5e7eb; background: #f9fafb; font-weight: bold; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  @media print {
    body { padding: 0; }
    button { display: none; }
  }
</style>
</head>
<body>
<h1>Laporan Revenue Marketplace</h1>
<p class="subtitle">Digenerate: ${new Date(report.generatedAt).toLocaleString("id-ID")}</p>

<h2>Ringkasan Keseluruhan</h2>
<div class="cards">
  <div class="card">
    <div class="card-label">Total Revenue</div>
    <div class="card-value">${rupiah(report.totalRevenue)}</div>
    <div class="card-sub">${report.orders.length.toLocaleString("id-ID")} pesanan</div>
  </div>
  <div class="card">
    <div class="card-label">Gross Profit</div>
    <div class="card-value ${report.totalGrossProfit >= 0 ? "green" : "red"}">${rupiah(report.totalGrossProfit)}</div>
    <div class="card-sub">Margin ${pct(grossMargin)}</div>
  </div>
  <div class="card">
    <div class="card-label">Biaya Platform</div>
    <div class="card-value red">-${rupiah(report.totalPlatformFees)}</div>
    <div class="card-sub">${pct(totalRevenue > 0 ? (report.totalPlatformFees / totalRevenue) * 100 : 0)} dari revenue</div>
  </div>
  <div class="card">
    <div class="card-label">Net Profit</div>
    <div class="card-value ${report.totalNetProfit >= 0 ? "green" : "red"}">${rupiah(report.totalNetProfit)}</div>
    <div class="card-sub">Net Margin ${pct(netMargin)}</div>
  </div>
</div>

<h2>Performa per Marketplace</h2>
<table>
  <thead>
    <tr>
      <th style="text-align:left">Marketplace</th>
      <th>Pesanan</th>
      <th>Revenue</th>
      <th>Biaya Platform</th>
      <th>Gross Profit</th>
      <th>Net Profit</th>
      <th>Net Margin</th>
    </tr>
  </thead>
  <tbody>${marketplaceRows}</tbody>
  <tfoot>
    <tr>
      <td>TOTAL</td>
      <td class="num">${report.marketplaces.reduce((s, m) => s + m.totalOrders, 0).toLocaleString("id-ID")}</td>
      <td class="num">${rupiah(report.totalRevenue)}</td>
      <td class="num red">-${rupiah(report.totalPlatformFees)}</td>
      <td class="num green">${rupiah(report.totalGrossProfit)}</td>
      <td class="num ${report.totalNetProfit >= 0 ? "green" : "red"}">${rupiah(report.totalNetProfit)}</td>
      <td class="num">${pct(netMargin)}</td>
    </tr>
  </tfoot>
</table>

<h2>Breakdown Biaya Platform</h2>
<table>
  <thead>
    <tr>
      <th style="text-align:left">Marketplace</th>
      <th>Komisi</th>
      <th>Transaksi</th>
      <th>Ongkir</th>
      <th>Order Processing</th>
      <th>Voucher</th>
      <th>Affiliate</th>
      <th>Total</th>
    </tr>
  </thead>
  <tbody>${feeRows}</tbody>
</table>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 500);
}
