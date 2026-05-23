/**
 * Module: Admin AI Provider — List Available Models
 * Purpose: Fetch available model IDs from the provider's API for superadmin selection
 * Used by: src/app/admin/ai/page.tsx
 * Dependencies: src/lib/auth/session, src/lib/db/schema, src/lib/crypto/secret
 * Public functions: GET (list models for a provider)
 * Side effects: 1 external HTTP call to provider API; results cached in-memory for 1 hour
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { aiProviders } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { decryptSecret } from "@/lib/crypto/secret";
import { eq } from "drizzle-orm";

// Module-level 1-hour cache: { models, expiresAt }
const modelsCache = new Map<string, { models: string[]; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["superadmin"]);
    const { id } = await params;

    // Check cache
    const cached = modelsCache.get(id);
    if (cached && Date.now() < cached.expiresAt) {
      return NextResponse.json({ models: cached.models });
    }

    const db = await getDb();
    const rows = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Provider tidak ditemukan" }, { status: 404 });
    }

    const row = rows[0];
    let apiKey: string;
    try {
      apiKey = decryptSecret(row.encryptedApiKey);
    } catch {
      return NextResponse.json({ error: "Gagal mendekripsi API key" }, { status: 500 });
    }

    let models: string[] = [];

    if (row.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Anthropic API error: ${res.status}` },
          { status: 502 }
        );
      }
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      models = (data.data ?? []).map((m) => m.id);
    } else {
      // openai-compatible
      const baseUrl = row.baseUrl ?? "https://api.openai.com";
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `OpenAI API error: ${res.status}` },
          { status: 502 }
        );
      }
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      // Filter to text/chat models only
      models = (data.data ?? [])
        .map((m) => m.id)
        .filter(
          (modelId) =>
            modelId.startsWith("gpt") ||
            modelId.startsWith("o1") ||
            modelId.startsWith("o3")
        );
    }

    modelsCache.set(id, { models, expiresAt: Date.now() + CACHE_TTL_MS });

    return NextResponse.json({ models });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/admin/ai-providers/[id]/models]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
