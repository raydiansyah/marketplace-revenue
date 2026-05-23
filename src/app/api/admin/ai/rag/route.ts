/**
 * Module: RAG Documents API (List)
 * Purpose: GET all RAG documents ordered by upload date descending
 * Used by: src/app/admin/ai/page.tsx (Knowledge Base tab)
 * Dependencies: src/lib/auth/session, src/lib/db/client, src/lib/db/schema
 * Public functions: GET
 * Side effects: DB read from rag_documents
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { ragDocuments } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    await requireRole(["superadmin"]);

    const db = await getDb();
    const documents = await db
      .select()
      .from(ragDocuments)
      .orderBy(desc(ragDocuments.uploadedAt));

    return NextResponse.json({ documents });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/admin/ai/rag]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
