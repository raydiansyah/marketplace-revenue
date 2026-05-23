/**
 * Module: Cashflow Upload API route
 * Purpose: Accept multipart upload of cashflow CSV/XLSX, parse and batch-INSERT into cashflow_entries
 * Used by: /cashflow page (upload form)
 * Dependencies: auth/session, db/schema (cashflowEntries), parseCashflowFile, getStoreById
 * Public functions: POST /api/cashflow/upload
 * Side effects: writes to cashflow_entries table in TiDB
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { cashflowEntries } from "@/lib/db/schema";
import { getStoreById } from "@/lib/db/queries/stores";
import { parseCashflowFile } from "@/lib/parsers/cashflow";
import type { NewCashflowEntryRow } from "@/lib/db/schema";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();

    const formData = await req.formData();
    const storeId = formData.get("storeId");
    const periodYearRaw = formData.get("periodYear");
    const periodMonthRaw = formData.get("periodMonth");
    const file = formData.get("file");

    // Validate required fields
    if (typeof storeId !== "string" || !storeId.trim()) {
      return NextResponse.json({ error: "storeId wajib diisi" }, { status: 400 });
    }
    const periodYear = parseInt(String(periodYearRaw ?? ""), 10);
    const periodMonth = parseInt(String(periodMonthRaw ?? ""), 10);
    if (isNaN(periodYear) || isNaN(periodMonth) || periodMonth < 1 || periodMonth > 12) {
      return NextResponse.json({ error: "periodYear dan periodMonth wajib diisi dan valid" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file wajib diupload" }, { status: 400 });
    }

    // Ownership check
    const store = await getStoreById(storeId.trim(), session.sub);
    if (!store) {
      return NextResponse.json({ error: "Toko tidak ditemukan atau akses ditolak" }, { status: 404 });
    }

    const buffer = await file.arrayBuffer();
    const parsed = parseCashflowFile(buffer);

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada baris data keuangan yang berhasil diparsing dari file ini" },
        { status: 422 }
      );
    }

    const db = await getDb();

    // Batch INSERT — append, chunked to avoid oversized queries
    const CHUNK_SIZE = 200;
    let inserted = 0;

    for (let i = 0; i < parsed.length; i += CHUNK_SIZE) {
      const chunk = parsed.slice(i, i + CHUNK_SIZE);
      const values: NewCashflowEntryRow[] = chunk.map((row) => ({
        id: randomUUID(),
        userId: session.sub,
        storeId: storeId.trim(),
        periodYear,
        periodMonth,
        category: row.category,
        subCategory: row.subCategory,
        amount: String(row.amount),
        description: row.description,
        txnDate: new Date(row.txnDate),
        sourceFileName: file.name,
        createdAt: new Date(),
      }));
      await db.insert(cashflowEntries).values(values);
      inserted += chunk.length;
    }

    return NextResponse.json({ inserted });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/cashflow/upload]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
