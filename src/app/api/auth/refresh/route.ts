/**
 * Module: Token Refresh Endpoint
 * Purpose: Validate refresh cookie and issue new access+refresh pair via rotation
 * Used by: Client-side silent refresh (called before access token expires)
 * Dependencies: refresh.ts, cookies.ts, audit.ts, users table
 * Public functions: POST
 * Side effects:
 *   - DB read: users (fetch email/role/name for new access token), refresh_tokens
 *   - DB write: refresh_tokens (revoke old, insert new), login_events (audit)
 *   - Sets new marketplace-access + marketplace-refresh cookies
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { verifyRefreshToken } from "@/lib/auth/jwt";
import {
  REFRESH_COOKIE,
  LEGACY_COOKIE,
  getAccessCookieOptions,
  setAuthCookies,
} from "@/lib/auth/cookies";
import { rotateRefreshToken } from "@/lib/auth/refresh";
import { logAuthEvent } from "@/lib/auth/audit";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const userAgent = req.headers.get("user-agent") ?? "";

  // Read refresh token from cookie
  const rawRefreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!rawRefreshToken) {
    return NextResponse.json({ error: "Refresh token tidak ditemukan" }, { status: 401 });
  }

  try {
    // Peek at JWT to get userId without hitting DB yet
    const { sub: userId } = await verifyRefreshToken(rawRefreshToken);

    // Fetch user to populate the new access token payload
    const db = await getDb();
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        name: users.name,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan" }, { status: 401 });
    }

    // Rotate: revoke old, issue new pair
    const { accessToken, refreshToken } = await rotateRefreshToken(rawRefreshToken, {
      email: user.email,
      role: user.role,
      name: user.name,
    });

    const response = NextResponse.json({ ok: true });

    // Set new cookies
    setAuthCookies(response, accessToken, refreshToken);

    // Grace period: also refresh legacy cookie if it was present in the request
    if (req.cookies.get(LEGACY_COOKIE)?.value) {
      response.cookies.set(LEGACY_COOKIE, accessToken, getAccessCookieOptions());
    }

    // Audit — fire-and-forget
    logAuthEvent(userId, "refresh", ip, userAgent).catch(console.error);

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token tidak valid";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
