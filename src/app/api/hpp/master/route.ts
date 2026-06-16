/**
 * Module: HPP Master API — GET + POST
 * Purpose: List and import HPP master entries (marketplace-agnostic, marketplace IS NULL)
 * Used by: src/components/HppMasterManager.tsx, src/store/app-store.ts (loadHpp)
 * Dependencies: hppMaster queries, hppValidator, productMaster parser, requireSession
 * Public functions: GET (?page&limit&q), POST (multipart file import)
 * Side effects: DB reads/writes to hpp_marketplace_entries (marketplace IS NULL)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { listHppMaster, replaceHppMaster, getUnmatchedOrderSkus } from "@/lib/db/queries/hppMaster";
import { validateHppRows } from "@/lib/validation/hppValidator";
import { parseProductMasterFileWithMeta } from "@/lib/parsers/productMaster";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const q = (searchParams.get("q") ?? "").trim().toLowerCase();

    let entries = await listHppMaster(session.sub);

    if (q) {
      entries = entries.filter(
        (e) =>
          e.productName.toLowerCase().includes(q) ||
          e.sku.toLowerCase().includes(q) ||
          (e.masterSku ?? "").toLowerCase().includes(q)
      );
    }

    const total = entries.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const paginated = entries.slice((page - 1) * limit, page * limit);

    return NextResponse.json({ entries: paginated, total, page, totalPages });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/hpp/master]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const contentType = req.headers.get("content-type") ?? "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Content-Type harus multipart/form-data" }, { status: 415 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "file wajib diupload" }, { status: 400 });
    }

    const content = await file.arrayBuffer();
    const parseResult = parseProductMasterFileWithMeta(content);
    const validationResult = validateHppRows(
      parseResult.entries.map((e) => ({
        sku: e.sku ?? "",
        productName: e.productName,
        cost: e.cost,
        masterSku: e.masterSku,
        masterProductName: e.masterProductName,
      }))
    );

    if (validationResult.valid.length === 0) {
      return NextResponse.json(
        {
          error: "Tidak ada data valid untuk diimport",
          errors: [
            ...parseResult.duplicateLabels,
            ...validationResult.errors.map((err) => err.message),
          ],
        },
        { status: 422 }
      );
    }

    const inserted = await replaceHppMaster(
      session.sub,
      validationResult.valid.map((e) => ({ ...e, sourceFileName: file.name }))
    );

    const masterEntries = await listHppMaster(session.sub);
    const unmatchedOrderSkus = await getUnmatchedOrderSkus(session.sub, masterEntries);

    return NextResponse.json({
      inserted,
      warnings: [
        ...parseResult.duplicateLabels,
        ...validationResult.warnings.map((w) => w.message),
      ],
      errors: validationResult.errors.map((err) => err.message),
      unmatchedOrderSkus,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/hpp/master]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
