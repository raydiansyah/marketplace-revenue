/**
 * Module: Upload File Validator
 * Purpose: Validate structure of marketplace upload files using header-overlap scoring
 *          instead of strict positional column matching.
 * Used by: src/app/upload/page.tsx before parsing order/income/cancel/return files.
 * Dependencies: xlsx (workbook reader), papaparse (CSV reader), headerDictionary (synonyms),
 *               templateDetector (score-based detection), src/lib/types (MarketplaceId).
 * Public functions: validateUploadFile(), validateUploadFileOrThrow()
 * Side effects: No DB/network writes; reads file content in memory only.
 */

import * as XLSX from "xlsx";
import Papa from "papaparse";
import type { MarketplaceId } from "@/lib/types";
import type { FileRole } from "./headerDictionary";
import { detectTemplate, scoreSheetAgainstTemplate } from "./templateDetector";
import { getTemplateSpecs, normalizeHeader } from "./headerDictionary";

// ─────────────────────────────────────────────────────────────────────────────
// Public types (unchanged API)
// ─────────────────────────────────────────────────────────────────────────────

export type UploadFileRole =
  | "orders"
  | "canceled-orders"
  | "failed-delivery"
  | "return-orders"
  | "income";

type ValidationResult = { ok: true } | { ok: false; message: string };

interface ValidateUploadFileInput {
  marketplace: MarketplaceId;
  role: UploadFileRole;
  fileName: string;
  content: string | ArrayBuffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Role mapping: old UploadFileRole → FileRole used in TemplateSpec
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_MAP: Record<UploadFileRole, FileRole> = {
  orders: "orders",
  income: "income",
  "canceled-orders": "cancel",
  "return-orders": "return",
  "failed-delivery": "cancel", // failed-delivery uses cancel-style columns (cancel_reason or status)
};

// ─────────────────────────────────────────────────────────────────────────────
// Sheet extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

function sheetToStringRows(sheet: XLSX.WorkSheet): string[][] {
  const cellAddresses = Object.keys(sheet).filter((key) =>
    /^[A-Z]+\d+$/i.test(key)
  );
  if (cellAddresses.length === 0) return [];

  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = Number.NEGATIVE_INFINITY;
  let minCol = Number.POSITIVE_INFINITY;
  let maxCol = Number.NEGATIVE_INFINITY;

  for (const address of cellAddresses) {
    const cell = XLSX.utils.decode_cell(address);
    if (cell.r < minRow) minRow = cell.r;
    if (cell.r > maxRow) maxRow = cell.r;
    if (cell.c < minCol) minCol = cell.c;
    if (cell.c > maxCol) maxCol = cell.c;
  }

  const rows: string[][] = [];
  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex++) {
    const row: string[] = [];
    for (let colIndex = minCol; colIndex <= maxCol; colIndex++) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      const cell = sheet[address] as XLSX.CellObject | undefined;
      row.push(String(cell?.w ?? cell?.v ?? ""));
    }
    rows.push(row);
  }
  return rows;
}

function workbookToSheets(
  buffer: ArrayBuffer
): { name: string; rows: string[][] }[] {
  const wb = XLSX.read(buffer, { type: "array", cellText: true, cellDates: true });
  return (wb.SheetNames ?? []).map((name) => {
    const sheet = wb.Sheets[name];
    const rows = sheet ? sheetToStringRows(sheet) : [];
    return { name, rows };
  });
}

function csvToSheet(csvContent: string): { name: string; rows: string[][] } {
  const parsed = Papa.parse<string[]>(csvContent, {
    header: false,
    skipEmptyLines: true,
  });
  const rows = (parsed.data ?? []).map((row) =>
    (row ?? []).map((cell) => String(cell ?? ""))
  );
  return { name: "csv", rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Human-friendly error: show top mismatched candidates
// ─────────────────────────────────────────────────────────────────────────────

function buildFailureMessage(
  marketplace: MarketplaceId,
  uploadRole: UploadFileRole,
  sheets: { name: string; rows: string[][] }[]
): string {
  const fileRole = ROLE_MAP[uploadRole];
  const allSpecs = getTemplateSpecs().filter(
    (s) => s.marketplace === marketplace && s.role === fileRole
  );

  // Find the best header row across all sheets (the one with most non-empty cells)
  let bestHeaderRow: string[] = [];
  let bestNonEmpty = 0;
  for (const sheet of sheets) {
    for (let i = 0; i < Math.min(sheet.rows.length, 20); i++) {
      const row = sheet.rows[i] ?? [];
      const nonEmpty = row.filter((c) => normalizeHeader(c) !== "").length;
      if (nonEmpty > bestNonEmpty) {
        bestNonEmpty = nonEmpty;
        bestHeaderRow = row;
      }
    }
  }

  if (allSpecs.length === 0) {
    return `Template validasi belum tersedia untuk ${marketplace} (${uploadRole}).`;
  }

  // Score each spec against the best candidate header row to show what's missing
  const scored = allSpecs
    .map((spec) => {
      const result = scoreSheetAgainstTemplate(bestHeaderRow, spec);
      return { spec, result };
    })
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, 3);

  const lines: string[] = [
    `File tidak dikenali sebagai format ${marketplace} ${uploadRole}.`,
  ];

  for (const { spec, result } of scored) {
    if (result.missingRequired.length > 0) {
      lines.push(
        `  Template "${spec.id}": kolom wajib tidak ditemukan → ${result.missingRequired.join(", ")}`
      );
    }
  }

  if (bestHeaderRow.length > 0) {
    const preview = bestHeaderRow
      .filter((c) => normalizeHeader(c) !== "")
      .slice(0, 6)
      .join(", ");
    lines.push(`  Header ditemukan: ${preview || "(tidak ada)"}`);
  }

  lines.push(
    "Pastikan file yang diunggah benar dan kolom-kolom utama tidak dihapus atau diubah namanya."
  );

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Core validation logic
// ─────────────────────────────────────────────────────────────────────────────

function validateSheets(
  sheets: { name: string; rows: string[][] }[],
  marketplace: MarketplaceId,
  uploadRole: UploadFileRole
): ValidationResult {
  const fileRole = ROLE_MAP[uploadRole];

  const result = detectTemplate(sheets, {
    marketplace,
    role: fileRole,
  });

  if (result) {
    return { ok: true };
  }

  return {
    ok: false,
    message: buildFailureMessage(marketplace, uploadRole, sheets),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API (signatures unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export function validateUploadFile(
  input: ValidateUploadFileInput
): ValidationResult {
  if (input.content instanceof ArrayBuffer) {
    const sheets = workbookToSheets(input.content);
    return validateSheets(sheets, input.marketplace, input.role);
  }

  // CSV: single pseudo-sheet
  const sheet = csvToSheet(input.content);
  return validateSheets([sheet], input.marketplace, input.role);
}

export function validateUploadFileOrThrow(
  input: ValidateUploadFileInput
): void {
  const result = validateUploadFile(input);
  if (!result.ok) {
    throw new Error(`[${input.fileName}] ${result.message}`);
  }
}
