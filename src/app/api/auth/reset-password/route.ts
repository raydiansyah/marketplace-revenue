import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users, passwordResetTokens } from "@/lib/db/schema";
import { validateStrongPassword } from "@/lib/auth/password-policy";
import { consumePasswordResetToken, ensurePasswordResetTable } from "@/lib/auth/password-reset";

export async function POST(req: NextRequest) {
  try {
    const { token, newPassword, confirmPassword } = await req.json();

    if (!token || !newPassword || !confirmPassword) {
      return NextResponse.json({ error: "Token dan password baru wajib diisi." }, { status: 400 });
    }

    if (String(newPassword) !== String(confirmPassword)) {
      return NextResponse.json({ error: "Konfirmasi password tidak cocok." }, { status: 400 });
    }

    const policy = validateStrongPassword(String(newPassword));
    if (!policy.isValid) {
      return NextResponse.json(
        { error: "Password baru belum memenuhi kriteria kuat.", details: policy.errors },
        { status: 400 }
      );
    }

    await ensurePasswordResetTable();
    const consumed = await consumePasswordResetToken(String(token));
    if (!consumed) {
      return NextResponse.json({ error: "Token reset tidak valid atau sudah kadaluarsa." }, { status: 400 });
    }

    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, consumed.userId)).limit(1);
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan." }, { status: 404 });
    }

    const nextHash = await bcrypt.hash(String(newPassword), 12);
    await db.update(users).set({ passwordHash: nextHash }).where(eq(users.id, user.id));

    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

    return NextResponse.json({ ok: true, message: "Password berhasil direset. Silakan login kembali." });
  } catch (e) {
    console.error("[POST /api/auth/reset-password]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

