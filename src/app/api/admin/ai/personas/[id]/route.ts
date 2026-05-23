/**
 * Module: Persona API (Update + Delete)
 * Purpose: PATCH to update a persona (including set-default with transaction); DELETE to remove
 * Used by: src/app/admin/ai/page.tsx (Persona Agent tab)
 * Dependencies: src/lib/auth/session, src/lib/db/client, src/lib/db/schema
 * Public functions: PATCH, DELETE
 * Side effects: DB writes to ai_agent_personas (UPDATE, DELETE); when isDefault=true, clears all others first
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { aiAgentPersonas } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { eq, sql } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["superadmin"]);

    const { id } = await params;
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      systemPrompt?: string;
      tone?: "formal" | "casual" | "expert" | "friendly";
      isDefault?: boolean;
    };

    const db = await getDb();

    // Build partial update object
    const updates: Partial<{
      name: string;
      description: string | null;
      systemPrompt: string;
      tone: "formal" | "casual" | "expert" | "friendly";
      isDefault: number;
    }> = {};

    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined)
      updates.description = body.description?.trim() || null;
    if (body.systemPrompt !== undefined)
      updates.systemPrompt = body.systemPrompt.trim();
    if (body.tone !== undefined) updates.tone = body.tone;

    if (body.isDefault === true) {
      // Transaction: clear all defaults, then set this one
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.transaction(async (tx: any) => {
        await tx
          .update(aiAgentPersonas)
          .set({ isDefault: 0 })
          .where(sql`1 = 1`);

        await tx
          .update(aiAgentPersonas)
          .set({ ...updates, isDefault: 1 })
          .where(eq(aiAgentPersonas.id, id));
      });
    } else {
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ ok: true });
      }
      await db
        .update(aiAgentPersonas)
        .set(updates)
        .where(eq(aiAgentPersonas.id, id));
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[PATCH /api/admin/ai/personas/[id]]", e);
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

    await db.delete(aiAgentPersonas).where(eq(aiAgentPersonas.id, id));

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[DELETE /api/admin/ai/personas/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
