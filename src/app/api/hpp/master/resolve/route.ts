/**
 * Module: HPP Master Resolve API — POST
 * Purpose: Save manual SKU alias mapping (order SKU → master HPP entry)
 * Used by: src/components/HppUnmatchedPanel.tsx
 * Dependencies: hppMaster queries, requireSession
 * Public functions: POST ({ orderSku, masterEntryId })
 * Side effects: DB write to hpp_sku_aliases
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { upsertSkuAlias, listHppMaster } from "@/lib/db/queries/hppMaster";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json() as { orderSku?: unknown; masterEntryId?: unknown };

    const orderSku = typeof body.orderSku === "string" ? body.orderSku.trim() : "";
    const masterEntryId = typeof body.masterEntryId === "string" ? body.masterEntryId.trim() : "";

    if (!orderSku) {
      return NextResponse.json({ error: "orderSku wajib diisi" }, { status: 400 });
    }
    if (!masterEntryId) {
      return NextResponse.json({ error: "masterEntryId wajib diisi" }, { status: 400 });
    }

    const masterEntries = await listHppMaster(session.sub);
    const valid = masterEntries.some((e) => e.id === masterEntryId);
    if (!valid) {
      return NextResponse.json({ error: "masterEntryId tidak valid" }, { status: 404 });
    }

    await upsertSkuAlias(session.sub, orderSku, masterEntryId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/hpp/master/resolve]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
