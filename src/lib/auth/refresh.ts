/**
 * Module: Refresh Token Rotation
 * Purpose: Validate refresh token from DB, revoke old, issue new access+refresh pair
 * Used by: /api/auth/refresh
 * Dependencies: jwt.ts, refreshTokens table (schema.ts), crypto
 * Public functions: rotateRefreshToken()
 * Side effects: DB write — UPDATE refresh_tokens (revoke old), INSERT refresh_tokens (new)
 */

import { createHash, randomUUID } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { refreshTokens } from "@/lib/db/schema";
import {
  verifyRefreshToken,
  signAccessToken,
  signRefreshToken,
  type AccessTokenPayload,
} from "./jwt";

export interface RotateResult {
  accessToken: string;
  accessJti: string;
  refreshToken: string;
  refreshJti: string;
  userId: string;
}

/** SHA-256 hex digest of the raw token string */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * rotateRefreshToken
 *
 * 1. Verify JWT signature
 * 2. Look up token by hash in DB
 * 3. Detect reuse (revokedAt IS NOT NULL → compromised token chain)
 * 4. Revoke old token
 * 5. Issue new access + refresh pair
 * 6. Persist new refresh token row with parentId pointing to revoked token
 */
export async function rotateRefreshToken(
  rawRefreshToken: string,
  userPayload: Pick<AccessTokenPayload, "email" | "role" | "name">
): Promise<RotateResult> {
  // Step 1 — verify JWT signature and extract claims
  const { sub: userId, jti } = await verifyRefreshToken(rawRefreshToken);

  // Step 2 — look up by hash (never store raw token in DB)
  const tokenHash = hashToken(rawRefreshToken);
  const db = await getDb();

  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, tokenHash), eq(refreshTokens.userId, userId)))
    .limit(1);

  if (!row) {
    throw new Error("Refresh token tidak valid");
  }

  // Step 3 — reuse detection
  if (row.revokedAt !== null) {
    throw new Error("Refresh token sudah digunakan. Login ulang diperlukan.");
  }

  // Step 4 — check expiry (belt-and-suspenders; jose already checks this)
  if (row.expiresAt < new Date()) {
    throw new Error("Refresh token kedaluwarsa");
  }

  // Step 5 — revoke old token
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, row.id));

  // Step 6 — issue new pair
  const { token: accessToken, jti: accessJti } = await signAccessToken({
    sub: userId,
    email: userPayload.email,
    role: userPayload.role,
    name: userPayload.name,
  });
  const { token: newRefreshToken, jti: refreshJti } = await signRefreshToken(userId);

  // Persist new refresh token
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(refreshTokens).values({
    id: refreshJti,
    userId,
    tokenHash: hashToken(newRefreshToken),
    parentId: jti,
    expiresAt: newExpiresAt,
    userAgent: row.userAgent ?? "",
    ip: row.ip ?? "",
  });

  return { accessToken, accessJti, refreshToken: newRefreshToken, refreshJti, userId };
}
