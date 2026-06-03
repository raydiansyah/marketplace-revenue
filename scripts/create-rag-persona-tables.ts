/**
 * Module: Create RAG + Persona Tables
 * Purpose: Idempotent migration — create ai_agent_personas, rag_documents, rag_chunks tables
 * Used by: CLI one-shot (npx tsx scripts/create-rag-persona-tables.ts)
 * Dependencies: mysql2, dotenv
 * Public functions: (IIFE)
 * Side effects: CREATE TABLE IF NOT EXISTS ai_agent_personas, rag_documents, rag_chunks; ADD INDEX if not exists
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

  // ─── ai_agent_personas ────────────────────────────────────────────────────────

  if (!(await tableExists(conn, "ai_agent_personas"))) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`ai_agent_personas\` (
        \`id\`            VARCHAR(40)                              NOT NULL PRIMARY KEY,
        \`name\`          VARCHAR(100)                             NOT NULL,
        \`description\`   VARCHAR(500)                             NULL,
        \`system_prompt\` TEXT                                     NOT NULL,
        \`tone\`          ENUM('formal','casual','expert','friendly') NOT NULL DEFAULT 'formal',
        \`is_default\`    TINYINT(1)                               NOT NULL DEFAULT 0,
        \`created_at\`    TIMESTAMP                                NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`    TIMESTAMP                                NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ Created table ai_agent_personas");
  } else {
    console.log("· ai_agent_personas already exists");
  }

  if (!(await indexExists(conn, "ai_agent_personas", "idx_persona_default"))) {
    await conn.execute(
      "ALTER TABLE `ai_agent_personas` ADD INDEX `idx_persona_default` (`is_default`)"
    );
    console.log("✓ Added index idx_persona_default on ai_agent_personas");
  } else {
    console.log("· idx_persona_default already exists");
  }

  // ─── rag_documents ────────────────────────────────────────────────────────────

  if (!(await tableExists(conn, "rag_documents"))) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`rag_documents\` (
        \`id\`          VARCHAR(40)  NOT NULL PRIMARY KEY,
        \`title\`       VARCHAR(255) NOT NULL,
        \`file_name\`   VARCHAR(255) NOT NULL,
        \`char_count\`  INT          NOT NULL DEFAULT 0,
        \`chunk_count\` INT          NOT NULL DEFAULT 0,
        \`uploaded_at\` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✓ Created table rag_documents");
  } else {
    console.log("· rag_documents already exists");
  }

  // ─── rag_chunks ───────────────────────────────────────────────────────────────

  if (!(await tableExists(conn, "rag_chunks"))) {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`rag_chunks\` (
        \`id\`           VARCHAR(40) NOT NULL PRIMARY KEY,
        \`document_id\`  VARCHAR(40) NOT NULL,
        \`chunk_index\`  INT         NOT NULL,
        \`content\`      TEXT        NOT NULL,
        INDEX \`idx_rag_chunks_doc\` (\`document_id\`)
      )
    `);
    console.log("✓ Created table rag_chunks");
  } else {
    console.log("· rag_chunks already exists");
  }

  if (!(await indexExists(conn, "rag_chunks", "idx_rag_chunks_doc"))) {
    await conn.execute(
      "ALTER TABLE `rag_chunks` ADD INDEX `idx_rag_chunks_doc` (`document_id`)"
    );
    console.log("✓ Added index idx_rag_chunks_doc on rag_chunks");
  } else {
    console.log("· idx_rag_chunks_doc already exists");
  }

  await conn.end();
  console.log("Migration selesai.");
  process.exit(0);
})();
