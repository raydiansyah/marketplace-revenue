/**
 * Module: HPP Marketplace Queries
 * Purpose: DB query functions for hpp_marketplace_entries table (legacy per-marketplace entries)
 * Used by: src/app/api/hpp/marketplace/route.ts, src/app/api/hpp/marketplace/[id]/route.ts, src/lib/hpp/combined.ts
 * Dependencies: drizzle-orm, src/lib/db/client, src/lib/db/schema
 * Public functions: listHppMarketplace(), getHppMarketplaceById(), replaceHppMarketplace(),
 *                   insertHppMarketplace(), updateHppMarketplace(), deleteHppMarketplace()
 * Side effects: DB reads/writes to hpp_marketplace_entries
 * Note: marketplace column is now nullable (NULL = global master). rowToEntry fallback: null → "shopee"
 */

import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { hppMarketplaceEntries } from "@/lib/db/schema";
import type { HppMarketplaceEntry, MarketplaceId } from "@/lib/types";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = any;

function rowToEntry(row: typeof hppMarketplaceEntries.$inferSelect): HppMarketplaceEntry {
  return {
    id: row.id,
    userId: row.userId,
    marketplace: (row.marketplace ?? "shopee") as MarketplaceId,
    sku: row.sku,
    productName: row.productName,
    masterSku: row.masterSku ?? undefined,
    masterProductName: row.masterProductName ?? undefined,
    cost: Number(row.cost),
    sourceFileName: row.sourceFileName ?? undefined,
    uploadedAt: row.uploadedAt.toISOString(),
  };
}

export async function listHppMarketplace(
  userId: string,
  marketplace?: MarketplaceId
): Promise<HppMarketplaceEntry[]> {
  const db = await getDb();
  const condition = marketplace
    ? and(eq(hppMarketplaceEntries.userId, userId), eq(hppMarketplaceEntries.marketplace, marketplace))
    : eq(hppMarketplaceEntries.userId, userId);
  const rows = await db.select().from(hppMarketplaceEntries).where(condition);
  return rows.map(rowToEntry);
}

export async function getHppMarketplaceById(
  id: string,
  userId: string
): Promise<HppMarketplaceEntry | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(hppMarketplaceEntries)
    .where(and(eq(hppMarketplaceEntries.id, id), eq(hppMarketplaceEntries.userId, userId)))
    .limit(1);
  return rows.length > 0 ? rowToEntry(rows[0]) : null;
}

export async function replaceHppMarketplace(
  userId: string,
  marketplace: MarketplaceId,
  entries: Array<{
    sku: string;
    productName: string;
    cost: number;
    masterSku?: string;
    masterProductName?: string;
    sourceFileName?: string;
  }>
): Promise<number> {
  const db = await getDb();
  await db.transaction(async (tx: AnyTx) => {
    await tx
      .delete(hppMarketplaceEntries)
      .where(
        and(
          eq(hppMarketplaceEntries.userId, userId),
          eq(hppMarketplaceEntries.marketplace, marketplace)
        )
      );

    if (entries.length > 0) {
      await tx.insert(hppMarketplaceEntries).values(
        entries.map((e) => ({
          id: randomUUID(),
          userId,
          marketplace,
          sku: e.sku ?? "",
          productName: e.productName,
          masterSku: e.masterSku ?? null,
          masterProductName: e.masterProductName ?? null,
          cost: String(e.cost),
          sourceFileName: e.sourceFileName ?? null,
        }))
      );
    }
  });
  return entries.length;
}

export async function insertHppMarketplace(
  userId: string,
  marketplace: MarketplaceId,
  entry: { sku: string; productName: string; cost: number; masterSku?: string; masterProductName?: string }
): Promise<HppMarketplaceEntry> {
  const db = await getDb();
  const id = randomUUID();
  await db.insert(hppMarketplaceEntries).values({
    id,
    userId,
    marketplace,
    sku: entry.sku ?? "",
    productName: entry.productName,
    masterSku: entry.masterSku ?? null,
    masterProductName: entry.masterProductName ?? null,
    cost: String(entry.cost),
    sourceFileName: null,
  });
  const rows = await db
    .select()
    .from(hppMarketplaceEntries)
    .where(eq(hppMarketplaceEntries.id, id))
    .limit(1);
  return rowToEntry(rows[0]);
}

export async function updateHppMarketplace(
  id: string,
  userId: string,
  patch: { cost?: number; sku?: string; productName?: string }
): Promise<boolean> {
  const db = await getDb();
  const updateValues: Record<string, unknown> = {};
  if (patch.cost !== undefined) updateValues.cost = String(patch.cost);
  if (patch.sku !== undefined) updateValues.sku = patch.sku;
  if (patch.productName !== undefined) updateValues.productName = patch.productName;

  if (Object.keys(updateValues).length === 0) return true;

  const result = await db
    .update(hppMarketplaceEntries)
    .set(updateValues)
    .where(and(eq(hppMarketplaceEntries.id, id), eq(hppMarketplaceEntries.userId, userId)));

  return (result[0] as { affectedRows: number }).affectedRows > 0;
}

export async function deleteHppMarketplace(id: string, userId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db
    .delete(hppMarketplaceEntries)
    .where(and(eq(hppMarketplaceEntries.id, id), eq(hppMarketplaceEntries.userId, userId)));
  return (result[0] as { affectedRows: number }).affectedRows > 0;
}
