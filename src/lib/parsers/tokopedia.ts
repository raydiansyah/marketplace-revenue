import type { RawOrder } from "../types";
import { readFileToRows } from "./xlsxUtils";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function findColumn(row: Record<string, string>, candidates: string[]): string {
  const normalizedCandidates = candidates.map(normalize);
  for (const key of Object.keys(row)) {
    const keyLower = normalize(key);
    if (normalizedCandidates.some((candidate) => keyLower.includes(candidate))) {
      return row[key] ?? "";
    }
  }
  return "";
}

function parseAmount(val: string): number {
  if (!val) return 0;
  const cleaned = String(val)
    .replace(/[Rp\s]/gi, "")
    .replace(/\(([^)]+)\)/, "-$1")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? 0 : num;
}

function parseQty(val: string): number {
  const num = parseInt(String(val ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(num) ? 1 : Math.max(1, num);
}

function parseOptionalQty(val: string): number {
  const num = parseInt(String(val ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(num) ? 0 : Math.max(0, num);
}

function rowsToOrders(rows: Record<string, string>[]): RawOrder[] {
  return rows
    .map((row): RawOrder | null => {
      const orderId = findColumn(row, ["order id", "tokopedia invoice number", "invoice"]);
      const orderDate = findColumn(row, ["created time", "paid time", "order created time"]);
      const productName = findColumn(row, ["product name", "nama produk", "item name"]);
      const variation = findColumn(row, ["variation", "varian", "nama variasi"]);
      const sku = findColumn(row, ["seller sku", "sku id", "sku", "seller_sku"]);
      const qtyRaw = parseQty(findColumn(row, ["quantity", "jumlah", "qty"]));
      const qtyReturn = parseOptionalQty(findColumn(row, ["sku quantity of return", "qty return", "jumlah retur"]));
      const qty = Math.max(1, qtyRaw - (qtyReturn > 0 ? qtyReturn : 0));

      const sellingPrice = parseAmount(
        findColumn(row, ["sku unit original price", "unit price", "harga satuan"])
      );

      const subtotalAfterDiscount = parseAmount(findColumn(row, [
        "sku subtotal after discount",
        "subtotal after seller discounts",
      ]));
      const orderAmount = parseAmount(findColumn(row, ["order amount", "total pembayaran", "total"]));

      // Gunakan qtyRaw (qty SEBELUM dikurangi return) saat menghitung actualPrice per unit,
      // karena subtotalAfterDiscount mencakup nilai semua unit yang dibeli, termasuk yang
      // di-return. Membagi dengan qty (yang sudah dikurangi qtyReturn) menghasilkan
      // harga per unit yang inflated.
      const qtyForPriceCalc = qtyRaw > 0 ? qtyRaw : qty;
      const actualPrice = qtyForPriceCalc > 0
        ? (subtotalAfterDiscount > 0
          ? subtotalAfterDiscount / qtyForPriceCalc
          : (orderAmount > 0 ? orderAmount / qtyForPriceCalc : sellingPrice))
        : sellingPrice;

      const commissionFee = parseAmount(findColumn(row, ["buyer service fee", "handling fee", "commission fee"]));
      const voucherBySeller =
        Math.abs(parseAmount(findColumn(row, ["sku seller discount", "seller discount"]))) +
        Math.abs(parseAmount(findColumn(row, ["shipping fee seller discount"])));

      const status = findColumn(row, ["order status", "order substatus", "status"]);
      const finalProductName = [productName, variation].filter(Boolean).join(" - ") || productName;

      if (!orderId && !finalProductName) return null;

      return {
        orderId: orderId || `TOPED-${Math.random().toString(36).slice(2, 8)}`,
        orderDate,
        productName: finalProductName,
        sku,
        qty,
        sellingPrice,
        actualPrice: actualPrice || sellingPrice,
        reportedCommission: commissionFee || undefined,
        voucherBySeller,
        status,
        marketplace: "tokopedia",
        rawData: row,
      };
    })
    .filter((o): o is RawOrder => o !== null);
}

export function parseTokopediaFile(content: string | ArrayBuffer): RawOrder[] {
  return rowsToOrders(readFileToRows(content));
}
