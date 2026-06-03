/**
 * Module: JWT Token Management
 * Purpose: Sign, verify, and manage access + refresh token pair
 * Used by: login route, middleware, /api/auth/refresh, session.ts
 * Dependencies: jose, crypto
 * Public functions: signAccessToken(), signRefreshToken(), verifyAccessToken(), verifyRefreshToken()
 * Backward-compat aliases: signJwt() → signAccessToken(), verifyJwt() → verifyAccessToken()
 * Side effects: None (pure crypto operations)
 */

import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";

const ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "change-me-in-prod"
);
const REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET ??
    (process.env.JWT_SECRET ?? "change-me-in-prod") + "-refresh"
);

export type Role = "superadmin" | "admin" | "finance";

/** Shape of the old single-token payload — kept for backward compat */
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  name: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  name: string;
  jti: string;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: "refresh";
}

// ---------------------------------------------------------------------------
// Access token — 30-minute lifetime
// ---------------------------------------------------------------------------

export async function signAccessToken(
  payload: Omit<AccessTokenPayload, "jti" | "type">
): Promise<{ token: string; jti: string }> {
  const jti = randomUUID();
  const token = await new SignJWT({ ...payload, jti, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(ACCESS_SECRET);
  return { token, jti };
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, ACCESS_SECRET);
  return payload as unknown as AccessTokenPayload;
}

// ---------------------------------------------------------------------------
// Refresh token — 7-day lifetime
// ---------------------------------------------------------------------------

export async function signRefreshToken(
  userId: string
): Promise<{ token: string; jti: string }> {
  const jti = randomUUID();
  const token = await new SignJWT({ sub: userId, jti, type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(REFRESH_SECRET);
  return { token, jti };
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, REFRESH_SECRET);
  return payload as unknown as RefreshTokenPayload;
}

// ---------------------------------------------------------------------------
// Backward-compat shims (callers that used signJwt/verifyJwt)
// signJwt previously issued a 7-day token; now issues a 30-minute access token.
// Existing callers (login route) are updated to use signAccessToken directly.
// ---------------------------------------------------------------------------

/** @deprecated Use signAccessToken() instead */
export async function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp" | "jti">
): Promise<string> {
  const { token } = await signAccessToken(payload);
  return token;
}

/** @deprecated Use verifyAccessToken() instead — returns null on failure for compat */
export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  try {
    return await verifyAccessToken(token) as unknown as JwtPayload;
  } catch {
    return null;
  }
}
