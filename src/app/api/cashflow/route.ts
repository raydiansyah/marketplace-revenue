/**
 * Module: Cashflow API — collection GET + manual entry POST
 * Purpose: Retrieve cashflow entries/summary and insert single manual entry
 * Used by: /cashflow page
 * Dependencies: auth/session, db/schema (cashflowEntries), getStoreById, drizzle-orm
 * Public functions: GET /api/cashflow, POST /api/cashflow
 * Side effects: reads/writes cashflow_entries table in TiDB
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { cashflowEntries, type CashflowEntryRow, type NewCashflowEntryRow } from "@/lib/db/schema";
import { getStoreById } from "@/lib/db/queries/stores";
import type { CashflowEntry, CashflowSummary, CashflowCategory } from "@/lib/types";

const VALID_CATEGORIES: CashflowCategory[] = ["income", "expense"];

// ---------------------------------------------------------------------------
// GET /api/cashflow
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);

    const storeId = searchParams.get("storeId");
    const yearStr = searchParams.get("year");
    const monthStr = searchParams.get("month");
    const category = searchParams.get("category") as CashflowCategory | null;

    const db = await getDb();

    const conditions = [eq(cashflowEntries.userId, session.sub)];
    if (storeId) conditions.push(eq(cashflowEntries.storeId, storeId));
    if (yearStr) {
      const year = parseInt(yearStr, 10);
      if (!isNaN(year)) conditions.push(eq(cashflowEntries.periodYear, year));
    }
    if (monthStr) {
      const month = parseInt(monthStr, 10);
      if (!isNaN(month)) conditions.push(eq(cashflowEntries.periodMonth, month));
    }
    if (category && VALID_CATEGORIES.includes(category)) {
      conditions.push(eq(cashflowEntries.category, category));
    }

    const rows = await db
      .select()
      .from(cashflowEntries)
      .where(and(...conditions));

    const entries: CashflowEntry[] = rows.map((r: CashflowEntryRow) => {
      const txnDateVal = r.txnDate as unknown;
      const txnDateStr =
        typeof txnDateVal === "string"
          ? txnDateVal
          : txnDateVal instanceof Date
          ? txnDateVal.toISOString().slice(0, 10)
          : String(txnDateVal ?? "");
      return {
        id: r.id,
        storeId: r.storeId,
        periodYear: r.periodYear,
        periodMonth: r.periodMonth,
        category: r.category,
        subCategory: r.subCategory,
        amount: Number(r.amount),
        description: r.description,
        txnDate: txnDateStr,
        sourceFileName: r.sourceFileName ?? undefined,
        createdAt: r.createdAt.toISOString(),
      };
    });

    const summary: CashflowSummary = entries.reduce(
      (acc, e) => {
        if (e.category === "income") acc.totalIncome += e.amount;
        else acc.totalExpense += e.amount;
        return acc;
      },
      { totalIncome: 0, totalExpense: 0, netCashflow: 0 } satisfies CashflowSummary
    );
    summary.netCashflow = summary.totalIncome - summary.totalExpense;

    return NextResponse.json({ entries, summary });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/cashflow]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/cashflow — manual single entry
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = (await req.json()) as Record<string, unknown>;

    const { storeId, periodYear, periodMonth, category, subCategory, amount, description, txnDate } = body;

    // Validation
    if (typeof storeId !== "string" || !storeId.trim()) {
      return NextResponse.json({ error: "storeId wajib diisi" }, { status: 400 });
    }
    if (!VALID_CATEGORIES.includes(category as CashflowCategory)) {
      return NextResponse.json({ error: "category harus income atau expense" }, { status: 400 });
    }
    const yearNum = Number(periodYear);
    const monthNum = Number(periodMonth);
    if (!Number.isInteger(yearNum) || !Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json({ error: "periodYear dan periodMonth tidak valid" }, { status: 400 });
    }
    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: "amount harus lebih dari 0" }, { status: 400 });
    }
    if (typeof txnDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(txnDate)) {
      return NextResponse.json({ error: "txnDate harus format YYYY-MM-DD" }, { status: 400 });
    }

    // Ownership check
    const store = await getStoreById(storeId.trim(), session.sub);
    if (!store) {
      return NextResponse.json({ error: "Toko tidak ditemukan atau akses ditolak" }, { status: 404 });
    }

    const db = await getDb();
    const id = randomUUID();

    const newEntry: NewCashflowEntryRow = {
      id,
      userId: session.sub,
      storeId: storeId.trim(),
      periodYear: yearNum,
      periodMonth: monthNum,
      category: category as CashflowCategory,
      subCategory: typeof subCategory === "string" ? subCategory.trim() : "",
      amount: String(amountNum),
      description: typeof description === "string" ? description.trim() : "",
      txnDate: new Date(txnDate),
      sourceFileName: null,
      createdAt: new Date(),
    };

    await db.insert(cashflowEntries).values(newEntry);

    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/cashflow]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
