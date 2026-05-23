/**
 * Module: AI Insights API
 * Purpose: Generate AI-powered revenue insights for a saved report (per-user, rate-limited)
 *          Injects active persona system prompt + RAG context into each AI call.
 * Used by: src/components/ai/AiInsightPanel.tsx
 * Dependencies: src/lib/auth/session, src/lib/db/schema, src/lib/ai/*, src/lib/rate-limiter
 * Public functions: POST ({ reportId, kind } → { markdown, model, tokensIn, tokensOut, cacheReadTokens })
 * Side effects: 1 AI API call, 1 DB read (saved_reports), 1 DB read (ai_agent_personas + rag_chunks), 1 DB write (ai_request_logs)
 *
 * Rate limit: 30 requests/hour per user
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { generateText } from "ai";
import { getDb } from "@/lib/db/client";
import { savedReports, aiRequestLogs } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { getActiveProvider } from "@/lib/ai/provider-factory";
import { summarizeReport } from "@/lib/ai/summarizeReport";
import { checkHourlyRateLimit } from "@/lib/rate-limiter";
import { getActivePersonaSystemPrompt, retrieveRelevantChunks, buildRagContext } from "@/lib/ai/rag";
import type { AiInsightKind } from "@/lib/types";
import { and, eq } from "drizzle-orm";

function buildPrompt(kind: AiInsightKind, summary: string): string {
  switch (kind) {
    case "revenue":
      return `Analisa laporan revenue berikut dan berikan 3-5 insight actionable:\n\n${summary}`;
    case "ads-roas":
      return `Berdasarkan data revenue ini, rekomendasikan alokasi anggaran iklan:\n\n${summary}`;
    case "fee-anomaly":
      return `Identifikasi fee anomali dan biaya platform yang tidak normal:\n\n${summary}`;
    case "hpp-margin":
      return `Identifikasi SKU dengan margin negatif atau sangat tipis dan berikan rekomendasi:\n\n${summary}`;
    default:
      return `Analisa laporan revenue berikut:\n\n${summary}`;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();

    // Rate limit: 30 requests per hour per user
    const allowed = checkHourlyRateLimit(`ai-insight:${session.sub}`, 30);
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit 30 permintaan/jam terlampaui" },
        { status: 429 }
      );
    }

    const body = (await req.json()) as { reportId: string; kind: AiInsightKind };
    const { reportId, kind } = body;

    if (!reportId || !kind) {
      return NextResponse.json(
        { error: "reportId dan kind wajib diisi" },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Fetch report — must belong to this user
    const reportRows = await db
      .select({ reportJson: savedReports.reportJson })
      .from(savedReports)
      .where(and(eq(savedReports.id, reportId), eq(savedReports.userId, session.sub)))
      .limit(1);

    if (reportRows.length === 0) {
      return NextResponse.json({ error: "Laporan tidak ditemukan" }, { status: 404 });
    }

    const reportJson = reportRows[0].reportJson;

    // Get active provider
    const provider = await getActiveProvider();
    if (!provider) {
      return NextResponse.json(
        { error: "AI belum dikonfigurasi. Hubungi superadmin." },
        { status: 503 }
      );
    }

    const reportSummary = summarizeReport(reportJson, kind);
    const prompt = buildPrompt(kind, reportSummary);

    // Load active persona + RAG context in parallel
    const [personaSystem, ragChunkTexts] = await Promise.all([
      getActivePersonaSystemPrompt(),
      retrieveRelevantChunks(reportSummary, 5),
    ]);

    const ragContext = buildRagContext(ragChunkTexts);
    const effectiveSystem = ragContext ? `${personaSystem}\n\n${ragContext}` : personaSystem;

    const logId = randomUUID();
    const startMs = Date.now();

    try {
      const result = await generateText({
        model: provider.modelInstance,
        system: effectiveSystem,
        prompt,
        maxOutputTokens: 1024,
      });

      const durationMs = Date.now() - startMs;
      const tokensIn = result.usage?.inputTokens ?? 0;
      const tokensOut = result.usage?.outputTokens ?? 0;

      // Log success
      await db.insert(aiRequestLogs).values({
        id: logId,
        userId: session.sub,
        providerId: provider.providerId,
        model: provider.model,
        kind,
        promptSummary: reportSummary.slice(0, 200),
        tokensIn,
        tokensOut,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        durationMs,
        success: 1,
      });

      return NextResponse.json({
        markdown: result.text,
        model: provider.model,
        tokensIn,
        tokensOut,
        cacheReadTokens: 0,
      });
    } catch (aiError) {
      const durationMs = Date.now() - startMs;
      const errorMessage =
        aiError instanceof Error ? aiError.message : "AI call failed";

      // Log failure
      await db.insert(aiRequestLogs).values({
        id: logId,
        userId: session.sub,
        providerId: provider.providerId,
        model: provider.model,
        kind,
        promptSummary: reportSummary.slice(0, 200),
        tokensIn: 0,
        tokensOut: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        durationMs,
        success: 0,
        errorMessage: errorMessage.slice(0, 500),
      });

      throw aiError;
    }
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/ai/insights]", e);
    return NextResponse.json({ error: "Server error saat memanggil AI" }, { status: 500 });
  }
}
