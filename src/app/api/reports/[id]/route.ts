import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { savedReports } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession()
    const { id } = await params
    const db = await getDb()
    const [row] = await db
      .select()
      .from(savedReports)
      .where(and(eq(savedReports.id, id), eq(savedReports.userId, session.sub)))
      .limit(1)

    if (!row) {
      return NextResponse.json({ error: 'Laporan tidak ditemukan' }, { status: 404 })
    }

    return NextResponse.json({ report: row })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[GET /api/reports/:id]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession()
    const { id } = await params
    const { storeName, label, reportJson } = await req.json()
    const updates: Record<string, unknown> = {}
    if (typeof storeName === 'string') updates.storeName = storeName
    if (typeof label === 'string') updates.label = label
    if (typeof reportJson === 'object' && reportJson !== null) updates.reportJson = reportJson

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Tidak ada perubahan yang dikirim' }, { status: 400 })
    }

    const db = await getDb()
    await db
      .update(savedReports)
      .set(updates as any)
      .where(and(eq(savedReports.id, id), eq(savedReports.userId, session.sub)))
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[PATCH /api/reports/:id]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession()
    const { id } = await params
    const db = await getDb()
    await db
      .delete(savedReports)
      .where(and(eq(savedReports.id, id), eq(savedReports.userId, session.sub)))
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[DELETE /api/reports/:id]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
