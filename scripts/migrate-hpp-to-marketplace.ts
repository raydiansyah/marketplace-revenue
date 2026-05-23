/**
 * Module: Migrate HPP to Marketplace
 * Purpose: Idempotent migration — salin hpp_entries ke hpp_marketplace_entries dengan marketplace='shopee'
 *          Lewati user yang sudah punya data di hpp_marketplace_entries
 * Used by: CLI one-shot (npx tsx scripts/migrate-hpp-to-marketplace.ts)
 * Dependencies: drizzle-orm, mysql2, dotenv, src/lib/db/schema
 * Public functions: (IIFE)
 * Side effects: INSERT ke hpp_marketplace_entries (hanya jika belum ada data per userId)
 */

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import { hppEntries, hppMarketplaceEntries } from "../src/lib/db/schema";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

(async () => {
  const pool = await mysql.createPool({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT ?? 4000),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });

  const db = drizzle(pool, { schema, mode: "default" });

  const legacyRows = await db.select().from(hppEntries);
  if (legacyRows.length === 0) {
    console.log("· Tidak ada data di hpp_entries. Selesai.");
    await pool.end();
    process.exit(0);
  }

  const userIds = [...new Set(legacyRows.map((r) => r.userId))];
  let migratedUsers = 0;
  let skippedUsers = 0;

  for (const userId of userIds) {
    const existing = await db
      .select({ id: hppMarketplaceEntries.id })
      .from(hppMarketplaceEntries)
      .where(eq(hppMarketplaceEntries.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      console.log(`· Lewati user ${userId} — sudah punya data di hpp_marketplace_entries`);
      skippedUsers++;
      continue;
    }

    const userRows = legacyRows.filter((r) => r.userId === userId);
    await db.insert(hppMarketplaceEntries).values(
      userRows.map((r) => ({
        id: randomUUID(),
        userId: r.userId,
        marketplace: "shopee" as const,
        sku: r.sku ?? "",
        productName: r.productName,
        masterSku: r.masterSku ?? null,
        masterProductName: r.masterProductName ?? null,
        cost: r.cost,
        sourceFileName: null,
      }))
    );
    console.log(`✓ Migrated ${userRows.length} baris untuk user ${userId} → shopee`);
    migratedUsers++;
  }

  console.log(`\nRingkasan: ${migratedUsers} user dimigrasi, ${skippedUsers} user dilewati.`);
  console.log("Migration selesai.");
  await pool.end();
  process.exit(0);
})();
