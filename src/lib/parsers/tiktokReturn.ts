import type { ReturnOrderTransaction } from "../types";
import { readFileToRows } from "./xlsxUtils";

function normalize(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function findColumn(row: Record<string, string>, candidates: string[]): string {
  const normalizedCandidates = candidates.map(normalize);
  for (const key of Object.keys(row)) {
    const normalizedKey = normalize(key);
    if (normalizedCandidates.some((candidate) => normalizedKey.includes(candidate))) {
      return row[key] ?? "";
    }
  }
  return "";
}

function parseAmount(value: string): number {
  if (!value) return 0;
  const raw = String(value)
    .replace(/\(([^)]+)\)/, "-$1")
    .replace(/\s+/g, "")
    .replace(/[RpIDR]/gi, "");

  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  let normalized = raw;

  if (comma >= 0 && dot >= 0) {
    if (comma > dot) {
      normalized = raw.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = raw.replace(/,/g, "");
    }
  } else if (comma >= 0) {
    normalized = /,\d{1,2}$/.test(raw) ? raw.replace(",", ".") : raw.replace(/,/g, "");
  } else if (dot >= 0) {
    normalized = /\.\d{1,2}$/.test(raw) ? raw : raw.replace(/\./g, "");
  }

  const num = parseFloat(normalized);
  return Number.isNaN(num) ? 0 : num;
}

function parseQty(value: string): number {
  const num = parseInt(String(value ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(num) ? 0 : Math.max(0, num);
}

export function parseTiktokReturnFile(content: string | ArrayBuffer): ReturnOrderTransaction[] {
  const rows = readFileToRows(content);
  return rows
    .map((row): ReturnOrderTransaction | null => {
      const orderId = findColumn(row, ["order id"]);
      const returnOrderId = findColumn(row, ["return order id"]);
      const returnQuantity = parseQty(findColumn(row, ["return quantity"]));
      const returnUnitPrice = parseAmount(findColumn(row, ["return unit price"]));
      const compensationAmount = parseAmount(findColumn(row, ["compensation amount"]));

      if (!orderId || returnQuantity <= 0) return null;

      return {
        returnOrderId,
        orderId,
        skuId: findColumn(row, ["sku id"]),
        sellerSku: findColumn(row, ["seller sku"]),
        productName: findColumn(row, ["product name"]),
        skuName: findColumn(row, ["sku name"]),
        returnType: findColumn(row, ["return type"]),
        timeRequested: findColumn(row, ["time requested"]),
        returnReason: findColumn(row, ["return reason"]),
        returnUnitPrice,
        returnQuantity,
        returnStatus: findColumn(row, ["return status"]),
        returnSubStatus: findColumn(row, ["return sub status", "return substatus"]),
        refundTime: findColumn(row, ["refund time"]),
        compensationAmount,
        buyerNote: findColumn(row, ["buyer note"]),
        rawData: row,
      };
    })
    .filter((item): item is ReturnOrderTransaction => item !== null);
}
