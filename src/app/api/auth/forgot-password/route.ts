import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limiter";
import { normalizeEmail } from "@/lib/auth/constants";
import { createPasswordResetToken, ensurePasswordResetTable } from "@/lib/auth/password-reset";

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    const { allowed, retryAfterMs } = checkRateLimit(`forgot-password:${ip}`, 8, 15 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan. Coba lagi dalam beberapa menit." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const { email } = await req.json();
    const normalizedEmail = normalizeEmail(String(email ?? ""));
    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email wajib diisi." }, { status: 400 });
    }

    await ensurePasswordResetTable();
    const db = await getDb();

    const [user] = await db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.email})`, normalizedEmail))
      .limit(1);

    let resetUrl: string | undefined;

    if (user) {
      const { token, expiresAt } = await createPasswordResetToken(user.id);
      const origin = req.nextUrl.origin;
      resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
      console.info(`[forgot-password] ${normalizedEmail} reset link (expires ${expiresAt.toISOString()}): ${resetUrl}`);
    }

    return NextResponse.json({
      ok: true,
      message: "Jika email terdaftar, link reset password telah dibuat.",
      resetUrl: process.env.NODE_ENV !== "production" ? resetUrl : undefined,
    });
  } catch (e) {
    console.error("[POST /api/auth/forgot-password]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

