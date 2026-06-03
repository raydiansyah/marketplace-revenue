/**
 * Module: Create AI Tables
 * Purpose: Idempotent migration — create ai_providers and ai_request_logs tables with indexes
 * Used by: CLI one-shot (npx tsx scripts/create-ai-tables.ts)
 * Dependencies: mysql2, dotenv
 * Side effects: CREATE TABLE IF NOT EXISTS ai_providers, ai_request_logs; ADD INDEX if not exists
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

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT ?? 4000),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });

  // ─── ai_providers ─────────────────────────────────────────────────────────────

  if (!(await tableExists(conn, "ai_providers"))) {
    await conn.execute(`
      CREATE TABLE \`ai_providers\` (
        \`id\`                  VARCHAR(40)                   NOT NULL PRIMARY KEY,
        \`provider\`            ENUM('anthropic','openai')    NOT NULL,
        \`label\`               VARCHAR(100)                  NOT NULL,
        \`base_url\`            VARCHAR(255)                  NULL,
        \`encrypted_api_key\`   VARCHAR(2048)                 NOT NULL,
        \`default_model\`       VARCHAR(100)                  NULL,
        \`is_active\`           TINYINT                       NOT NULL DEFAULT 1,
        \`last_test_at\`        TIMESTAMP                     NULL,
        \`created_by_user_id\`  VARCHAR(40)                   NULL,
        \`created_at\`          TIMESTAMP                     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`          TIMESTAMP                     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ Created table ai_providers");
  } else {
    console.log("· ai_providers already exists");
  }

  // ai_providers indexes
  const providerIndexes: Array<{ name: string; unique: boolean; sql: string }> = [
    {
      name: "idx_ai_active",
      unique: false,
      sql: "ALTER TABLE `ai_providers` ADD INDEX `idx_ai_active` (`is_active`)",
    },
    {
      name: "uq_ai_provider_label",
      unique: true,
      sql: "ALTER TABLE `ai_providers` ADD UNIQUE INDEX `uq_ai_provider_label` (`provider`, `label`)",
    },
  ];

  for (const idx of providerIndexes) {
    if (!(await indexExists(conn, "ai_providers", idx.name))) {
      await conn.execute(idx.sql);
      console.log(`✓ Added index ${idx.name} on ai_providers`);
    } else {
      console.log(`· ${idx.name} already exists`);
    }
  }

  // ─── ai_request_logs ─────────────────────────────────────────────────────────

  if (!(await tableExists(conn, "ai_request_logs"))) {
    await conn.execute(`
      CREATE TABLE \`ai_request_logs\` (
        \`id\`                    VARCHAR(40)   NOT NULL PRIMARY KEY,
        \`user_id\`               VARCHAR(40)   NOT NULL,
        \`provider_id\`           VARCHAR(40)   NOT NULL,
        \`model\`                 VARCHAR(100)  NOT NULL,
        \`kind\`                  VARCHAR(40)   NOT NULL,
        \`prompt_summary\`        VARCHAR(500)  NULL DEFAULT '',
        \`tokens_in\`             INT UNSIGNED  NOT NULL DEFAULT 0,
        \`tokens_out\`            INT UNSIGNED  NOT NULL DEFAULT 0,
        \`cache_creation_tokens\` INT UNSIGNED  NOT NULL DEFAULT 0,
        \`cache_read_tokens\`     INT UNSIGNED  NOT NULL DEFAULT 0,
        \`duration_ms\`           INT UNSIGNED  NOT NULL DEFAULT 0,
        \`success\`               TINYINT       NOT NULL DEFAULT 1,
        \`error_message\`         VARCHAR(500)  NULL,
        \`created_at\`            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ Created table ai_request_logs");
  } else {
    console.log("· ai_request_logs already exists");
  }

  // ai_request_logs indexes
  const logIndexes: Array<{ name: string; sql: string }> = [
    {
      name: "idx_ai_logs_user_created",
      sql: "ALTER TABLE `ai_request_logs` ADD INDEX `idx_ai_logs_user_created` (`user_id`, `created_at`)",
    },
    {
      name: "idx_ai_logs_provider",
      sql: "ALTER TABLE `ai_request_logs` ADD INDEX `idx_ai_logs_provider` (`provider_id`)",
    },
  ];

  for (const idx of logIndexes) {
    if (!(await indexExists(conn, "ai_request_logs", idx.name))) {
      await conn.execute(idx.sql);
      console.log(`✓ Added index ${idx.name} on ai_request_logs`);
    } else {
      console.log(`· ${idx.name} already exists`);
    }
  }

  await conn.end();
  console.log("Migration selesai.");
  process.exit(0);
})();
