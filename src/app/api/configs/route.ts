import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db/client'
import { userConfigs } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import {
  DEFAULT_SHOPEE_CONFIG,
  DEFAULT_TOKOPEDIA_CONFIG,
  DEFAULT_LAZADA_CONFIG,
} from '@/lib/defaults'
import type { MarketplaceId, ShopeeConfig, TokopediaConfig, LazadaConfig } from '@/lib/types'

export async function GET() {
  try {
    const session = await requireSession()
    const db = await getDb()
    const rows = await db
      .select()
      .from(userConfigs)
      .where(eq(userConfigs.userId, session.sub))

    const configMap: Record<string, unknown> = {}
    for (const row of rows) {
      configMap[row.marketplace] = row.configJson
    }

    return NextResponse.json({
      configs: {
        shopee: (configMap.shopee as ShopeeConfig) ?? DEFAULT_SHOPEE_CONFIG,
        tokopedia: (configMap.tokopedia as TokopediaConfig) ?? DEFAULT_TOKOPEDIA_CONFIG,
        lazada: (configMap.lazada as LazadaConfig) ?? DEFAULT_LAZADA_CONFIG,
      },
    })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[GET /api/configs]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession()
    const { marketplace, config }: { marketplace: MarketplaceId; config: unknown } = await req.json()

    // Validasi marketplace runtime (TypeScript types dilucuti saat runtime)
    const VALID_MARKETPLACES = ['shopee', 'tokopedia', 'lazada']
    if (!VALID_MARKETPLACES.includes(marketplace)) {
      return NextResponse.json({ error: 'Marketplace tidak valid' }, { status: 400 })
    }

    const db = await getDb()

    const existing = await db
      .select()
      .from(userConfigs)
      .where(and(eq(userConfigs.userId, session.sub), eq(userConfigs.marketplace, marketplace)))
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(userConfigs)
        .set({ configJson: config })
        .where(and(eq(userConfigs.userId, session.sub), eq(userConfigs.marketplace, marketplace)))
    } else {
      await db.insert(userConfigs).values({
        id: randomUUID(),
        userId: session.sub,
        marketplace,
        configJson: config,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[PUT /api/configs]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
