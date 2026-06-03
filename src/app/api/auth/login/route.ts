/**
 * Module: Login API Route
 * Purpose: Authenticate user credentials, issue access + refresh token pair
 * Used by: POST /api/auth/login (public)
 * Dependencies: bcryptjs, drizzle ORM, jwt.ts, cookies.ts, audit.ts, refreshTokens table
 * Public functions: POST
 * Side effects:
 *   - DB read: users (credential lookup)
 *   - DB write: refresh_tokens (INSERT new token row), login_events (audit)
 *   - Sets marketplace-access, marketplace-refresh, marketplace-auth-token (grace) cookies
 */

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users, refreshTokens } from "@/lib/db/schema";
import { signAccessToken, signRefreshToken } from "@/lib/auth/jwt";
import {
  ACCESS_COOKIE,
  LEGACY_COOKIE,
  getAccessCookieOptions,
  setAuthCookies,
} from "@/lib/auth/cookies";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limiter";
import { isCanonicalSuperadminEmail, normalizeEmail } from "@/lib/auth/constants";
import { logAuthEvent } from "@/lib/auth/audit";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting — 5 percobaan per IP per 15 menit
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const userAgent = req.headers.get("user-agent") ?? "";

    const { allowed, retryAfterMs } = checkRateLimit(`login:${ip}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan. Coba lagi dalam beberapa menit." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
        }
      );
    }

    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email dan password wajib diisi" },
        { status: 400 }
      );
    }

    // Guard panjang password (bcrypt truncates at 72 bytes — input sangat panjang bisa DoS)
    if (password.length > 128) {
      return NextResponse.json(
        { error: "Email atau password salah" },
        { status: 401 }
      );
    }

    const db = await getDb();
    const normalizedEmail = normalizeEmail(email);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.email})`, normalizedEmail))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: "Email atau password salah" },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      logAuthEvent(user.id, "failure", ip, userAgent).catch(console.error);
      return NextResponse.json(
        { error: "Email atau password salah" },
        { status: 401 }
      );
    }

    // Hanya satu akun yang boleh menjadi superadmin
    if (user.role === "superadmin" && !isCanonicalSuperadminEmail(user.email)) {
      return NextResponse.json(
        { error: "Akun superadmin tidak valid" },
        { status: 403 }
      );
    }
    if (isCanonicalSuperadminEmail(user.email) && user.role !== "superadmin") {
      return NextResponse.json(
        { error: "Akun superadmin belum aktif. Jalankan seed superadmin." },
        { status: 403 }
      );
    }

    // Login sukses — reset counter
    resetRateLimit(`login:${ip}`);

    // Issue token pair
    const { token: accessToken } = await signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
    const { token: refreshToken, jti: refreshJti } = await signRefreshToken(user.id);

    // Persist refresh token in DB
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(refreshTokens).values({
      id: refreshJti,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
      userAgent,
      ip,
    });

    // Build response
    const response = NextResponse.json({
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    });

    // Set new split cookies
    setAuthCookies(response, accessToken, refreshToken);

    // Grace period: also set legacy cookie so existing sessions still work
    // TODO: remove this after JWT_GRACE_UNTIL (default 2026-06-30)
    response.cookies.set(LEGACY_COOKIE, accessToken, getAccessCookieOptions());

    // Audit — fire-and-forget
    logAuthEvent(user.id, "login", ip, userAgent).catch(console.error);

    return response;
  } catch (e) {
    console.error("[login]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
