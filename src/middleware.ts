/**
 * Module: Next.js Middleware
 * Purpose: JWT authentication gate for all protected routes + RBAC enforcement
 * Used by: Next.js runtime (runs on every matched request)
 * Dependencies: jwt.ts, cookies.ts, constants.ts
 * Public functions: middleware()
 * Side effects: Redirects unauthenticated requests; injects x-user-* headers for API routes
 * Phase 6: Tries marketplace-access first; falls back to legacy cookie within grace period
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ACCESS_COOKIE, LEGACY_COOKIE } from "@/lib/auth/cookies";

const PUBLIC_PATHS = ["/", "/login", "/forgot-password", "/reset-password"];
const PUBLIC_API_PATHS = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/refresh",
];
const SUPERADMIN_PATHS = ["/admin", "/api/admin"];
const FINANCE_BLOCKED_PATHS = ["/settings"];

/**
 * Grace period: accept legacy single-token cookie until this date.
 * After the date passes, only marketplace-access is accepted.
 * Set JWT_GRACE_UNTIL env (ISO string) to override; defaults to 2026-06-30.
 */
function isWithinGracePeriod(): boolean {
  const graceUntil = process.env.JWT_GRACE_UNTIL
    ? new Date(process.env.JWT_GRACE_UNTIL)
    : new Date("2026-06-30");
  return Date.now() < graceUntil.getTime();
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public")
  ) {
    return NextResponse.next();
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname === p)) return NextResponse.next();
  if (PUBLIC_API_PATHS.some((p) => pathname === p)) return NextResponse.next();

  // Try new access cookie first
  let payload = null;
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    try {
      payload = await verifyAccessToken(accessToken);
    } catch {
      // Invalid or expired access token — fall through to legacy check
    }
  }

  // Grace period fallback: accept legacy single-token cookie
  if (!payload && isWithinGracePeriod()) {
    const legacyToken = request.cookies.get(LEGACY_COOKIE)?.value;
    if (legacyToken) {
      try {
        payload = await verifyAccessToken(legacyToken);
      } catch {
        // Also invalid — proceed to redirect
      }
    }
  }

  if (!payload) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Superadmin-only paths — role from DB is authoritative; no email whitelist
  if (SUPERADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    if (payload.role !== "superadmin") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // Finance restrictions
  if (
    payload.role === "finance" &&
    FINANCE_BLOCKED_PATHS.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Inject user identity headers for API routes
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", payload.sub);
  requestHeaders.set("x-user-role", payload.role);
  requestHeaders.set("x-user-email", payload.email);
  requestHeaders.set("x-user-name", payload.name);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
