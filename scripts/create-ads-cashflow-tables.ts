/**
 * Module: Create Ads & Cashflow Tables
 * Purpose: Idempotent migration — create ads_entries and cashflow_entries tables with indexes
 * Used by: CLI one-shot (npx tsx scripts/create-ads-cashflow-tables.ts)
 * Dependencies: mysql2, dotenv
 * Side effects: CREATE TABLE IF NOT EXISTS ads_entries, cashflow_entries; ADD INDEX if not exists
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function tableExists(conn: mysql.Connection, table: string): Promise<boolean> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return (rows[0].cnt as number) > 0;
}

async function indexExists(conn: mysql.Connection, table: string, indexName: string): Promise<boolean> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return (rows[0].cnt as number) > 0;
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT ?? 4000),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });

  // ─── ads_entries ─────────────────────────────────────────────────────────────

  if (!(await tableExists(conn, "ads_entries"))) {
    await conn.execute(`
      CREATE TABLE \`ads_entries\` (
        \`id\`               VARCHAR(40)           NOT NULL PRIMARY KEY,
        \`user_id\`          VARCHAR(40)           NOT NULL,
        \`store_id\`         VARCHAR(40)           NOT NULL,
        \`marketplace\`      ENUM('shopee','tokopedia','lazada') NOT NULL,
        \`period_year\`      SMALLINT UNSIGNED     NOT NULL,
        \`period_month\`     TINYINT UNSIGNED      NOT NULL,
        \`campaign_name\`    VARCHAR(255)          NOT NULL DEFAULT '',
        \`sku\`              VARCHAR(191)          NULL DEFAULT '',
        \`spend\`            DECIMAL(20,8)         NOT NULL DEFAULT '0',
        \`impressions\`      INT UNSIGNED          NOT NULL DEFAULT 0,
        \`clicks\`           INT UNSIGNED          NOT NULL DEFAULT 0,
        \`conversions\`      INT UNSIGNED          NOT NULL DEFAULT 0,
        \`revenue\`          DECIMAL(20,8)         NOT NULL DEFAULT '0',
        \`source_file_name\` VARCHAR(255)          NULL DEFAULT '',
        \`created_at\`       TIMESTAMP             NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ Created table ads_entries");
  } else {
    console.log("· ads_entries already exists");
  }

  // ads_entries indexes
  const adsIndexes: Array<{ name: string; sql: string }> = [
    {
      name: "idx_ads_store_period",
      sql: "ALTER TABLE `ads_entries` ADD INDEX `idx_ads_store_period` (`store_id`, `period_year`, `period_month`)",
    },
    {
      name: "idx_ads_user_period",
      sql: "ALTER TABLE `ads_entries` ADD INDEX `idx_ads_user_period` (`user_id`, `period_year`, `period_month`)",
    },
    {
      name: "idx_ads_sku",
      sql: "ALTER TABLE `ads_entries` ADD INDEX `idx_ads_sku` (`user_id`, `sku`)",
    },
  ];

  for (const idx of adsIndexes) {
    if (!(await indexExists(conn, "ads_entries", idx.name))) {
      await conn.execute(idx.sql);
      console.log(`✓ Added index ${idx.name} on ads_entries`);
    } else {
      console.log(`· ${idx.name} already exists`);
    }
  }

  // ─── cashflow_entries ─────────────────────────────────────────────────────────

  if (!(await tableExists(conn, "cashflow_entries"))) {
    await conn.execute(`
      CREATE TABLE \`cashflow_entries\` (
        \`id\`               VARCHAR(40)           NOT NULL PRIMARY KEY,
        \`user_id\`          VARCHAR(40)           NOT NULL,
        \`store_id\`         VARCHAR(40)           NOT NULL,
        \`period_year\`      SMALLINT UNSIGNED     NOT NULL,
        \`period_month\`     TINYINT UNSIGNED      NOT NULL,
        \`category\`         ENUM('income','expense') NOT NULL,
        \`sub_category\`     VARCHAR(100)          NOT NULL DEFAULT '',
        \`amount\`           DECIMAL(20,8)         NOT NULL DEFAULT '0',
        \`description\`      VARCHAR(500)          NOT NULL DEFAULT '',
        \`txn_date\`         DATE                  NOT NULL,
        \`source_file_name\` VARCHAR(255)          NULL DEFAULT '',
        \`created_at\`       TIMESTAMP             NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ Created table cashflow_entries");
  } else {
    console.log("· cashflow_entries already exists");
  }

  // cashflow_entries indexes
  const cfIndexes: Array<{ name: string; sql: string }> = [
    {
      name: "idx_cf_store_period_cat",
      sql: "ALTER TABLE `cashflow_entries` ADD INDEX `idx_cf_store_period_cat` (`store_id`, `period_year`, `period_month`, `category`)",
    },
    {
      name: "idx_cf_user_date",
      sql: "ALTER TABLE `cashflow_entries` ADD INDEX `idx_cf_user_date` (`user_id`, `txn_date`)",
    },
  ];

  for (const idx of cfIndexes) {
    if (!(await indexExists(conn, "cashflow_entries", idx.name))) {
      await conn.execute(idx.sql);
      console.log(`✓ Added index ${idx.name} on cashflow_entries`);
    } else {
      console.log(`· ${idx.name} already exists`);
    }
  }

  await conn.end();
  console.log("Migration selesai.");
  process.exit(0);
})();
