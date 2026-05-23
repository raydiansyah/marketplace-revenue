/**
 * Module: Create HPP Marketplace Table
 * Purpose: Idempotent migration — buat tabel hpp_marketplace_entries beserta indeksnya
 * Used by: CLI one-shot (npx tsx scripts/create-hpp-marketplace-table.ts)
 * Dependencies: mysql2, dotenv
 * Public functions: (IIFE)
 * Side effects: CREATE TABLE IF NOT EXISTS hpp_marketplace_entries, CREATE INDEX IF NOT EXISTS
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

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

  const T = "hpp_marketplace_entries";

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`${T}\` (
      \`id\` VARCHAR(40) NOT NULL PRIMARY KEY,
      \`user_id\` VARCHAR(40) NOT NULL,
      \`marketplace\` ENUM('shopee','tokopedia','lazada') NOT NULL,
      \`sku\` VARCHAR(191) NOT NULL DEFAULT '',
      \`product_name\` VARCHAR(500) NOT NULL,
      \`master_sku\` VARCHAR(191) NULL,
      \`master_product_name\` VARCHAR(500) NULL,
      \`cost\` DECIMAL(20,8) NOT NULL DEFAULT '0',
      \`source_file_name\` VARCHAR(255) NULL,
      \`uploaded_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log(`· Table ${T} ensured`);

  if (!(await indexExists(conn, T, "idx_hpp_mp_user_mp_sku"))) {
    await conn.execute(
      `ALTER TABLE \`${T}\` ADD INDEX \`idx_hpp_mp_user_mp_sku\` (\`user_id\`, \`marketplace\`, \`sku\`)`
    );
    console.log("✓ Added index idx_hpp_mp_user_mp_sku");
  } else {
    console.log("· idx_hpp_mp_user_mp_sku already exists");
  }

  if (!(await indexExists(conn, T, "idx_hpp_mp_user_master_sku"))) {
    await conn.execute(
      `ALTER TABLE \`${T}\` ADD INDEX \`idx_hpp_mp_user_master_sku\` (\`user_id\`, \`master_sku\`)`
    );
    console.log("✓ Added index idx_hpp_mp_user_master_sku");
  } else {
    console.log("· idx_hpp_mp_user_master_sku already exists");
  }

  await conn.end();
  console.log("Migration selesai.");
  process.exit(0);
})();
