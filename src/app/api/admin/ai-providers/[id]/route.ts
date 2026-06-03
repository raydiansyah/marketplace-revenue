/**
 * Module: Admin AI Provider — Update & Delete
 * Purpose: Superadmin PATCH/DELETE for a single AI provider record
 * Used by: src/app/admin/ai/page.tsx
 * Dependencies: src/lib/auth/session, src/lib/db/schema, src/lib/crypto/secret
 * Public functions: PATCH (update provider fields), DELETE (remove provider)
 * Side effects: DB read/write (ai_providers). Never returns encryptedApiKey.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { aiProviders } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/crypto/secret";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["superadmin"]);
    const { id } = await params;
    const body = (await req.json()) as {
      label?: string;
      baseUrl?: string | null;
      defaultModel?: string | null;
      isActive?: boolean | number;
      apiKey?: string;
    };

    const db = await getDb();

    // Build update payload (only defined fields)
    const updates: Record<string, unknown> = {};
    if (body.label !== undefined) updates.label = body.label;
    if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
    if (body.defaultModel !== undefined) updates.defaultModel = body.defaultModel;
    if (body.isActive !== undefined) {
      updates.isActive = body.isActive ? 1 : 0;
    }
    if (body.apiKey) {
      updates.encryptedApiKey = encryptSecret(body.apiKey);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Tidak ada field yang diupdate" }, { status: 400 });
    }

    await db.update(aiProviders).set(updates).where(eq(aiProviders.id, id));

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[PATCH /api/admin/ai-providers/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["superadmin"]);
    const { id } = await params;
    const db = await getDb();

    await db.delete(aiProviders).where(eq(aiProviders.id, id));

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[DELETE /api/admin/ai-providers/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
