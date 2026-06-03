/**
 * Module: Admin AI Provider — Test Connection
 * Purpose: Send a minimal ping to verify a provider's API key is valid; update last_test_at
 * Used by: src/app/admin/ai/page.tsx
 * Dependencies: src/lib/auth/session, src/lib/db/schema, src/lib/ai/provider-factory, ai (generateText)
 * Public functions: POST (test provider connection)
 * Side effects: 1 AI API call (maxTokens=8), DB write (last_test_at)
 */

import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { getDb } from "@/lib/db/client";
import { aiProviders } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { buildProviderForRow } from "@/lib/ai/provider-factory";
import { eq } from "drizzle-orm";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["superadmin"]);
    const { id } = await params;
    const db = await getDb();

    const rows = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Provider tidak ditemukan" }, { status: 404 });
    }

    const providerRow = rows[0];
    const activeProvider = buildProviderForRow(providerRow);

    if (!activeProvider) {
      return NextResponse.json(
        { ok: false, error: "Gagal mendekripsi API key. Periksa AI_SECRET_ENCRYPTION_KEY." },
        { status: 200 }
      );
    }

    const startMs = Date.now();
    try {
      const result = await generateText({
        model: activeProvider.modelInstance,
        prompt: "Reply with exactly: pong",
        maxOutputTokens: 8,
      });
      const latencyMs = Date.now() - startMs;

      // Update last_test_at
      await db
        .update(aiProviders)
        .set({ lastTestAt: new Date() })
        .where(eq(aiProviders.id, id));

      return NextResponse.json({
        ok: true,
        latencyMs,
        response: result.text,
      });
    } catch (aiError) {
      const latencyMs = Date.now() - startMs;
      const message = aiError instanceof Error ? aiError.message : "AI call failed";
      return NextResponse.json({ ok: false, error: message, latencyMs }, { status: 200 });
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/admin/ai-providers/[id]/test]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
