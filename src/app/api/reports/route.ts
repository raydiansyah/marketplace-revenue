import { NextRequest, NextResponse } from 'next/server'
import { eq, desc } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { savedReports } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'

export async function GET() {
  try {
    const session = await requireSession()
    const db = await getDb()
    const rows = await db
      .select()
      .from(savedReports)
      .where(eq(savedReports.userId, session.sub))
      .orderBy(desc(savedReports.createdAt))
    return NextResponse.json({ reports: rows })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[GET /api/reports]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const { id, storeName, marketplace, label, reportJson } = await req.json()
    const db = await getDb()
    await db.insert(savedReports).values({
      id,
      userId: session.sub,
      marketplace,
      storeName,
      label,
      reportJson,
    })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[POST /api/reports]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
