/**
 * Module: HPP Combined API — GET
 * Purpose: Load combined HPP view across all marketplaces with conflict detection
 * Used by: src/components/HppManagerTabbed.tsx (Gabungan tab)
 * Dependencies: loadCombinedHppWithConflicts, requireSession
 * Public functions: GET (?q=&conflictsOnly=false&page=1&limit=20)
 * Side effects: DB reads from hpp_marketplace_entries and hpp_entries
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { loadCombinedHppWithConflicts } from "@/lib/hpp/combined";

const DEFAULT_LIMIT = 20;

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim().toLowerCase();
    const conflictsOnly = searchParams.get("conflictsOnly") === "true";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10)));

    const { entries, conflicts } = await loadCombinedHppWithConflicts(session.sub);
    const conflictSkus = new Set(conflicts.map((c) => c.sku));

    let filtered = entries;
    if (conflictsOnly) {
      filtered = filtered.filter((e) => conflictSkus.has(e.sku));
    }
    if (q) {
      filtered = filtered.filter(
        (e) =>
          e.productName.toLowerCase().includes(q) ||
          e.sku.toLowerCase().includes(q)
      );
    }

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * limit;
    const pageEntries = filtered.slice(offset, offset + limit);

    return NextResponse.json({ entries: pageEntries, conflicts, total, page: safePage, totalPages });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/hpp/combined]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
