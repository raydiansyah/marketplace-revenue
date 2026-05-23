import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db/client'
import { hppEntries } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import type { HppEntry } from '@/lib/types'

export async function GET() {
  try {
    const session = await requireSession()
    const db = await getDb()
    const rows = await db.select().from(hppEntries).where(eq(hppEntries.userId, session.sub))
    const entries: HppEntry[] = rows.map((r: any) => ({
      sku: r.sku,
      productName: r.productName,
      masterProductName: r.masterProductName ?? undefined,
      masterSku: r.masterSku ?? undefined,
      cost: Number(r.cost),
    }))
    return NextResponse.json({ entries })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[GET /api/hpp]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
    const entries: HppEntry[] = body?.entries

    if (!Array.isArray(entries)) {
      return NextResponse.json({ error: 'entries must be an array' }, { status: 400 })
    }

    for (const entry of entries) {
      if (typeof entry.sku !== 'string') {
        return NextResponse.json({ error: 'Each entry must have a sku field' }, { status: 400 })
      }
      if (typeof entry.productName !== 'string' || entry.productName.trim() === '') {
        return NextResponse.json({ error: 'Each entry must have a non-empty productName' }, { status: 400 })
      }
      if (typeof entry.cost !== 'number' || !Number.isFinite(entry.cost) || entry.cost < 0) {
        return NextResponse.json({ error: 'Each entry cost must be a finite number >= 0' }, { status: 400 })
      }
    }

    const db = await getDb()

    await db.transaction(async (tx: any) => {
      await tx.delete(hppEntries).where(eq(hppEntries.userId, session.sub))
      if (entries.length > 0) {
        await tx.insert(hppEntries).values(
          entries.map(e => ({
            id: randomUUID(),
            userId: session.sub,
            sku: e.sku,
            productName: e.productName,
            masterProductName: e.masterProductName ?? null,
            masterSku: e.masterSku ?? null,
            cost: String(e.cost),
          }))
        )
      }
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[PUT /api/hpp]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
