/**
 * Module: HPP Marketplace API — GET + POST
 * Purpose: List and upload/insert HPP entries per marketplace
 * Used by: src/components/HppManagerTabbed.tsx
 * Dependencies: hppMarketplace queries, hppValidator, productMaster parser, requireSession
 * Public functions: GET (?marketplace&page&limit&q), POST (multipart file or JSON single entry)
 * Side effects: DB reads/writes to hpp_marketplace_entries
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import {
  listHppMarketplace,
  replaceHppMarketplace,
  insertHppMarketplace,
} from "@/lib/db/queries/hppMarketplace";
import { validateHppRows } from "@/lib/validation/hppValidator";
import { parseProductMasterFileWithMeta } from "@/lib/parsers/productMaster";
import type { MarketplaceId } from "@/lib/types";

const VALID_MARKETPLACES: MarketplaceId[] = ["shopee", "tokopedia", "lazada"];

function isValidMarketplace(value: unknown): value is MarketplaceId {
  return typeof value === "string" && (VALID_MARKETPLACES as string[]).includes(value);
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const marketplace = searchParams.get("marketplace") ?? undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const q = (searchParams.get("q") ?? "").trim().toLowerCase();

    if (marketplace !== undefined && !isValidMarketplace(marketplace)) {
      return NextResponse.json({ error: "marketplace tidak valid" }, { status: 400 });
    }

    let entries = await listHppMarketplace(session.sub, isValidMarketplace(marketplace) ? marketplace : undefined);

    if (q) {
      entries = entries.filter(
        (e) =>
          e.productName.toLowerCase().includes(q) ||
          e.sku.toLowerCase().includes(q)
      );
    }

    const total = entries.length;
    const totalPages = Math.ceil(total / limit);
    const paginated = entries.slice((page - 1) * limit, page * limit);

    return NextResponse.json({ entries: paginated, total, page, totalPages });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/hpp/marketplace]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = await req.json() as { marketplace: unknown; entry: { sku?: string; productName?: string; cost?: unknown } };
      const { marketplace, entry } = body;

      if (!isValidMarketplace(marketplace)) {
        return NextResponse.json({ error: "marketplace tidak valid" }, { status: 400 });
      }
      if (!entry?.productName || typeof entry.productName !== "string") {
        return NextResponse.json({ error: "productName wajib diisi" }, { status: 422 });
      }
      const cost = Number(entry.cost ?? 0);
      if (Number.isNaN(cost) || cost < 0) {
        return NextResponse.json({ error: "HPP tidak valid" }, { status: 422 });
      }

      const inserted = await insertHppMarketplace(session.sub, marketplace, {
        sku: String(entry.sku ?? ""),
        productName: entry.productName,
        cost,
      });

      return NextResponse.json({ inserted: 1, entry: inserted }, { status: 201 });
    }

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const marketplaceRaw = form.get("marketplace");
      const file = form.get("file") as File | null;

      if (!isValidMarketplace(marketplaceRaw)) {
        return NextResponse.json({ error: "marketplace tidak valid" }, { status: 400 });
      }
      if (!file) {
        return NextResponse.json({ error: "file wajib diupload" }, { status: 400 });
      }

      const marketplace = marketplaceRaw as MarketplaceId;
      const content = await file.arrayBuffer();
      const parseResult = parseProductMasterFileWithMeta(content);
      const validationResult = validateHppRows(parseResult.entries.map((e) => ({
        sku: e.sku ?? "",
        productName: e.productName,
        cost: e.cost,
        masterSku: e.masterSku,
        masterProductName: e.masterProductName,
      })));

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

      const inserted = await replaceHppMarketplace(
        session.sub,
        marketplace,
        validationResult.valid.map((e) => ({ ...e, sourceFileName: file.name }))
      );

      return NextResponse.json({
        inserted,
        warnings: [
          ...parseResult.duplicateLabels,
          ...validationResult.warnings.map((w) => w.message),
        ],
        errors: validationResult.errors.map((err) => err.message),
      });
    }

    return NextResponse.json({ error: "Content-Type tidak didukung" }, { status: 415 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/hpp/marketplace]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
