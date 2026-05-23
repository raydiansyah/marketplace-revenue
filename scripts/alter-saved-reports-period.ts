/**
 * Module: Alter Saved Reports Period
 * Purpose: Idempotent migration — tambah kolom storeId, periodYear, periodMonth ke saved_reports
 * Used by: CLI one-shot (npx tsx scripts/alter-saved-reports-period.ts)
 * Dependencies: mysql2, dotenv
 * Side effects: ALTER TABLE saved_reports (ADD COLUMN jika belum ada, ADD INDEX jika belum ada)
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function columnExists(conn: mysql.Connection, table: string, column: string): Promise<boolean> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
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

  const T = "saved_reports";

  // ADD COLUMN store_id
  if (!(await columnExists(conn, T, "store_id"))) {
    await conn.execute(`ALTER TABLE \`${T}\` ADD COLUMN \`store_id\` VARCHAR(40) NULL`);
    console.log("✓ Added column store_id");
  } else {
    console.log("· store_id already exists");
  }

  // ADD COLUMN period_year
  if (!(await columnExists(conn, T, "period_year"))) {
    await conn.execute(`ALTER TABLE \`${T}\` ADD COLUMN \`period_year\` SMALLINT UNSIGNED NULL`);
    console.log("✓ Added column period_year");
  } else {
    console.log("· period_year already exists");
  }

  // ADD COLUMN period_month
  if (!(await columnExists(conn, T, "period_month"))) {
    await conn.execute(`ALTER TABLE \`${T}\` ADD COLUMN \`period_month\` TINYINT UNSIGNED NULL`);
    console.log("✓ Added column period_month");
  } else {
    console.log("· period_month already exists");
  }

  // ADD INDEX idx_sr_store_period
  if (!(await indexExists(conn, T, "idx_sr_store_period"))) {
    await conn.execute(
      `ALTER TABLE \`${T}\` ADD INDEX \`idx_sr_store_period\` (\`store_id\`, \`period_year\`, \`period_month\`)`
    );
    console.log("✓ Added index idx_sr_store_period");
  } else {
    console.log("· idx_sr_store_period already exists");
  }

  // ADD INDEX idx_sr_user_period
  if (!(await indexExists(conn, T, "idx_sr_user_period"))) {
    await conn.execute(
      `ALTER TABLE \`${T}\` ADD INDEX \`idx_sr_user_period\` (\`user_id\`, \`period_year\`, \`period_month\`)`
    );
    console.log("✓ Added index idx_sr_user_period");
  } else {
    console.log("· idx_sr_user_period already exists");
  }

  await conn.end();
  console.log("Migration selesai.");
  process.exit(0);
})();
