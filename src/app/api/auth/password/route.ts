import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { validateStrongPassword } from "@/lib/auth/password-policy";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { currentPassword, newPassword, confirmPassword } = await req.json();

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: "Password lama, password baru, dan konfirmasi wajib diisi." },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "Konfirmasi password tidak cocok." }, { status: 400 });
    }

    if (String(currentPassword) === String(newPassword)) {
      return NextResponse.json(
        { error: "Password baru harus berbeda dari password lama." },
        { status: 400 }
      );
    }

    const policy = validateStrongPassword(String(newPassword));
    if (!policy.isValid) {
      return NextResponse.json(
        { error: "Password baru belum memenuhi kriteria kuat.", details: policy.errors },
        { status: 400 }
      );
    }

    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.id, session.sub)).limit(1);
    if (!user) {
      return NextResponse.json({ error: "User tidak ditemukan." }, { status: 404 });
    }

    const validCurrent = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!validCurrent) {
      return NextResponse.json({ error: "Password lama tidak sesuai." }, { status: 401 });
    }

    const nextHash = await bcrypt.hash(String(newPassword), 12);
    await db.update(users).set({ passwordHash: nextHash }).where(eq(users.id, session.sub));

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/auth/password]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
