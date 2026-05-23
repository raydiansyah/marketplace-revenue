/**
 * Module: RAG Document API (Delete)
 * Purpose: DELETE a RAG document and all its associated chunks
 * Used by: src/app/admin/ai/page.tsx (Knowledge Base tab)
 * Dependencies: src/lib/auth/session, src/lib/db/client, src/lib/db/schema
 * Public functions: DELETE
 * Side effects: DB deletes from rag_chunks (cascaded by documentId) then rag_documents
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { ragDocuments, ragChunks } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["superadmin"]);

    const { id } = await params;
    const db = await getDb();

    // Delete chunks first to maintain referential integrity
    await db.delete(ragChunks).where(eq(ragChunks.documentId, id));
    await db.delete(ragDocuments).where(eq(ragDocuments.id, id));

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[DELETE /api/admin/ai/rag/[id]]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
