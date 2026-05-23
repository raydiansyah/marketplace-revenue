/**
 * Module: AI Provider Factory
 * Purpose: Retrieve the active AI provider from DB, decrypt API key, and build a typed model instance
 * Used by: src/app/api/ai/insights/route.ts, src/app/api/admin/ai-providers/[id]/test/route.ts
 * Dependencies: @ai-sdk/anthropic, @ai-sdk/openai, src/lib/crypto/secret, src/lib/db/schema, drizzle-orm
 * Public functions: getActiveProvider(), buildProviderForRow()
 * Side effects: DB read (ai_providers), decrypts encrypted_api_key via AI_SECRET_ENCRYPTION_KEY env var
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { decryptSecret } from "@/lib/crypto/secret";
import { getDb } from "@/lib/db/client";
import { aiProviders } from "@/lib/db/schema";
import type { AiProviderRow } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export type LanguageModelInstance =
  | ReturnType<ReturnType<typeof createAnthropic>>
  | ReturnType<ReturnType<typeof createOpenAI>>;

export interface ActiveProvider {
  providerId: string;
  provider: "anthropic" | "openai";
  label: string;
  model: string;
  modelInstance: LanguageModelInstance;
}

/**
 * Build a model instance from a raw AiProviderRow.
 * Returns null if decryption fails (e.g. corrupt key or missing env var).
 */
export function buildProviderForRow(row: AiProviderRow): ActiveProvider | null {
  let decrypted: string;
  try {
    decrypted = decryptSecret(row.encryptedApiKey);
  } catch {
    return null;
  }

  const model = row.defaultModel ?? (row.provider === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL);

  if (row.provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey: decrypted });
    return {
      providerId: row.id,
      provider: "anthropic",
      label: row.label,
      model,
      modelInstance: anthropic(model),
    };
  }

  // openai (compatible)
  const openai = createOpenAI({
    apiKey: decrypted,
    baseURL: row.baseUrl ?? undefined,
  });
  return {
    providerId: row.id,
    provider: "openai",
    label: row.label,
    model,
    modelInstance: openai(model),
  };
}

/**
 * Get the currently active AI provider.
 * Returns null if no provider is configured (is_active=1) or decryption fails.
 */
export async function getActiveProvider(): Promise<ActiveProvider | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.isActive, 1))
    .limit(1);

  if (rows.length === 0) return null;

  return buildProviderForRow(rows[0]);
}
