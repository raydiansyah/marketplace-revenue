/**
 * Module: Personas API (List + Create)
 * Purpose: GET all AI agent personas; POST to create a new persona
 * Used by: src/app/admin/ai/page.tsx (Persona Agent tab)
 * Dependencies: src/lib/auth/session, src/lib/db/client, src/lib/db/schema
 * Public functions: GET, POST
 * Side effects: DB reads/writes to ai_agent_personas
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { aiAgentPersonas } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    await requireRole(["superadmin"]);

    const db = await getDb();
    const personas = await db
      .select()
      .from(aiAgentPersonas)
      .orderBy(desc(aiAgentPersonas.isDefault), desc(aiAgentPersonas.createdAt));

    return NextResponse.json({ personas });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/admin/ai/personas]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(["superadmin"]);

    const body = (await req.json()) as {
      name: string;
      description?: string;
      systemPrompt: string;
      tone?: "formal" | "casual" | "expert" | "friendly";
    };

    const { name, description, systemPrompt, tone } = body;

    if (!name?.trim() || !systemPrompt?.trim()) {
      return NextResponse.json(
        { error: "name dan systemPrompt wajib diisi" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const id = randomUUID();

    await db.insert(aiAgentPersonas).values({
      id,
      name: name.trim(),
      description: description?.trim() ?? null,
      systemPrompt: systemPrompt.trim(),
      tone: tone ?? "formal",
      isDefault: 0,
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/admin/ai/personas]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
