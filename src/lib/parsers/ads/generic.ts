/**
 * Module: Generic Ads Parser
 * Purpose: Parse ads campaign CSV/XLSX from any marketplace into ParsedAdsRow[]
 * Used by: src/lib/parsers/ads/shopee.ts, tokopedia.ts, lazada.ts, tiktok.ts; /api/ads/upload
 * Dependencies: readFileToRows from xlsxUtils, normalizeHeader from headerDictionary
 * Public functions: parseAdsGeneric
 * Side effects: none (pure transform)
 */

import { readFileToRows } from "@/lib/parsers/xlsxUtils";
import { normalizeHeader } from "@/lib/validation/headerDictionary";

export interface ParsedAdsRow {
  campaignName: string;
  sku: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

// Bilingual column synonyms covering Shopee, Tokopedia, TikTok, and Lazada export formats
const COLUMN_SYNONYMS: Record<keyof ParsedAdsRow, string[]> = {
  campaignName: [
    "campaign name",
    "nama kampanye",
    "nama campaign",
    "campaign",
    "nama iklan",
    "nama ad group",
    "ad group name",
    "ad name",
    "nama iklan",
    "campaign title",
  ],
  sku: [
    "sku",
    "seller sku",
    "sku penjual",
    "product sku",
    "item sku",
  ],
  spend: [
    "spend",
    "biaya iklan",
    "total spend",
    "pengeluaran iklan",
    "cost",
    "total biaya iklan",
    "pengeluaran rp",
    "biaya",
    "total cost",
    "ad spend",
  ],
  impressions: [
    "impressions",
    "tayangan",
    "impresi",
    "impresi iklan",
    "total impressions",
    "total tayangan",
  ],
  clicks: [
    "clicks",
    "klik",
    "click",
    "klik iklan",
    "total clicks",
    "total klik",
  ],
  conversions: [
    "conversions",
    "konversi",
    "orders",
    "pesanan",
    "total conversions",
    "total konversi",
    "jumlah order",
  ],
  revenue: [
    "revenue",
    "pendapatan iklan",
    "gmv",
    "gross revenue",
    "pendapatan iklan rp",
    "gmv rp",
    "total revenue",
    "total pendapatan",
    "sales",
  ],
};

/**
 * Strip currency symbols, commas, and whitespace, then parse to float.
 * Returns 0 if the result is NaN or negative (spend/revenue must be positive).
 */
function parseNumeric(raw: string): number {
  const cleaned = String(raw ?? "")
    .replace(/[Rp,.\s]/g, "")
    .replace(/[^\d-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.abs(n);
}

/**
 * Find the value from a row object given a list of normalized synonyms.
 * Tries exact match first, then substring match.
 */
function pickColumn(
  row: Record<string, string>,
  normalizedKeys: string[],
  synonyms: string[]
): string {
  // normalizedKeys is keys(row) already normalized for fast lookup
  for (const key of normalizedKeys) {
    if (synonyms.some((s) => key === s)) {
      return row[Object.keys(row).find((k) => normalizeHeader(k) === key) ?? ""] ?? "";
    }
  }
  for (const key of normalizedKeys) {
    if (synonyms.some((s) => key.includes(s) || s.includes(key))) {
      return row[Object.keys(row).find((k) => normalizeHeader(k) === key) ?? ""] ?? "";
    }
  }
  return "";
}

/**
 * Build a mapping from ParsedAdsRow key → original row key (header) for one row.
 * Done once per header set for efficiency.
 */
function buildHeaderMap(headers: string[]): Record<keyof ParsedAdsRow, string> {
  const normHeaders = headers.map((h) => ({ original: h, norm: normalizeHeader(h) }));

  function findHeader(synonyms: string[]): string {
    // exact
    for (const { original, norm } of normHeaders) {
      if (synonyms.some((s) => norm === s)) return original;
    }
    // substring
    for (const { original, norm } of normHeaders) {
      if (synonyms.some((s) => norm.includes(s) || s.includes(norm))) return original;
    }
    return "";
  }

  return {
    campaignName: findHeader(COLUMN_SYNONYMS.campaignName),
    sku: findHeader(COLUMN_SYNONYMS.sku),
    spend: findHeader(COLUMN_SYNONYMS.spend),
    impressions: findHeader(COLUMN_SYNONYMS.impressions),
    clicks: findHeader(COLUMN_SYNONYMS.clicks),
    conversions: findHeader(COLUMN_SYNONYMS.conversions),
    revenue: findHeader(COLUMN_SYNONYMS.revenue),
  };
}

/**
 * Parse a generic ads export file (CSV or XLSX) into ParsedAdsRow[].
 * Skips rows where campaignName is empty AND spend is 0.
 */
export function parseAdsGeneric(content: string | ArrayBuffer): ParsedAdsRow[] {
  const rows = readFileToRows(content);
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const headerMap = buildHeaderMap(headers);

  const result: ParsedAdsRow[] = [];

  for (const row of rows) {
    const campaignName = (row[headerMap.campaignName] ?? "").trim();
    const sku = (row[headerMap.sku] ?? "").trim();
    const spend = parseNumeric(row[headerMap.spend] ?? "");
    const impressions = Math.round(parseNumeric(row[headerMap.impressions] ?? ""));
    const clicks = Math.round(parseNumeric(row[headerMap.clicks] ?? ""));
    const conversions = Math.round(parseNumeric(row[headerMap.conversions] ?? ""));
    const revenue = parseNumeric(row[headerMap.revenue] ?? "");

    // Skip meaningless rows
    if (campaignName === "" && spend === 0) continue;

    result.push({ campaignName, sku, spend, impressions, clicks, conversions, revenue });
  }

  return result;
}
