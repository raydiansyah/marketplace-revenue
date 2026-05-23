/**
 * Module: Create JWT Tables
 * Purpose: Idempotent migration — create refresh_tokens, access_token_blacklist, login_events with indexes
 * Used by: CLI one-shot (npx tsx scripts/create-jwt-tables.ts)
 * Dependencies: mysql2, dotenv
 * Side effects: CREATE TABLE IF NOT EXISTS; ADD INDEX if not exists
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function indexExists(
  conn: mysql.Connection,
  table: string,
  indexName: string
): Promise<boolean> {
  const [rows] = await conn.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return (rows[0].cnt as number) > 0;
}

async function addIndexIfMissing(
  conn: mysql.Connection,
  table: string,
  indexName: string,
  columnsSql: string
): Promise<void> {
  if (await indexExists(conn, table, indexName)) {
    console.log(`  index ${indexName} already exists — skip`);
    return;
  }
  await conn.execute(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${columnsSql})`);
  console.log(`  created index ${indexName}`);
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT ?? 4000),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log("Creating table: refresh_tokens");
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`refresh_tokens\` (
        \`id\`          VARCHAR(40)  NOT NULL PRIMARY KEY,
        \`user_id\`     VARCHAR(40)  NOT NULL,
        \`token_hash\`  VARCHAR(64)  NOT NULL,
        \`parent_id\`   VARCHAR(40)  NULL,
        \`expires_at\`  TIMESTAMP    NOT NULL,
        \`revoked_at\`  TIMESTAMP    NULL,
        \`user_agent\`  VARCHAR(255) NULL DEFAULT '',
        \`ip\`          VARCHAR(45)  NULL DEFAULT '',
        \`created_at\`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await addIndexIfMissing(conn, "refresh_tokens", "idx_rt_user", "`user_id`");
    await addIndexIfMissing(conn, "refresh_tokens", "idx_rt_token_hash", "`token_hash`");
    await addIndexIfMissing(conn, "refresh_tokens", "idx_rt_expires", "`expires_at`");

    console.log("Creating table: access_token_blacklist");
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`access_token_blacklist\` (
        \`jti\`         VARCHAR(40)  NOT NULL PRIMARY KEY,
        \`user_id\`     VARCHAR(40)  NOT NULL,
        \`expires_at\`  TIMESTAMP    NOT NULL,
        \`reason\`      VARCHAR(40)  NULL DEFAULT 'logout',
        \`created_at\`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await addIndexIfMissing(conn, "access_token_blacklist", "idx_blacklist_expires", "`expires_at`");

    console.log("Creating table: login_events");
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`login_events\` (
        \`id\`          VARCHAR(40)  NOT NULL PRIMARY KEY,
        \`user_id\`     VARCHAR(40)  NOT NULL,
        \`event\`       ENUM('login','logout','refresh','failure') NOT NULL,
        \`ip\`          VARCHAR(45)  NULL DEFAULT '',
        \`user_agent\`  VARCHAR(255) NULL DEFAULT '',
        \`created_at\`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await addIndexIfMissing(conn, "login_events", "idx_login_user_created", "`user_id`, `created_at`");

    console.log("Migration complete.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
