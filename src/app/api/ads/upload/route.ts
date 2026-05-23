/**
 * Module: Ads Upload API route
 * Purpose: Accept multipart upload of ads campaign file, parse and batch-INSERT into ads_entries
 * Used by: /ads page (upload form)
 * Dependencies: auth/session, db/schema (adsEntries), ads parsers, getStoreById
 * Public functions: POST /api/ads/upload
 * Side effects: writes to ads_entries table in TiDB
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { adsEntries } from "@/lib/db/schema";
import { getStoreById } from "@/lib/db/queries/stores";
import { parseAdsShopee } from "@/lib/parsers/ads/shopee";
import { parseAdsTokopedia } from "@/lib/parsers/ads/tokopedia";
import { parseAdsLazada } from "@/lib/parsers/ads/lazada";
import { parseAdsGeneric } from "@/lib/parsers/ads/generic";
import type { NewAdsEntryRow } from "@/lib/db/schema";
import type { MarketplaceId } from "@/lib/types";
import type { ParsedAdsRow } from "@/lib/parsers/ads/generic";

type MarketplaceParser = (content: string | ArrayBuffer) => ParsedAdsRow[];

const PARSERS: Record<MarketplaceId, MarketplaceParser> = {
  shopee: parseAdsShopee,
  tokopedia: parseAdsTokopedia,
  lazada: parseAdsLazada,
};

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();

    const formData = await req.formData();
    const storeId = formData.get("storeId");
    const marketplace = formData.get("marketplace");
    const periodYearRaw = formData.get("periodYear");
    const periodMonthRaw = formData.get("periodMonth");
    const file = formData.get("file");

    // Validate required fields
    if (typeof storeId !== "string" || !storeId.trim()) {
      return NextResponse.json({ error: "storeId wajib diisi" }, { status: 400 });
    }
    if (typeof marketplace !== "string" || !["shopee", "tokopedia", "lazada"].includes(marketplace)) {
      return NextResponse.json({ error: "marketplace tidak valid" }, { status: 400 });
    }
    const periodYear = parseInt(String(periodYearRaw ?? ""), 10);
    const periodMonth = parseInt(String(periodMonthRaw ?? ""), 10);
    if (isNaN(periodYear) || isNaN(periodMonth) || periodMonth < 1 || periodMonth > 12) {
      return NextResponse.json({ error: "periodYear dan periodMonth wajib diisi dan valid" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file wajib diupload" }, { status: 400 });
    }

    // Ownership check
    const store = await getStoreById(storeId.trim(), session.sub);
    if (!store) {
      return NextResponse.json({ error: "Toko tidak ditemukan atau akses ditolak" }, { status: 404 });
    }

    const buffer = await file.arrayBuffer();
    const parser: MarketplaceParser = PARSERS[marketplace as MarketplaceId] ?? parseAdsGeneric;
    const parsed = parser(buffer);

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada baris data iklan yang berhasil diparsing dari file ini" },
        { status: 422 }
      );
    }

    const db = await getDb();

    // Batch INSERT — append (not replace), chunk to avoid oversized queries
    const CHUNK_SIZE = 200;
    let inserted = 0;

    for (let i = 0; i < parsed.length; i += CHUNK_SIZE) {
      const chunk = parsed.slice(i, i + CHUNK_SIZE);
      const values: NewAdsEntryRow[] = chunk.map((row) => ({
        id: randomUUID(),
        userId: session.sub,
        storeId: storeId.trim(),
        marketplace: marketplace as MarketplaceId,
        periodYear,
        periodMonth,
        campaignName: row.campaignName,
        sku: row.sku || null,
        spend: String(row.spend),
        impressions: row.impressions,
        clicks: row.clicks,
        conversions: row.conversions,
        revenue: String(row.revenue),
        sourceFileName: file.name,
        createdAt: new Date(),
      }));
      await db.insert(adsEntries).values(values);
      inserted += chunk.length;
    }

    return NextResponse.json({ inserted });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/ads/upload]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
