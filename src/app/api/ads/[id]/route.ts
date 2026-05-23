/**
 * Module: Ads Entry DELETE route
 * Purpose: Delete a single ads_entries row by ID, scoped to the authenticated user
 * Used by: /ads page (delete row)
 * Dependencies: auth/session, db/schema (adsEntries), drizzle-orm
 * Public functions: DELETE /api/ads/[id]
 * Side effects: deletes one row from ads_entries table
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { adsEntries } from "@/lib/db/schema";

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
      .select({ id: adsEntries.id })
      .from(adsEntries)
      .where(and(eq(adsEntries.id, id), eq(adsEntries.userId, session.sub)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Data iklan tidak ditemukan" }, { status: 404 });
    }

    await db
      .delete(adsEntries)
      .where(and(eq(adsEntries.id, id), eq(adsEntries.userId, session.sub)));

    return NextResponse.json({ deleted: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[DELETE /api/ads/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
