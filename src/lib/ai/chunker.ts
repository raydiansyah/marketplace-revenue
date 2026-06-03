/**
 * Module: Document Chunker
 * Purpose: Split text into overlapping chunks for RAG ingestion; extract text from uploaded files
 * Used by: src/app/api/admin/ai/rag/upload/route.ts
 * Dependencies: xlsx (for .xlsx parsing)
 * Public functions: chunkText(), extractTextFromFile()
 * Side effects: None (pure transformations)
 */

import { read, utils } from "xlsx";

/**
 * Split `text` into overlapping chunks of ~`chunkSize` characters.
 * Each chunk overlaps the previous by `overlap` characters to preserve context at boundaries.
 * Returns an empty array for empty input.
 */
export function chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
  if (!text || text.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - overlap;
  }

  return chunks;
}

/**
 * Extract plain text from a file buffer based on file extension.
 * Supported: .txt, .md, .csv — returned as UTF-8 string.
 *            .xlsx — all sheets converted to CSV and concatenated.
 * Throws for unsupported formats.
 */
export function extractTextFromFile(buffer: Buffer, fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "txt" || ext === "md" || ext === "csv") {
    return buffer.toString("utf-8");
  }

  if (ext === "xlsx") {
    const workbook = read(buffer, { type: "buffer" });
    const parts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = utils.sheet_to_csv(sheet);
      parts.push(csv);
    }

    return parts.join("\n");
  }

  throw new Error("Format file tidak didukung (.txt, .csv, .xlsx, .md)");
}
