/**
 * Module: Auth Session Helper
 * Purpose: Read and validate current user session from cookies (server-side)
 * Used by: All API route handlers that need the authenticated user
 * Dependencies: jwt.ts, cookies.ts, blacklist.ts, next/headers
 * Public functions: getSession(), requireSession(), requireRole()
 * Side effects:
 *   - Reads cookies (next/headers)
 *   - DB read via isBlacklisted() when access token is present
 * Return type: JwtPayload { sub, email, role, name, jti, iat, exp }
 *   (unchanged from Phase 5 — all callers depend on this shape)
 * Phase 6: Reads marketplace-access first, falls back to legacy cookie within grace period
 */

import { cookies } from "next/headers";
import { verifyAccessToken, type JwtPayload, type Role } from "./jwt";
import { ACCESS_COOKIE, LEGACY_COOKIE } from "./cookies";
import { isBlacklisted } from "./blacklist";

/** Grace period end date — after this, legacy cookie is no longer accepted */
function isWithinGracePeriod(): boolean {
  const graceUntil = process.env.JWT_GRACE_UNTIL
    ? new Date(process.env.JWT_GRACE_UNTIL)
    : new Date("2026-06-30");
  return Date.now() < graceUntil.getTime();
}

export async function getSession(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();

  // Try new access cookie first
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    try {
      const payload = await verifyAccessToken(accessToken);
      // Blacklist check — in high-traffic scenarios back this with Redis
      if (await isBlacklisted(payload.jti)) {
        return null;
      }
      return payload as unknown as JwtPayload;
    } catch {
      // Expired or invalid — fall through to legacy
    }
  }

  // Grace period fallback: accept legacy cookie
  if (isWithinGracePeriod()) {
    const legacyToken = cookieStore.get(LEGACY_COOKIE)?.value;
    if (legacyToken) {
      try {
        const payload = await verifyAccessToken(legacyToken);
        return payload as unknown as JwtPayload;
      } catch {
        return null;
      }
    }
  }

  return null;
}

export async function requireSession(): Promise<JwtPayload> {
  const session = await getSession();
  if (!session) {
    throw Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

export async function requireRole(roles: Role[]): Promise<JwtPayload> {
  const session = await requireSession();
  if (!roles.includes(session.role)) {
    throw Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return session;
}
