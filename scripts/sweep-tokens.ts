/**
 * Module: Token Sweep Script
 * Purpose: Delete expired blacklist entries and expired+revoked refresh tokens
 * Used by: Cron job (e.g., daily via crontab or Vercel cron)
 * Dependencies: mysql2, dotenv
 * Side effects: DELETE rows from access_token_blacklist, refresh_tokens
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

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
    // Remove expired blacklist entries — safe to delete since expired tokens are
    // already invalid via JWT expiry check; DB entry is just belt-and-suspenders.
    const [blacklistResult] = await conn.execute<mysql.ResultSetHeader>(
      "DELETE FROM `access_token_blacklist` WHERE `expires_at` < NOW()"
    );
    console.log(`Deleted ${blacklistResult.affectedRows} expired blacklist entries`);

    // Remove refresh tokens that are both revoked AND expired (at least 1 day past expiry).
    // We keep a 1-day buffer before deleting revoked tokens for forensic purposes.
    const [revokedResult] = await conn.execute<mysql.ResultSetHeader>(
      `DELETE FROM \`refresh_tokens\`
       WHERE \`expires_at\` < DATE_SUB(NOW(), INTERVAL 1 DAY)
         AND \`revoked_at\` IS NOT NULL`
    );
    console.log(`Deleted ${revokedResult.affectedRows} revoked+expired refresh tokens`);

    // Remove un-revoked but expired refresh tokens (older than 1 day past expiry).
    // These can no longer be used due to JWT expiry, so no forensic value remains.
    const [expiredResult] = await conn.execute<mysql.ResultSetHeader>(
      `DELETE FROM \`refresh_tokens\`
       WHERE \`expires_at\` < DATE_SUB(NOW(), INTERVAL 1 DAY)
         AND \`revoked_at\` IS NULL`
    );
    console.log(`Deleted ${expiredResult.affectedRows} expired unrevoked refresh tokens`);

    console.log("Sweep complete.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Sweep failed:", err);
  process.exit(1);
});
