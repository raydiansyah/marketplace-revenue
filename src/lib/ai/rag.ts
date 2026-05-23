/**
 * Module: RAG (Retrieval-Augmented Generation) Utilities
 * Purpose: Keyword-based chunk retrieval from rag_chunks table + active persona resolution
 * Used by: src/app/api/ai/insights/route.ts, src/app/api/admin/ai/rag/search/route.ts
 * Dependencies: src/lib/db/client, src/lib/db/schema, src/lib/ai/prompts/system
 * Public functions: extractKeywords(), retrieveRelevantChunks(), buildRagContext(), getActivePersonaSystemPrompt()
 * Side effects: DB reads from rag_chunks and ai_agent_personas
 */

import { getDb } from "@/lib/db/client";
import { ragChunks, aiAgentPersonas } from "@/lib/db/schema";
import { SYSTEM_PROMPT } from "@/lib/ai/prompts/system";
import { like, or, eq } from "drizzle-orm";

/**
 * Extract meaningful keywords from a query string.
 * - Lowercases, splits on non-word chars
 * - Filters words longer than 3 chars
 * - Deduplicates
 * - Returns at most 8 keywords
 */
export function extractKeywords(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);

  const unique = Array.from(new Set(words));
  return unique.slice(0, 8);
}

/**
 * Retrieve relevant RAG chunks for a query using keyword LIKE search.
 * - Extracts keywords, builds OR LIKE conditions across all keywords
 * - Fetches up to limit*2 rows, deduplicates by id, returns top `limit`
 * - Returns array of content strings (empty if no chunks or no keywords)
 */
export async function retrieveRelevantChunks(query: string, limit = 5): Promise<string[]> {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  const db = await getDb();

  // Build OR LIKE conditions — one condition per keyword
  const likeConditions = keywords.map((kw) => like(ragChunks.content, `%${kw}%`));

  const rows = await db
    .select({ id: ragChunks.id, content: ragChunks.content })
    .from(ragChunks)
    .where(or(...likeConditions))
    .limit(limit * 2);

  // Deduplicate by id (or should already be unique) then pick top limit
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const row of rows) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      deduped.push(row.content);
      if (deduped.length >= limit) break;
    }
  }

  return deduped;
}

/**
 * Join chunk content strings into a formatted context block.
 * Returns "" if chunks array is empty.
 */
export function buildRagContext(chunks: string[]): string {
  if (chunks.length === 0) return "";
  return `## Referensi Knowledge Base:\n${chunks.join("\n---\n")}`;
}

/**
 * Get the system prompt from the active (is_default=1) persona.
 * Falls back to the static SYSTEM_PROMPT constant if no default persona exists.
 */
export async function getActivePersonaSystemPrompt(): Promise<string> {
  const db = await getDb();

  const rows = await db
    .select({ systemPrompt: aiAgentPersonas.systemPrompt })
    .from(aiAgentPersonas)
    .where(eq(aiAgentPersonas.isDefault, 1))
    .limit(1);

  if (rows.length > 0) {
    return rows[0].systemPrompt;
  }

  return SYSTEM_PROMPT;
}
