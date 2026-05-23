/**
 * Module: HPP Combined Loader
 * Purpose: Load HPP entries from hpp_marketplace_entries with fallback to legacy hpp_entries,
 *          and detect cost conflicts across marketplaces for the same SKU
 * Used by: src/app/api/reports/calculate/route.ts, src/app/api/hpp/combined/route.ts
 * Dependencies: drizzle-orm, src/lib/db/client, src/lib/db/schema
 * Public functions: loadCombinedHpp(), loadCombinedHppWithConflicts()
 * Side effects: DB reads from hpp_marketplace_entries and hpp_entries
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { hppMarketplaceEntries, hppEntries } from "@/lib/db/schema";
import type { HppMarketplaceEntryRow, HppEntryRow } from "@/lib/db/schema";
import type { HppEntry, HppConflict, MarketplaceId } from "@/lib/types";

export async function loadCombinedHpp(userId: string): Promise<HppEntry[]> {
  const db = await getDb();
  const mpRows = await db
    .select()
    .from(hppMarketplaceEntries)
    .where(eq(hppMarketplaceEntries.userId, userId));

  if (mpRows.length === 0) {
    const legacyRows = await db
      .select()
      .from(hppEntries)
      .where(eq(hppEntries.userId, userId));
    return (legacyRows as HppEntryRow[]).map((r) => ({
      sku: r.sku,
      productName: r.productName,
      masterProductName: r.masterProductName ?? undefined,
      masterSku: r.masterSku ?? undefined,
      cost: Number(r.cost),
    }));
  }

  const mpRowsTyped = mpRows as HppMarketplaceEntryRow[];
  const bySku = new Map<string, HppMarketplaceEntryRow>();
  for (const row of mpRowsTyped) {
    const existing = bySku.get(row.sku);
    if (!existing || row.uploadedAt > existing.uploadedAt) {
      bySku.set(row.sku, row);
    }
  }

  return Array.from(bySku.values()).map((r) => ({
    sku: r.sku,
    productName: r.productName,
    masterProductName: r.masterProductName ?? undefined,
    masterSku: r.masterSku ?? undefined,
    cost: Number(r.cost),
  }));
}

export async function loadCombinedHppWithConflicts(
  userId: string
): Promise<{ entries: HppEntry[]; conflicts: HppConflict[] }> {
  const db = await getDb();
  const mpRows = await db
    .select()
    .from(hppMarketplaceEntries)
    .where(eq(hppMarketplaceEntries.userId, userId));

  if (mpRows.length === 0) {
    const legacyRows = await db
      .select()
      .from(hppEntries)
      .where(eq(hppEntries.userId, userId));
    const entries: HppEntry[] = (legacyRows as HppEntryRow[]).map((r) => ({
      sku: r.sku,
      productName: r.productName,
      masterProductName: r.masterProductName ?? undefined,
      masterSku: r.masterSku ?? undefined,
      cost: Number(r.cost),
    }));
    return { entries, conflicts: [] };
  }

  const mpRowsTyped2 = mpRows as HppMarketplaceEntryRow[];
  const grouped = new Map<string, HppMarketplaceEntryRow[]>();
  for (const row of mpRowsTyped2) {
    const group = grouped.get(row.sku) ?? [];
    group.push(row);
    grouped.set(row.sku, group);
  }

  const entries: HppEntry[] = [];
  const conflicts: HppConflict[] = [];

  for (const [sku, rows] of grouped.entries()) {
    const latest = rows.reduce((a: HppMarketplaceEntryRow, b: HppMarketplaceEntryRow) => (a.uploadedAt > b.uploadedAt ? a : b));
    entries.push({
      sku,
      productName: latest.productName,
      masterProductName: latest.masterProductName ?? undefined,
      masterSku: latest.masterSku ?? undefined,
      cost: Number(latest.cost),
    });

    if (rows.length > 1) {
      const costs = new Set(rows.map((r: HppMarketplaceEntryRow) => Number(r.cost)));
      if (costs.size > 1) {
        conflicts.push({
          sku,
          entries: rows.map((r: HppMarketplaceEntryRow) => ({
            id: r.id,
            marketplace: r.marketplace as MarketplaceId,
            cost: Number(r.cost),
            productName: r.productName,
            uploadedAt: r.uploadedAt.toISOString(),
          })),
        });
      }
    }
  }

  return { entries, conflicts };
}
