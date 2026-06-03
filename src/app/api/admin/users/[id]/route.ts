import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { requireRole } from '@/lib/auth/session'
import { isCanonicalSuperadminEmail } from '@/lib/auth/constants'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(['superadmin'])
    const { id } = await params
    const { name, role } = await req.json()

    if (role && !['admin', 'finance'].includes(role)) {
      return NextResponse.json({ error: 'Role tidak valid' }, { status: 400 })
    }

    const db = await getDb()
    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!targetUser) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })
    }
    if (isCanonicalSuperadminEmail(targetUser.email)) {
      return NextResponse.json(
        { error: 'Akun superadmin utama tidak dapat diubah' },
        { status: 400 }
      )
    }

    await db
      .update(users)
      .set({ ...(name && { name }), ...(role && { role }) })
      .where(eq(users.id, id))

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[PATCH /api/admin/users/:id]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(['superadmin'])
    const { id } = await params

    if (id === session.sub) {
      return NextResponse.json({ error: 'Tidak dapat menghapus akun sendiri' }, { status: 400 })
    }

    const db = await getDb()
    const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!targetUser) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })
    }
    if (isCanonicalSuperadminEmail(targetUser.email)) {
      return NextResponse.json(
        { error: 'Akun superadmin utama tidak dapat dihapus' },
        { status: 400 }
      )
    }

    await db.delete(users).where(eq(users.id, id))
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[DELETE /api/admin/users/:id]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
