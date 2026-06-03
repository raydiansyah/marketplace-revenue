/**
 * Module: Admin AI Providers API — List & Create
 * Purpose: Superadmin CRUD for global AI provider configurations
 * Used by: src/app/admin/ai/page.tsx
 * Dependencies: src/lib/auth/session, src/lib/db/schema, src/lib/crypto/secret
 * Public functions: GET (list providers), POST (create provider)
 * Side effects: DB read/write (ai_providers). Never returns encryptedApiKey in responses.
 *
 * Required env: AI_SECRET_ENCRYPTION_KEY (32-byte base64)
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { aiProviders } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/crypto/secret";
import type { AiProviderInfo } from "@/lib/types";
import type { AiProviderRow } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    await requireRole(["superadmin"]);
    const db = await getDb();

    const rows = await db
      .select({
        id: aiProviders.id,
        provider: aiProviders.provider,
        label: aiProviders.label,
        baseUrl: aiProviders.baseUrl,
        defaultModel: aiProviders.defaultModel,
        isActive: aiProviders.isActive,
        lastTestAt: aiProviders.lastTestAt,
        createdByUserId: aiProviders.createdByUserId,
        createdAt: aiProviders.createdAt,
      })
      .from(aiProviders)
      .orderBy(desc(aiProviders.createdAt));

    const providers: AiProviderInfo[] = (rows as Pick<AiProviderRow, "id" | "provider" | "label" | "baseUrl" | "defaultModel" | "isActive" | "lastTestAt" | "createdByUserId" | "createdAt">[]).map((r) => ({
      id: r.id,
      provider: r.provider,
      label: r.label,
      baseUrl: r.baseUrl ?? undefined,
      defaultModel: r.defaultModel ?? undefined,
      isActive: r.isActive === 1,
      lastTestAt: r.lastTestAt ? new Date(r.lastTestAt).toISOString() : undefined,
      createdByUserId: r.createdByUserId ?? undefined,
      createdAt: new Date(r.createdAt).toISOString(),
    }));

    return NextResponse.json({ providers });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/admin/ai-providers]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(["superadmin"]);
    const body = (await req.json()) as {
      provider: "anthropic" | "openai";
      label: string;
      baseUrl?: string;
      apiKey: string;
      defaultModel?: string;
    };

    const { provider, label, baseUrl, apiKey, defaultModel } = body;

    if (!provider || !label || !apiKey) {
      return NextResponse.json(
        { error: "provider, label, dan apiKey wajib diisi" },
        { status: 400 }
      );
    }
    if (!["anthropic", "openai"].includes(provider)) {
      return NextResponse.json({ error: "provider tidak valid" }, { status: 400 });
    }

    const encryptedApiKey = encryptSecret(apiKey);
    const id = randomUUID();
    const db = await getDb();

    await db.insert(aiProviders).values({
      id,
      provider,
      label,
      baseUrl: baseUrl ?? null,
      encryptedApiKey,
      defaultModel: defaultModel ?? null,
      isActive: 0,  // new providers start inactive — must be explicitly activated
      createdByUserId: session.sub,
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/admin/ai-providers]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
