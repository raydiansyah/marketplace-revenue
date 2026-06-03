/**
 * Module: Monthly Uploads API — item routes
 * Purpose: Fetch detail (with parsedJson) or delete a single monthly upload record
 * Used by: /reports/calculate (load parsed data), /data-bank (delete file)
 * Dependencies: auth/session, db/queries/monthlyUploads
 * Public functions: GET /api/monthly-uploads/[id], DELETE /api/monthly-uploads/[id]
 * Side effects: reads monthly_uploads (GET); hard-deletes monthly_uploads row (DELETE)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth/session'
import { getMonthlyUploadById, deleteMonthlyUpload } from '@/lib/db/queries/monthlyUploads'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession()
    const { id } = await params
    const record = await getMonthlyUploadById(id, session.sub)
    if (!record) {
      return NextResponse.json({ error: 'Upload tidak ditemukan' }, { status: 404 })
    }
    return NextResponse.json({ upload: record })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[GET /api/monthly-uploads/:id]', e)
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
    await deleteMonthlyUpload(id, session.sub)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[DELETE /api/monthly-uploads/:id]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
