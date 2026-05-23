/**
 * Module: Auth Cookie Configuration
 * Purpose: Cookie names, options, and set/clear helpers for access + refresh tokens
 * Used by: login route, logout route, middleware, /api/auth/refresh
 * Dependencies: next/server (NextResponse)
 * Public functions: ACCESS_COOKIE, REFRESH_COOKIE, LEGACY_COOKIE, COOKIE_NAME,
 *   getAccessCookieOptions(), getRefreshCookieOptions(), setAuthCookies(), clearAuthCookies()
 * Side effects: Sets/clears HTTP cookies on NextResponse instances
 */

import type { NextResponse } from "next/server";

// New split-cookie names (Phase 6)
export const ACCESS_COOKIE = "marketplace-access";
export const REFRESH_COOKIE = "marketplace-refresh";

// Grace period: old single-token cookie — accepted until JWT_GRACE_UNTIL env date
export const LEGACY_COOKIE = "marketplace-auth-token";

// Alias kept for any callers that still import COOKIE_NAME
export const COOKIE_NAME = LEGACY_COOKIE;

type CookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  path: string;
  maxAge: number;
};

const isProd = process.env.NODE_ENV === "production";

export function getAccessCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/",
    maxAge: 30 * 60, // 30 minutes
  };
}

export function getRefreshCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/api/auth", // restrict to auth endpoints only
    maxAge: 7 * 24 * 60 * 60, // 7 days
  };
}

/** @deprecated Use getAccessCookieOptions() — kept for legacy callers */
export function getCookieOptions(): CookieOptions {
  return getAccessCookieOptions();
}

/** Set access + refresh cookies on a NextResponse */
export function setAuthCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string
): void {
  res.cookies.set(ACCESS_COOKIE, accessToken, getAccessCookieOptions());
  res.cookies.set(REFRESH_COOKIE, refreshToken, getRefreshCookieOptions());
}

/** Clear access + refresh + legacy cookies on a NextResponse */
export function clearAuthCookies(res: NextResponse): void {
  res.cookies.delete(ACCESS_COOKIE);
  // delete() doesn't respect path, so explicitly set with path to expire
  res.cookies.set(REFRESH_COOKIE, "", { ...getRefreshCookieOptions(), maxAge: 0 });
  res.cookies.delete(LEGACY_COOKIE);
}
