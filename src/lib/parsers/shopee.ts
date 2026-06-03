/**
 * Module: Shopee Order Parser
 * Purpose: Parse Shopee Seller Center CSV/XLSX order exports into RawOrder[]
 * Used by: src/app/upload/page.tsx (parseShopeeFile), reconcile.ts
 * Dependencies: xlsxUtils.readFileToRows, types.RawOrder,
 *               validation/headerDictionary.normalizeHeader (column normalization)
 * Public functions: parseShopeeFile(), parseShopeeCSV() (deprecated)
 * Side effects: none
 */
import type { RawOrder } from "../types";
import { readFileToRows } from "./xlsxUtils";
import { normalizeHeader } from "../validation/headerDictionary";

/**
 * Find a column value by trying a list of candidate header names.
 * Uses normalizeHeader from headerDictionary for consistent normalization.
 * Priority: exact match first, then substring match.
 */
function findColumn(row: Record<string, string>, candidates: string[]): string {
  const entries = Object.keys(row).map((key) => ({
    key,
    normalizedKey: normalizeHeader(key),
  }));
  const normalizedCandidates = candidates.map(normalizeHeader).filter(Boolean);

  // 1) Exact match by candidate priority
  for (const candidate of normalizedCandidates) {
    const exact = entries.find((entry) => entry.normalizedKey === candidate);
    if (exact) return row[exact.key] ?? "";
  }

  // 2) Contains match by candidate priority
  for (const candidate of normalizedCandidates) {
    const partial = entries.find((entry) =>
      entry.normalizedKey.includes(candidate) || candidate.includes(entry.normalizedKey)
    );
    if (partial) return row[partial.key] ?? "";
  }

  return "";
}

function parseAmount(val: string): number {
  if (!val) return 0;
  // Hapus simbol mata uang, titik ribuan, dan ganti koma desimal
  const cleaned = val.replace(/[Rp\s$,]/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseQty(val: string): number {
  const num = parseInt(val?.replace(/[^\d]/g, "") ?? "0", 10);
  return isNaN(num) ? 0 : num;
}

function rowsToOrders(rows: Record<string, string>[]): RawOrder[] {
  return rows
    .map((row): RawOrder | null => {
      const orderId = findColumn(row, ["order id", "no pesanan", "nomor pesanan"]);
      const orderDate = findColumn(row, [
        "order creation time",
        "create time",
        "tanggal pesanan",
        "order time",
        "waktu pembuatan",
        "waktu pesanan dibuat",
      ]);
      const productName = findColumn(row, ["product name", "nama produk", "item name"]);
      const sku = findColumn(row, [
        "nomor referensi sku",
        "sku reference no",
        "variation sku",
        "sku",
        "master sku",
        "sku induk",
      ]);
      const qtyStr = findColumn(row, ["quantity", "jumlah"]);
      const qty = parseQty(qtyStr) || 1;

      // Harga jual
      const sellingPriceStr = findColumn(row, ["original price", "harga asli", "unit price original price", "harga awal"]);
      const sellingPrice = parseAmount(sellingPriceStr);

      // Harga setelah diskon / yang dibayar pembeli
      const dealPriceStr = findColumn(row, ["deal price", "harga deal", "unit price after discount", "harga setelah diskon"]);
      const actualPrice = parseAmount(dealPriceStr) || sellingPrice;

      // Settlement amount (dana yang masuk ke seller)
      const settlementStr = findColumn(row, ["seller settlement amount", "buyer payment", "settlement amount", "estimated seller income", "seller income", "total pembayaran"]);
      const settlementAmount = parseAmount(settlementStr);

      // Komisi yang dilaporkan
      const commissionStr = findColumn(row, ["commission fee", "platform commission", "biaya komisi"]);
      const reportedCommission = parseAmount(commissionStr);

      // Voucher seller
      const voucherSellerStr = findColumn(row, ["seller voucher", "voucher dari seller", "seller discount", "voucher ditanggung penjual", "diskon dari penjual"]);
      const voucherBySeller = parseAmount(voucherSellerStr);

      // Voucher platform
      const voucherPlatformStr = findColumn(row, ["shopee voucher", "shopee discount", "platform voucher", "voucher ditanggung shopee", "diskon dari shopee"]);
      const voucherByPlatform = parseAmount(voucherPlatformStr);

      // Subsidi ongkir
      const shippingSubsidyStr = findColumn(row, ["shipping fee subsidy", "ongkos kirim subsidi", "shipping subsidy", "estimasi potongan biaya pengiriman"]);
      const shippingSubsidy = parseAmount(shippingSubsidyStr);

      // Status
      const status = findColumn(row, ["order status", "status pesanan", "status"]);

      if (!orderId && !productName) return null;

      return {
        orderId: orderId || `SHOPEE-${Math.random().toString(36).slice(2, 8)}`,
        orderDate,
        productName,
        sku,
        qty,
        sellingPrice,
        actualPrice,
        settlementAmount: settlementAmount || undefined,
        reportedCommission: reportedCommission || undefined,
        voucherBySeller,
        voucherByPlatform,
        shippingSubsidy,
        status,
        marketplace: "shopee",
        rawData: row,
      };
    })
    .filter((o): o is RawOrder => o !== null);
}

export function parseShopeeFile(content: string | ArrayBuffer): RawOrder[] {
  const rows = readFileToRows(content);
  return rowsToOrders(rows);
}

/** @deprecated Gunakan parseShopeeFile */
export function parseShopeeCSV(csvContent: string): RawOrder[] {
  return parseShopeeFile(csvContent);
}
