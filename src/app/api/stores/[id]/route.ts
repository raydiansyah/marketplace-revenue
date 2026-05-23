/**
 * Module: Stores API — item routes
 * Purpose: Update and soft-delete a single store record
 * Used by: /upload (store settings), /data-bank (rename/deactivate)
 * Dependencies: auth/session, db/queries/stores
 * Public functions: PATCH /api/stores/[id], DELETE /api/stores/[id]
 * Side effects: writes stores table in TiDB (update only — never hard-delete)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth/session'
import { updateStore, softDeleteStore } from '@/lib/db/queries/stores'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession()
    const { id } = await params
    const body = await req.json()

    const updates: { storeName?: string; externalShopId?: string; isActive?: number } = {}
    if (typeof body.storeName === 'string' && body.storeName.trim() !== '') {
      updates.storeName = body.storeName.trim()
    }
    if (typeof body.externalShopId === 'string') {
      updates.externalShopId = body.externalShopId.trim()
    }
    if (typeof body.isActive === 'number' && (body.isActive === 0 || body.isActive === 1)) {
      updates.isActive = body.isActive
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Tidak ada perubahan yang dikirim' }, { status: 400 })
    }

    await updateStore(id, session.sub, updates)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[PATCH /api/stores/:id]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession()
    const { id } = await params
    await softDeleteStore(id, session.sub)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[DELETE /api/stores/:id]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
