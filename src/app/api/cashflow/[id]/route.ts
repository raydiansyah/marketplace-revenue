/**
 * Module: Cashflow Entry DELETE route
 * Purpose: Delete a single cashflow_entries row by ID, scoped to authenticated user
 * Used by: /cashflow page (delete row)
 * Dependencies: auth/session, db/schema (cashflowEntries), drizzle-orm
 * Public functions: DELETE /api/cashflow/[id]
 * Side effects: deletes one row from cashflow_entries table
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { cashflowEntries } from "@/lib/db/schema";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "ID wajib diisi" }, { status: 400 });
    }

    const db = await getDb();

    // Verify ownership before deleting
    const existing = await db
      .select({ id: cashflowEntries.id })
      .from(cashflowEntries)
      .where(and(eq(cashflowEntries.id, id), eq(cashflowEntries.userId, session.sub)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Data keuangan tidak ditemukan" }, { status: 404 });
    }

    await db
      .delete(cashflowEntries)
      .where(and(eq(cashflowEntries.id, id), eq(cashflowEntries.userId, session.sub)));

    return NextResponse.json({ deleted: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[DELETE /api/cashflow/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
