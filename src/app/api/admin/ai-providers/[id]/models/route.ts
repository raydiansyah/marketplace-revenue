/**
 * Module: Admin AI Provider — List Available Models
 * Purpose: Fetch available model IDs from the provider's API for superadmin selection
 * Used by: src/app/admin/ai/page.tsx
 * Dependencies: src/lib/auth/session, src/lib/db/schema, src/lib/crypto/secret
 * Public functions: GET (list models for a provider)
 * Side effects: 1 external HTTP call to provider API; results cached in-memory for 1 hour
 * Error handling: safeJson untuk external fetch; duck-type Response check untuk cross-realm instanceof
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
const FETCH_TIMEOUT_MS = 15_000;

/** Safely parse JSON — returns null instead of throwing on invalid body. */
async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

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
      return NextResponse.json({ error: "Gagal mendekripsi API key provider" }, { status: 500 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let models: string[] = [];

    try {
      if (row.provider === "anthropic") {
        const res = await fetch("https://api.anthropic.com/v1/models", {
          signal: controller.signal,
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return NextResponse.json(
            { error: `Anthropic API error ${res.status}: ${body.slice(0, 200)}` },
            { status: 502 }
          );
        }
        const data = await safeJson(res) as { data?: Array<{ id: string }> } | null;
        models = (data?.data ?? []).map((m) => m.id).filter(Boolean);
      } else {
        // openai-compatible: strip trailing slash from baseUrl
        const rawBase = (row.baseUrl ?? "https://api.openai.com").replace(/\/+$/, "");
        const res = await fetch(`${rawBase}/v1/models`, {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          return NextResponse.json(
            { error: `Provider API error ${res.status}: ${body.slice(0, 200)}` },
            { status: 502 }
          );
        }
        const data = await safeJson(res) as { data?: Array<{ id: string }> } | null;
        // Return ALL models — caller filters/searches in UI
        models = (data?.data ?? []).map((m) => m.id).filter(Boolean);
      }
    } finally {
      clearTimeout(timeout);
    }

    modelsCache.set(id, { models, expiresAt: Date.now() + CACHE_TTL_MS });

    return NextResponse.json({ models });
  } catch (e) {
    // requireRole/requireSession throws a Response (401/403)
    // Use instanceof + duck-type fallback for cross-realm Response objects
    if (e instanceof Response) return e;
    if (e != null && typeof e === "object" && typeof (e as Response).status === "number" &&
        typeof (e as Response).json === "function") {
      return e as Response;
    }
    const err = e instanceof Error ? e : new Error(String(e));
    const isAbort = err.name === "AbortError" || err.message.toLowerCase().includes("abort");
    console.error("[GET /api/admin/ai-providers/[id]/models]", err);
    return NextResponse.json(
      { error: isAbort ? "Request timeout — provider API tidak merespons dalam 15 detik" : `Server error: ${err.message}` },
      { status: 500 }
    );
  }
}
