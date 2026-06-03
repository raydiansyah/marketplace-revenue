/**
 * Module: RAG Document Upload API
 * Purpose: POST multipart — parse file, chunk text, store document + chunks in DB
 * Used by: src/app/admin/ai/page.tsx (Knowledge Base tab)
 * Dependencies: src/lib/auth/session, src/lib/db/client, src/lib/db/schema, src/lib/ai/chunker
 * Public functions: POST (FormData: file, title?)
 * Side effects: DB writes to rag_documents (1 row) + rag_chunks (N rows in batches of 50)
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { ragDocuments, ragChunks } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/session";
import { extractTextFromFile, chunkText } from "@/lib/ai/chunker";

const BATCH_SIZE = 50;

export async function POST(req: NextRequest) {
  try {
    await requireRole(["superadmin"]);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const titleInput = formData.get("title") as string | null;

    if (!file) {
      return NextResponse.json({ error: "File wajib diunggah" }, { status: 400 });
    }

    const fileName = file.name;
    const title = titleInput?.trim() || fileName;

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text
    let text: string;
    try {
      text = extractTextFromFile(buffer, fileName);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Gagal membaca file" },
        { status: 400 }
      );
    }

    // Chunk text
    const chunks = chunkText(text);
    const docId = randomUUID();
    const db = await getDb();

    // Insert document record
    await db.insert(ragDocuments).values({
      id: docId,
      title,
      fileName,
      charCount: text.length,
      chunkCount: chunks.length,
    });

    // Batch insert chunks in groups of 50
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE).map((content, offset) => ({
        id: randomUUID(),
        documentId: docId,
        chunkIndex: i + offset,
        content,
      }));
      await db.insert(ragChunks).values(batch);
    }

    return NextResponse.json(
      { id: docId, title, chunkCount: chunks.length },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/admin/ai/rag/upload]", e);
    return NextResponse.json({ error: "Server error saat upload" }, { status: 500 });
  }
}
