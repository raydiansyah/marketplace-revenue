/**
 * Module: HPP Marketplace Entry API — PATCH + DELETE
 * Purpose: Update or delete a single hpp_marketplace_entries row
 * Used by: src/components/HppManagerTabbed.tsx (inline edit, delete)
 * Dependencies: hppMarketplace queries, requireSession
 * Public functions: PATCH (/api/hpp/marketplace/[id]), DELETE (/api/hpp/marketplace/[id])
 * Side effects: DB update/delete on hpp_marketplace_entries
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { updateHppMarketplace, deleteHppMarketplace } from "@/lib/db/queries/hppMarketplace";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await req.json() as { cost?: unknown; sku?: unknown; productName?: unknown };

    const patch: { cost?: number; sku?: string; productName?: string } = {};
    if (body.cost !== undefined) {
      const cost = Number(body.cost);
      if (Number.isNaN(cost) || cost < 0) {
        return NextResponse.json({ error: "HPP tidak valid" }, { status: 422 });
      }
      patch.cost = cost;
    }
    if (body.sku !== undefined) patch.sku = String(body.sku);
    if (body.productName !== undefined) {
      if (!body.productName || String(body.productName).trim() === "") {
        return NextResponse.json({ error: "productName tidak boleh kosong" }, { status: 422 });
      }
      patch.productName = String(body.productName);
    }

    const updated = await updateHppMarketplace(id, session.sub, patch);
    if (!updated) {
      return NextResponse.json({ error: "Entry tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[PATCH /api/hpp/marketplace/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const deleted = await deleteHppMarketplace(id, session.sub);
    if (!deleted) {
      return NextResponse.json({ error: "Entry tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[DELETE /api/hpp/marketplace/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
