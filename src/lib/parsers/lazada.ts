/**
 * Module: Lazada Order Parser
 * Purpose: Parse file Pesanan Selesai dan Pesanan Cancel dari Lazada menjadi RawOrder[]
 * Used by: /upload (handleOrderFile, handleCanceledOrderFile), reconcile.ts
 * Dependencies: xlsxUtils.readFileToRows, types.RawOrder
 * Public functions: parseLazadaFile(), parseLazadaCancelFile()
 * Side effects: none
 */
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

function parseAmount(value: string): number {
  if (!value) return 0;
  const cleaned = String(value)
    .replace(/[Rp\s]/gi, "")
    .replace(/\(([^)]+)\)/, "-$1")
    .replace(/,/g, "")
    .replace(/\.(?=.*\.)/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseQty(value: string): number {
  const parsed = parseInt(String(value ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(parsed) ? 1 : Math.max(1, parsed);
}

function parseStatus(row: Record<string, string>): string {
  return (
    findColumn(row, ["status pesanan", "order status"]) ||
    findColumn(row, ["status"]) ||
    ""
  );
}

function rowsToOrders(rows: Record<string, string>[]): RawOrder[] {
  const parsed = rows
    .map((row): RawOrder | null => {
      const orderId = findColumn(row, [
        "ordernumber",
        "order number",
        "nomor pesanan",
        "order id",
        "id pesanan",
        "id pesanan baris",
        "order item id",
      ]);
      const orderDate = findColumn(row, [
        "createtime",
        "create time",
        "tanggal pesanan",
        "created at",
        "order created time",
        "waktu pesanan dibuat",
      ]);
      const productName = findColumn(row, [
        "itemname",
        "item name",
        "nama produk",
        "product name",
        "item",
      ]);
      const variation = findColumn(row, ["variation", "nama variasi", "variant"]);
      const sku = findColumn(row, ["sellersku", "seller sku", "sku penjual", "sku", "sku seller"]);
      const qty = parseQty(findColumn(row, ["quantity", "jumlah", "qty"]));

      const unitPrice = parseAmount(
        findColumn(row, ["unitprice", "unit price", "harga satuan", "harga ritel", "retail price"])
      );
      const paidPrice = parseAmount(
        findColumn(row, ["paidprice", "paid price", "total pembayaran", "jumlah yang dibayar", "amount paid"])
      );
      const settlementAmount = parseAmount(
        findColumn(row, ["jumlah yang diterima", "amount received", "total keseluruhan", "settlement amount"])
      );
      const sellerDiscount = Math.abs(parseAmount(findColumn(row, ["sellerdiscounttotal", "seller discount total"])));

      const sellingPrice = unitPrice;
      // Untuk Lazada, "Jumlah yang Dibayar" sering sudah termasuk ongkir/potongan lain.
      // Revenue produk sebaiknya mengikuti harga item (harga ritel) agar margin tidak overstate.
      const actualPrice = qty > 0
        ? (unitPrice > 0 ? unitPrice : Math.max(0, paidPrice / qty - sellerDiscount / qty))
        : unitPrice;

      const shippingFeeByseller = Math.abs(parseAmount(findColumn(row, ["shippingfee", "shipping fee", "ongkir"])));
      const status = parseStatus(row);
      const finalProductName = [productName, variation].filter(Boolean).join(" - ") || productName;

      if (!orderId && !finalProductName) return null;

      return {
        orderId: orderId || `LZD-${Math.random().toString(36).slice(2, 8)}`,
        orderDate,
        productName: finalProductName,
        sku,
        qty,
        sellingPrice,
        actualPrice: actualPrice || sellingPrice,
        settlementAmount,
        voucherBySeller: sellerDiscount,
        shippingFeeByseller,
        status,
        marketplace: "lazada",
        rawData: row,
      };
    })
    .filter((row): row is RawOrder => row !== null);

  const seen = new Set<string>();
  const deduped: RawOrder[] = [];

  for (const order of parsed) {
    const lineId = findColumn(order.rawData ?? {}, [
      "id pesanan baris",
      "order item id",
      "order line id",
      "line id",
    ]);

    const key = lineId
      ? `line:${lineId}`
      : [
          normalize(order.orderId),
          normalize(order.sku),
          normalize(order.productName),
          String(order.qty ?? 0),
          String(order.actualPrice ?? 0),
          normalize(order.orderDate),
        ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(order);
  }

  return deduped;
}

export function parseLazadaFile(content: string | ArrayBuffer): RawOrder[] {
  return rowsToOrders(readFileToRows(content));
}

// Pesanan Cancel Lazada menggunakan format return-order (sama dengan TikTok).
// Kolom kunci: "Order ID" → orderId, "Product Name" + "SKU Name" → productName, "Seller SKU" → sku.
// Output RawOrder dipakai hanya untuk membuat daftar orderId yang di-exclude di reconcile.
export function parseLazadaCancelFile(content: string | ArrayBuffer): RawOrder[] {
  const rows = readFileToRows(content);
  const parsed = rows
    .map((row): RawOrder | null => {
      const orderId = findColumn(row, ["order id"]);
      if (!orderId) return null;

      const productName = findColumn(row, ["product name"]);
      const skuName = findColumn(row, ["sku name"]);
      const sku = findColumn(row, ["seller sku"]);
      const returnUnitPrice = parseAmount(findColumn(row, ["return unit price"]));
      const returnQty = parseQty(findColumn(row, ["return quantity"]));
      const status = findColumn(row, ["return status"]) || findColumn(row, ["order status"]) || "";

      return {
        orderId,
        orderDate: findColumn(row, ["time requested", "refund time"]),
        productName: [productName, skuName].filter(Boolean).join(" - ") || productName,
        sku,
        qty: returnQty || 1,
        sellingPrice: returnUnitPrice,
        actualPrice: returnUnitPrice,
        status,
        marketplace: "lazada",
        rawData: row,
      };
    })
    .filter((row): row is RawOrder => row !== null);

  const seen = new Set<string>();
  return parsed.filter((order) => {
    const key = normalize(order.orderId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
