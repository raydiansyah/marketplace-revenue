/**
 * Module: Access Token Blacklist
 * Purpose: Add/check access token JTIs in DB blacklist (used on logout + revocation)
 * Used by: logout route, session.ts (requireSession), /api/auth/refresh
 * Dependencies: accessTokenBlacklist table (schema.ts)
 * Public functions: blacklistJti(), isBlacklisted()
 * Side effects: DB read (isBlacklisted), DB write (blacklistJti)
 * Note: In high-traffic scenarios this should be backed by Redis for O(1) reads.
 *   Current DB-based implementation is correct but adds one query per protected request.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { accessTokenBlacklist } from "@/lib/db/schema";

/**
 * Add a JTI to the blacklist.
 * expiresAt is the token's own expiry — the sweep script removes entries after this date.
 */
export async function blacklistJti(
  jti: string,
  userId: string,
  expiresAt: Date,
  reason: string
): Promise<void> {
  const db = await getDb();
  await db.insert(accessTokenBlacklist).values({ jti, userId, expiresAt, reason });
}

/**
 * Returns true if the JTI has been blacklisted (token revoked).
 * A missing entry means the token is still valid.
 */
export async function isBlacklisted(jti: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ jti: accessTokenBlacklist.jti })
    .from(accessTokenBlacklist)
    .where(eq(accessTokenBlacklist.jti, jti))
    .limit(1);
  return row !== undefined;
}
