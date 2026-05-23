/**
 * Module: Cashflow File Parser
 * Purpose: Parse generic cashflow CSV/XLSX templates into ParsedCashflowRow[]
 * Used by: /api/cashflow/upload route
 * Dependencies: readFileToRows from xlsxUtils, normalizeHeader from headerDictionary
 * Public functions: parseCashflowFile
 * Side effects: none (pure transform)
 */

import { readFileToRows } from "@/lib/parsers/xlsxUtils";
import { normalizeHeader } from "@/lib/validation/headerDictionary";
import type { CashflowCategory } from "@/lib/types";

export interface ParsedCashflowRow {
  category: CashflowCategory;
  subCategory: string;
  amount: number;
  description: string;
  txnDate: string; // YYYY-MM-DD
}

// Bilingual column synonyms for cashflow templates
const COLUMN_SYNONYMS = {
  category: ["kategori", "category", "tipe", "type", "jenis"],
  subCategory: [
    "sub kategori",
    "sub-kategori",
    "subcategory",
    "jenis pengeluaran",
    "jenis pendapatan",
    "sub category",
    "sub_kategori",
  ],
  amount: ["jumlah", "amount", "nominal", "nilai", "total", "besaran"],
  description: [
    "keterangan",
    "description",
    "deskripsi",
    "catatan",
    "note",
    "notes",
    "ket",
  ],
  txnDate: [
    "tanggal",
    "date",
    "tanggal transaksi",
    "transaction date",
    "tgl",
    "tgl transaksi",
    "tanggal bayar",
    "payment date",
  ],
};

// Category keywords for income detection
const INCOME_KEYWORDS = ["income", "masuk", "pendapatan", "pemasukan", "penerimaan", "kredit"];

/**
 * Normalize a raw date string to YYYY-MM-DD.
 * Handles: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY, D/M/YYYY, YYYY/MM/DD.
 * Falls back to today's date if parsing fails.
 */
function normalizeDateString(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return todayString();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // YYYY/MM/DD
  const isoSlash = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (isoSlash) {
    return `${isoSlash[1]}-${isoSlash[2].padStart(2, "0")}-${isoSlash[3].padStart(2, "0")}`;
  }

  // DD/MM/YYYY or D/M/YYYY
  const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmySlash) {
    return `${dmySlash[3]}-${dmySlash[2].padStart(2, "0")}-${dmySlash[1].padStart(2, "0")}`;
  }

  // DD-MM-YYYY or D-M-YYYY
  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDash) {
    return `${dmyDash[3]}-${dmyDash[2].padStart(2, "0")}-${dmyDash[1].padStart(2, "0")}`;
  }

  // Try native Date parse as a last resort
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return todayString();
}

function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Determine if a raw category string represents income or expense.
 * Default: expense.
 */
function resolveCategory(raw: string): CashflowCategory {
  const norm = normalizeHeader(raw);
  for (const kw of INCOME_KEYWORDS) {
    if (norm.includes(kw)) return "income";
  }
  return "expense";
}

/**
 * Strip currency/punctuation and parse to a positive float (absolute value).
 */
function parseAmount(raw: string): number {
  const cleaned = String(raw ?? "")
    .replace(/[Rp,.\s]/g, "")
    .replace(/[^\d-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.abs(n);
}

/**
 * Find the first header key in a row that matches any of the given synonyms.
 * Returns the original (un-normalized) header string.
 */
function findHeaderKey(headers: string[], synonyms: string[]): string {
  // Exact match first
  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (synonyms.some((s) => norm === s)) return h;
  }
  // Substring match
  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (synonyms.some((s) => norm.includes(s) || s.includes(norm))) return h;
  }
  return "";
}

/**
 * Parse a cashflow export file (CSV or XLSX) into ParsedCashflowRow[].
 * Skips rows where amount is 0 and description is empty.
 */
export function parseCashflowFile(content: string | ArrayBuffer): ParsedCashflowRow[] {
  const rows = readFileToRows(content);
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);

  // Build header map once
  const keyMap = {
    category: findHeaderKey(headers, COLUMN_SYNONYMS.category),
    subCategory: findHeaderKey(headers, COLUMN_SYNONYMS.subCategory),
    amount: findHeaderKey(headers, COLUMN_SYNONYMS.amount),
    description: findHeaderKey(headers, COLUMN_SYNONYMS.description),
    txnDate: findHeaderKey(headers, COLUMN_SYNONYMS.txnDate),
  };

  const result: ParsedCashflowRow[] = [];

  for (const row of rows) {
    const rawCategory = (row[keyMap.category] ?? "").trim();
    const subCategory = (row[keyMap.subCategory] ?? "").trim();
    const rawAmount = (row[keyMap.amount] ?? "").trim();
    const description = (row[keyMap.description] ?? "").trim();
    const rawDate = (row[keyMap.txnDate] ?? "").trim();

    const amount = parseAmount(rawAmount);

    // Skip meaningless rows
    if (amount === 0 && description === "") continue;

    const category = resolveCategory(rawCategory);
    const txnDate = normalizeDateString(rawDate);

    result.push({ category, subCategory, amount, description, txnDate });
  }

  return result;
}
