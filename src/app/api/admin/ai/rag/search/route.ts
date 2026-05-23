/**
 * Module: RAG Search API
 * Purpose: GET — retrieve top 5 relevant chunks for a query string using keyword LIKE search
 * Used by: src/app/admin/ai/page.tsx (Knowledge Base tab search preview)
 * Dependencies: src/lib/auth/session, src/lib/ai/rag
 * Public functions: GET (?q=<query>)
 * Side effects: DB reads from rag_chunks
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { retrieveRelevantChunks } from "@/lib/ai/rag";

export async function GET(req: NextRequest) {
  try {
    await requireRole(["superadmin"]);

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

    if (!q) {
      return NextResponse.json({ chunks: [] });
    }

    const chunks = await retrieveRelevantChunks(q, 5);

    return NextResponse.json({ chunks });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/admin/ai/rag/search]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
