/**
 * Module: AI Status API
 * Purpose: Check whether an active AI provider is configured (for all authenticated users)
 * Used by: src/components/ai/AiInsightPanel.tsx
 * Dependencies: src/lib/auth/session, src/lib/db/schema
 * Public functions: GET (return { available, providerLabel?, model? })
 * Side effects: DB read (ai_providers, 1 row max). Never returns API key.
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { aiProviders } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    await requireSession();
    const db = await getDb();

    const rows = await db
      .select({
        label: aiProviders.label,
        defaultModel: aiProviders.defaultModel,
      })
      .from(aiProviders)
      .where(eq(aiProviders.isActive, 1))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ available: false });
    }

    return NextResponse.json({
      available: true,
      providerLabel: rows[0].label,
      model: rows[0].defaultModel ?? null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/ai/status]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
