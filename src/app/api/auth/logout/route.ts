/**
 * Module: Logout API Route
 * Purpose: Revoke access + refresh tokens and clear auth cookies
 * Used by: POST /api/auth/logout (auth-protected)
 * Dependencies: jwt.ts, cookies.ts, blacklist.ts, audit.ts, refreshTokens table
 * Public functions: POST
 * Side effects:
 *   - DB write: access_token_blacklist (INSERT jti), refresh_tokens (UPDATE revoked_at), login_events (audit)
 *   - Clears marketplace-access, marketplace-refresh, marketplace-auth-token cookies
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { refreshTokens } from "@/lib/db/schema";
import { verifyAccessToken, verifyRefreshToken } from "@/lib/auth/jwt";
import { ACCESS_COOKIE, REFRESH_COOKIE, LEGACY_COOKIE, clearAuthCookies } from "@/lib/auth/cookies";
import { blacklistJti } from "@/lib/auth/blacklist";
import { logAuthEvent } from "@/lib/auth/audit";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const userAgent = req.headers.get("user-agent") ?? "";

  let userId = "unknown";

  // Try to blacklist the access token (best-effort, don't fail logout on DB errors)
  const rawAccessToken =
    req.cookies.get(ACCESS_COOKIE)?.value ??
    req.cookies.get(LEGACY_COOKIE)?.value;

  if (rawAccessToken) {
    try {
      const payload = await verifyAccessToken(rawAccessToken);
      userId = payload.sub;
      const expiresAt = new Date(
        // payload.exp is seconds since epoch
        (payload as unknown as { exp: number }).exp * 1000
      );
      await blacklistJti(payload.jti, payload.sub, expiresAt, "logout");
    } catch {
      // Token may be expired or malformed — proceed with logout anyway
    }
  }

  // Try to revoke the refresh token in DB (best-effort)
  const rawRefreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (rawRefreshToken) {
    try {
      const { jti } = await verifyRefreshToken(rawRefreshToken);
      const db = await getDb();
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.id, jti));
    } catch {
      // Ignore errors — token may be already expired or invalid
    }
  }

  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);

  // Audit — fire-and-forget
  logAuthEvent(userId, "logout", ip, userAgent).catch(console.error);

  return response;
}
