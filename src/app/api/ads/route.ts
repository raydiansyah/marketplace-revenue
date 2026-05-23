/**
 * Module: Ads API — collection GET route
 * Purpose: Retrieve ads entries and summary for a user, filtered by storeId/year/month
 * Used by: /ads page
 * Dependencies: auth/session, db/schema (adsEntries), drizzle-orm
 * Public functions: GET /api/ads
 * Side effects: reads ads_entries table in TiDB
 */

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { adsEntries, type AdsEntryRow } from "@/lib/db/schema";
import type { AdsEntry, AdsSummary } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);

    const storeId = searchParams.get("storeId");
    const yearStr = searchParams.get("year");
    const monthStr = searchParams.get("month");

    const db = await getDb();

    // Build WHERE conditions — always scope to userId for security
    const conditions = [eq(adsEntries.userId, session.sub)];
    if (storeId) conditions.push(eq(adsEntries.storeId, storeId));
    if (yearStr) {
      const year = parseInt(yearStr, 10);
      if (!isNaN(year)) conditions.push(eq(adsEntries.periodYear, year));
    }
    if (monthStr) {
      const month = parseInt(monthStr, 10);
      if (!isNaN(month)) conditions.push(eq(adsEntries.periodMonth, month));
    }

    const rows = await db
      .select()
      .from(adsEntries)
      .where(and(...conditions));

    const entries: AdsEntry[] = rows.map((r: AdsEntryRow) => ({
      id: r.id,
      storeId: r.storeId,
      marketplace: r.marketplace,
      periodYear: r.periodYear,
      periodMonth: r.periodMonth,
      campaignName: r.campaignName,
      sku: r.sku ?? undefined,
      spend: Number(r.spend),
      impressions: r.impressions,
      clicks: r.clicks,
      conversions: r.conversions,
      revenue: Number(r.revenue),
      sourceFileName: r.sourceFileName ?? undefined,
      createdAt: r.createdAt.toISOString(),
    }));

    const summary: AdsSummary = entries.reduce(
      (acc, e) => {
        acc.totalSpend += e.spend;
        acc.totalRevenue += e.revenue;
        acc.totalImpressions += e.impressions;
        acc.totalClicks += e.clicks;
        acc.totalConversions += e.conversions;
        return acc;
      },
      {
        totalSpend: 0,
        totalRevenue: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalConversions: 0,
        roas: 0,
        cpa: 0,
      } satisfies AdsSummary
    );

    summary.roas = summary.totalSpend > 0 ? summary.totalRevenue / summary.totalSpend : 0;
    summary.cpa = summary.totalConversions > 0 ? summary.totalSpend / summary.totalConversions : 0;

    return NextResponse.json({ entries, summary });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/ads]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
