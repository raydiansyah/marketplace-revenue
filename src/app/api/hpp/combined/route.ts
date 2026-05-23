/**
 * Module: HPP Combined API — GET
 * Purpose: Load combined HPP view across all marketplaces with conflict detection
 * Used by: src/components/HppManagerTabbed.tsx (Gabungan tab)
 * Dependencies: loadCombinedHppWithConflicts, requireSession
 * Public functions: GET (?q=&conflictsOnly=false)
 * Side effects: DB reads from hpp_marketplace_entries and hpp_entries
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { loadCombinedHppWithConflicts } from "@/lib/hpp/combined";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim().toLowerCase();
    const conflictsOnly = searchParams.get("conflictsOnly") === "true";

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

    return NextResponse.json({ entries: filtered, conflicts, total: filtered.length });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/hpp/combined]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
