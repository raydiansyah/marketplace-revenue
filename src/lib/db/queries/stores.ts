/**
 * Module: Stores Query Helpers
 * Purpose: CRUD operations for stores table (toko per marketplace per user)
 * Used by: /api/stores/*, /api/monthly-uploads/*
 * Dependencies: db client, drizzle-orm, stores schema
 * Public functions: getStores, getStoreById, createStore, updateStore, softDeleteStore
 * Side effects: reads/writes stores table in TiDB
 */

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../client";
import { stores } from "../schema";
import type { MarketplaceId, StoreSummary } from "@/lib/types";

/** SELECT all active stores for a user, optionally filtered by marketplace. */
export async function getStores(
  userId: string,
  marketplace?: MarketplaceId
): Promise<StoreSummary[]> {
  const db = await getDb();
  const conditions = [eq(stores.userId, userId), eq(stores.isActive, 1)];
  if (marketplace) {
    conditions.push(eq(stores.marketplace, marketplace));
  }
  const rows = await db
    .select()
    .from(stores)
    .where(and(...conditions))
    .orderBy(asc(stores.storeName));
  return rows.map(mapStoreRow);
}

/** SELECT a single store by id, scoped to userId for ownership check. */
export async function getStoreById(
  id: string,
  userId: string
): Promise<StoreSummary | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(stores)
    .where(and(eq(stores.id, id), eq(stores.userId, userId)))
    .limit(1);
  return rows.length > 0 ? mapStoreRow(rows[0]) : null;
}

/** INSERT a new store record. */
export async function createStore(data: {
  id: string;
  userId: string;
  marketplace: MarketplaceId;
  storeName: string;
  externalShopId?: string;
}): Promise<void> {
  const db = await getDb();
  await db.insert(stores).values({
    id: data.id,
    userId: data.userId,
    marketplace: data.marketplace,
    storeName: data.storeName,
    externalShopId: data.externalShopId ?? null,
    isActive: 1,
  });
}

/** UPDATE mutable fields on a store record scoped to userId. */
export async function updateStore(
  id: string,
  userId: string,
  data: {
    storeName?: string;
    externalShopId?: string;
    isActive?: number;
  }
): Promise<void> {
  if (Object.keys(data).length === 0) return;
  const db = await getDb();
  await db
    .update(stores)
    .set(data)
    .where(and(eq(stores.id, id), eq(stores.userId, userId)));
}

/** Soft-delete a store by setting isActive=0, scoped to userId. */
export async function softDeleteStore(
  id: string,
  userId: string
): Promise<void> {
  const db = await getDb();
  await db
    .update(stores)
    .set({ isActive: 0 })
    .where(and(eq(stores.id, id), eq(stores.userId, userId)));
}

// ---------------------------------------------------------------------------
// Internal mapper — converts raw DB row to StoreSummary (handles nullability)
// ---------------------------------------------------------------------------

function mapStoreRow(row: typeof stores.$inferSelect): StoreSummary {
  return {
    id: row.id,
    userId: row.userId,
    marketplace: row.marketplace as MarketplaceId,
    storeName: row.storeName,
    externalShopId: row.externalShopId ?? undefined,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
