/**
 * Module: HPP Master Queries
 * Purpose: DB query functions for HPP master entries (marketplace IS NULL) and SKU aliases
 * Used by: src/app/api/hpp/master/route.ts, src/app/api/hpp/master/resolve/route.ts
 * Dependencies: drizzle-orm, src/lib/db/client, src/lib/db/schema
 * Public functions: listHppMaster(), replaceHppMaster(), getUnmatchedOrderSkus(),
 *                   listSkuAliases(), upsertSkuAlias()
 * Side effects: DB reads/writes to hpp_marketplace_entries (marketplace IS NULL), hpp_sku_aliases
 */

import { eq, and, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { hppMarketplaceEntries, hppSkuAliases, monthlyUploads } from "@/lib/db/schema";
import type { HppEntry } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTx = any;

function rowToHppEntry(row: typeof hppMarketplaceEntries.$inferSelect): HppEntry & { id: string } {
  return {
    id: row.id,
    sku: row.sku,
    productName: row.productName,
    masterProductName: row.masterProductName ?? undefined,
    masterSku: row.masterSku ?? undefined,
    cost: Number(row.cost),
  };
}

/** List all HPP master entries (marketplace IS NULL) for a user. */
export async function listHppMaster(userId: string): Promise<Array<HppEntry & { id: string }>> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(hppMarketplaceEntries)
    .where(and(eq(hppMarketplaceEntries.userId, userId), isNull(hppMarketplaceEntries.marketplace)));
  return rows.map(rowToHppEntry);
}

/** Replace all HPP master entries for a user (DELETE WHERE marketplace IS NULL, then bulk INSERT). */
export async function replaceHppMaster(
  userId: string,
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
      .where(and(eq(hppMarketplaceEntries.userId, userId), isNull(hppMarketplaceEntries.marketplace)));

    if (entries.length > 0) {
      await tx.insert(hppMarketplaceEntries).values(
        entries.map((e) => ({
          id: randomUUID(),
          userId,
          marketplace: null,
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

/**
 * Get all unique SKUs from a user's order history (monthly_uploads with fileType='order')
 * that do NOT have a matching master HPP entry or SKU alias.
 */
export async function getUnmatchedOrderSkus(
  userId: string,
  masterEntries: Array<HppEntry & { id: string }>
): Promise<string[]> {
  const db = await getDb();

  const uploads = await db
    .select({ parsedJson: monthlyUploads.parsedJson })
    .from(monthlyUploads)
    .where(and(eq(monthlyUploads.userId, userId), eq(monthlyUploads.fileType, "order")));

  const allOrderSkus = new Set<string>();
  for (const upload of uploads) {
    const rows = upload.parsedJson as Array<Record<string, unknown>>;
    for (const row of rows) {
      const sku = String(row.sku ?? row.sellerSku ?? row.SKU ?? "").trim();
      if (sku) allOrderSkus.add(sku);
    }
  }

  if (allOrderSkus.size === 0) return [];

  const aliases = await db
    .select({ orderSku: hppSkuAliases.orderSku })
    .from(hppSkuAliases)
    .where(eq(hppSkuAliases.userId, userId));
  const aliasedSkus = new Set(aliases.map((a: { orderSku: string }) => a.orderSku));

  const masterSkuSet = new Set<string>();
  for (const entry of masterEntries) {
    if (entry.sku) masterSkuSet.add(entry.sku.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase());
    if (entry.masterSku) masterSkuSet.add(entry.masterSku.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase());
  }

  return [...allOrderSkus].filter((sku) => {
    const normalized = sku.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
    return !masterSkuSet.has(normalized) && !aliasedSkus.has(sku);
  });
}

/** List all SKU aliases for a user as a map: orderSku → masterEntryId. */
export async function listSkuAliases(userId: string): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(hppSkuAliases)
    .where(eq(hppSkuAliases.userId, userId));
  return new Map(rows.map((r: { orderSku: string; masterEntryId: string }) => [r.orderSku, r.masterEntryId]));
}

/** Insert or update a SKU alias mapping. */
export async function upsertSkuAlias(
  userId: string,
  orderSku: string,
  masterEntryId: string
): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select({ id: hppSkuAliases.id })
    .from(hppSkuAliases)
    .where(and(eq(hppSkuAliases.userId, userId), eq(hppSkuAliases.orderSku, orderSku)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(hppSkuAliases)
      .set({ masterEntryId })
      .where(and(eq(hppSkuAliases.userId, userId), eq(hppSkuAliases.orderSku, orderSku)));
  } else {
    await db.insert(hppSkuAliases).values({
      id: randomUUID(),
      userId,
      orderSku,
      masterEntryId,
    });
  }
}
