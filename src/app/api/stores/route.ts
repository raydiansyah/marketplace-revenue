/**
 * Module: Stores API — collection routes
 * Purpose: CRUD for toko (stores) per marketplace per user
 * Used by: /upload (store picker), /data-bank, /reports/new
 * Dependencies: auth/session, db/queries/stores, crypto (randomUUID)
 * Public functions: GET /api/stores, POST /api/stores
 * Side effects: reads/writes stores table in TiDB
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireSession } from '@/lib/auth/session'
import { getStores, createStore } from '@/lib/db/queries/stores'
import type { MarketplaceId, StoreSummary } from '@/lib/types'

export const runtime = 'nodejs'

const VALID_MARKETPLACES: MarketplaceId[] = ['shopee', 'tokopedia', 'lazada']

function isDupEntryError(e: unknown): boolean {
  if (e instanceof Error) {
    const msg = e.message.toLowerCase()
    return (
      msg.includes('er_dup_entry') ||
      msg.includes('duplicate entry') ||
      ('code' in e && (e as NodeJS.ErrnoException).code === 'ER_DUP_ENTRY') ||
      ('errno' in e && (e as { errno?: number }).errno === 1062)
    )
  }
  return false
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const { searchParams } = new URL(req.url)
    const marketplace = searchParams.get('marketplace') as MarketplaceId | null

    if (marketplace !== null && !VALID_MARKETPLACES.includes(marketplace)) {
      return NextResponse.json({ error: 'marketplace tidak valid' }, { status: 400 })
    }

    const stores = await getStores(session.sub, marketplace ?? undefined)
    return NextResponse.json(
      { stores },
      {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
        },
      },
    )
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[GET /api/stores]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const body = await req.json()
    const { marketplace, storeName, externalShopId } = body ?? {}

    if (!marketplace || !VALID_MARKETPLACES.includes(marketplace as MarketplaceId)) {
      return NextResponse.json(
        { error: 'marketplace wajib diisi dan harus salah satu dari shopee, tokopedia, lazada' },
        { status: 400 }
      )
    }
    if (typeof storeName !== 'string' || storeName.trim() === '') {
      return NextResponse.json({ error: 'storeName wajib diisi' }, { status: 400 })
    }

    const id = randomUUID()
    await createStore({
      id,
      userId: session.sub,
      marketplace: marketplace as MarketplaceId,
      storeName: storeName.trim(),
      externalShopId: typeof externalShopId === 'string' ? externalShopId.trim() || undefined : undefined,
    })

    const store: StoreSummary = {
      id,
      userId: session.sub,
      marketplace: marketplace as MarketplaceId,
      storeName: storeName.trim(),
      isActive: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    return NextResponse.json({ store }, { status: 201 })
  } catch (e) {
    if (e instanceof Response) return e
    if (isDupEntryError(e)) {
      return NextResponse.json(
        { error: 'Toko dengan nama ini sudah ada untuk marketplace tersebut' },
        { status: 409 }
      )
    }
    console.error('[POST /api/stores]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
