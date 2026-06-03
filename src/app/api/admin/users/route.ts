import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth/session'
import { isCanonicalSuperadminEmail, normalizeEmail } from '@/lib/auth/constants'

export async function GET() {
  try {
    await requireRole(['superadmin'])
    const db = await getDb()
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
    return NextResponse.json({ users: rows })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[GET /api/admin/users]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(['superadmin'])
    const { email, password, name, role } = await req.json()

    if (!email || !password || !name || !role) {
      return NextResponse.json({ error: 'Semua field wajib diisi' }, { status: 400 })
    }
    if (!['admin', 'finance'].includes(role)) {
      return NextResponse.json({ error: 'Role tidak valid' }, { status: 400 })
    }

    const normalizedEmail = normalizeEmail(email)
    if (isCanonicalSuperadminEmail(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Email superadmin hanya bisa dibuat lewat seed superadmin' },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const db = await getDb()
    const id = randomUUID()

    await db.insert(users).values({ id, email: normalizedEmail, passwordHash, name, role })
    return NextResponse.json({ user: { id, email, name, role } }, { status: 201 })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[POST /api/admin/users]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
