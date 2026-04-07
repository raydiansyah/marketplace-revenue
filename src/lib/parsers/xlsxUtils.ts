/**
 * Smart XLSX reader.
 *
 * Masalah umum pada file export marketplace:
 * - Ada baris judul / metadata di atas header sebenarnya
 * - Baris kosong di antara header dan data
 * - Header tidak selalu ada di row 1
 *
 * Solusi: baca semua baris sebagai array, cari baris yang paling mungkin
 * menjadi header (banyak sel terisi, tidak semua angka), lalu buat map
 * header → value per baris data.
 */

import * as XLSX from "xlsx";
import Papa from "papaparse";

function sheetToRawRowsAllCells(sheet: XLSX.WorkSheet): unknown[][] {
  const cellAddresses = Object.keys(sheet).filter((key) => /^[A-Z]+\d+$/i.test(key));
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

  const rawRows: unknown[][] = [];
  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex++) {
    const row: string[] = [];
    for (let colIndex = minCol; colIndex <= maxCol; colIndex++) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      const cell = sheet[address] as XLSX.CellObject | undefined;
      row.push(String(cell?.w ?? cell?.v ?? ""));
    }
    rawRows.push(row);
  }

  return rawRows;
}

/**
 * Baca XLSX / XLS / CSV dan kembalikan array of objects.
 * Secara otomatis mendeteksi baris header meskipun ada baris metadata di atas.
 */
export function readFileToRows(content: string | ArrayBuffer): Record<string, string>[] {
  if (content instanceof ArrayBuffer) {
    return readXlsxToRows(content);
  }
  return readCsvToRows(content);
}

export interface WorkbookSheetRows {
  sheetName: string;
  rows: Record<string, string>[];
}

export interface WorkbookSheetRawRows {
  sheetName: string;
  rawRows: unknown[][];
}

export function readWorkbookSheetsRawRowsViaTsv(buffer: ArrayBuffer): WorkbookSheetRawRows[] {
  const wb = XLSX.read(buffer, { type: "array", cellText: true, cellDates: true });
  const results: WorkbookSheetRawRows[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const tsv = XLSX.utils.sheet_to_csv(sheet, {
      FS: "\t",
      RS: "\n",
      blankrows: false,
      strip: false,
    });

    const parsed = Papa.parse<string[]>(tsv, {
      delimiter: "\t",
      skipEmptyLines: true,
    });

    const rawRows = (parsed.data ?? []).map((row) =>
      (row ?? []).map((cell) => String(cell ?? ""))
    );

    if (rawRows.length === 0) continue;
    results.push({ sheetName, rawRows });
  }

  return results;
}

export function readWorkbookSheetsRawRows(buffer: ArrayBuffer): WorkbookSheetRawRows[] {
  const wb = XLSX.read(buffer, { type: "array", cellText: true, cellDates: true });
  const results: WorkbookSheetRawRows[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const rawRows: unknown[][] = sheetToRawRowsAllCells(sheet);

    if (rawRows.length === 0) continue;
    results.push({ sheetName, rawRows });
  }

  return results;
}

export function readWorkbookSheetsToRows(buffer: ArrayBuffer): WorkbookSheetRows[] {
  const wb = XLSX.read(buffer, { type: "array", cellText: true, cellDates: true });
  const results: WorkbookSheetRows[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const rawRows: unknown[][] = sheetToRawRowsAllCells(sheet);

    if (rawRows.length === 0) continue;

    const headerIdx = findHeaderRowIndex(rawRows);
    const rows = buildObjectRows(rawRows, headerIdx === -1 ? 0 : headerIdx);
    results.push({ sheetName, rows });
  }

  return results;
}

// ──────────────────────────────────────────────────────────────
// CSV reader (pakai papaparse, tetap sederhana)
// ──────────────────────────────────────────────────────────────

function readCsvToRows(csv: string): Record<string, string>[] {
  // Coba parse normal dulu
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  // Kalau semua row hanya punya 1 kolom, kemungkinan delimiter salah
  // (misal file pakai semicolon di beberapa locale)
  if (result.data.length > 0 && Object.keys(result.data[0]).length <= 1) {
    const retry = Papa.parse<Record<string, string>>(csv, {
      header: true,
      delimiter: ";",
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    if (Object.keys(retry.data[0] ?? {}).length > 1) return retry.data;
  }

  return result.data;
}

// ──────────────────────────────────────────────────────────────
// XLSX reader dengan smart header detection
// ──────────────────────────────────────────────────────────────

function readXlsxToRows(buffer: ArrayBuffer): Record<string, string>[] {
  let bestRows: Record<string, string>[] = [];
  let bestScore = -1;

  for (const sheetData of readWorkbookSheetsToRows(buffer)) {
    const rows = sheetData.rows;
    const score = scoreParsedRows(rows);

    if (score > bestScore) {
      bestScore = score;
      bestRows = rows;
    }
  }

  return bestRows;
}

function scoreParsedRows(rows: Record<string, string>[]): number {
  if (rows.length === 0) return 0;

  const nonEmptyRows = rows.filter((row) =>
    Object.values(row).some((value) => String(value ?? "").trim() !== "")
  );

  const uniqueHeaders = new Set<string>();
  for (const row of rows.slice(0, 20)) {
    for (const key of Object.keys(row)) {
      if (key.trim()) uniqueHeaders.add(key.trim().toLowerCase());
    }
  }

  if (uniqueHeaders.size <= 1) return 0;
  return nonEmptyRows.length * 10 + uniqueHeaders.size;
}

/**
 * Cari baris header: baris yang:
 * 1. Punya setidaknya 3 sel terisi
 * 2. Mayoritas sel-nya adalah string (bukan angka)
 * 3. Bukan baris yang berisi tanggal atau total saja
 *
 * Scan maksimum 15 baris pertama.
 */
function findHeaderRowIndex(rows: unknown[][]): number {
  const maxScan = Math.min(80, rows.length);

  const headerKeywords = [
    "order",
    "pesanan",
    "sku",
    "product",
    "produk",
    "status",
    "tanggal",
    "date",
    "settlement",
    "income",
    "pendapatan",
    "amount",
    "jumlah",
    "fee",
    "biaya",
    "revenue",
  ];

  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < maxScan; i++) {
    const row = rows[i];
    if (!row) continue;

    const nonEmpty = row.filter((cell) => cell !== "" && cell !== null && cell !== undefined);
    if (nonEmpty.length < 3) continue;

    const stringCells = nonEmpty.filter(
      (cell) => typeof cell === "string" && isNaN(Number(cell))
    );
    const stringRatio = stringCells.length / nonEmpty.length;

    const normalizedCells = nonEmpty.map((cell) =>
      String(cell)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
    );

    const keywordHits = normalizedCells.filter((cell) =>
      headerKeywords.some((keyword) => cell.includes(keyword))
    ).length;

    // Heuristic: header row biasanya > 60% string + mengandung keyword kolom
    const score = nonEmpty.length * stringRatio + keywordHits * 2;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }

    // Kalau score sudah bagus (banyak kolom string), langsung pakai
    if (stringRatio >= 0.7 && nonEmpty.length >= 4 && keywordHits >= 2) {
      return i;
    }
  }

  return bestIdx;
}

/**
 * Ubah array of arrays menjadi array of objects menggunakan baris headerIdx sebagai key.
 */
function buildObjectRows(
  rows: unknown[][],
  headerIdx: number
): Record<string, string>[] {
  const headers = (rows[headerIdx] ?? []).map((h) =>
    String(h ?? "").trim()
  );

  const result: Record<string, string>[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    // Skip baris kosong
    const nonEmpty = row.filter((c) => c !== "" && c !== null && c !== undefined);
    if (nonEmpty.length === 0) continue;

    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      if (!key) continue;
      // Kalau ada duplikat key, tambah suffix
      const finalKey = obj[key] !== undefined ? `${key}_${j}` : key;
      obj[finalKey] = String(row[j] ?? "").trim();
    }
    result.push(obj);
  }

  return result;
}
