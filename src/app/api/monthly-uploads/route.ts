/**
 * Module: Monthly Uploads API — collection routes
 * Purpose: Upload and list marketplace file archives per store per period
 * Used by: /data-bank (file list), /upload/new (submit file), /reports/calculate
 * Dependencies: auth/session, db/queries/stores, db/queries/monthlyUploads,
 *               validation/uploadValidator, parsers/* (shopee, tokopedia, lazada, income, tiktokReturn),
 *               crypto (sha256, randomUUID)
 * Public functions: GET /api/monthly-uploads, POST /api/monthly-uploads (multipart)
 * Side effects: reads stores table (ownership check); inserts into monthly_uploads table
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomUUID } from 'crypto'
import { requireSession } from '@/lib/auth/session'
import { getStoreById } from '@/lib/db/queries/stores'
import { listMonthlyUploads, insertMonthlyUpload } from '@/lib/db/queries/monthlyUploads'
import { validateUploadFileOrThrow } from '@/lib/validation/uploadValidator'
import { parseShopeeFile } from '@/lib/parsers/shopee'
import { parseTokopediaFile } from '@/lib/parsers/tokopedia'
import { parseLazadaFile, parseLazadaCancelFile } from '@/lib/parsers/lazada'
import { parseIncomeFile } from '@/lib/parsers/income'
import { parseTiktokReturnFile } from '@/lib/parsers/tiktokReturn'
import type { FileType, MarketplaceId } from '@/lib/types'
import type { UploadFileRole } from '@/lib/validation/uploadValidator'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_MARKETPLACES: MarketplaceId[] = ['shopee', 'tokopedia', 'lazada']

const VALID_FILE_TYPES: FileType[] = ['order', 'income', 'return', 'cancel', 'failed', 'ads', 'cashflow']

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map FileType → UploadFileRole expected by validateUploadFileOrThrow. */
function mapFileTypeToRole(fileType: FileType): UploadFileRole {
  const MAP: Record<FileType, UploadFileRole> = {
    order: 'orders',
    income: 'income',
    return: 'return-orders',
    cancel: 'canceled-orders',
    failed: 'failed-delivery',
    // ads + cashflow don't have validator templates yet — skip validation
    ads: 'orders',
    cashflow: 'income',
  }
  return MAP[fileType]
}

/** Return true for fileTypes that have proper validator templates. */
function hasValidatorTemplate(fileType: FileType): boolean {
  return ['order', 'income', 'return', 'cancel', 'failed'].includes(fileType)
}

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

/**
 * Dispatch to the right parser based on marketplace + fileType.
 * All parsers accept `string | ArrayBuffer`, so we pass the ArrayBuffer directly.
 */
function parseFile(
  content: ArrayBuffer,
  marketplace: MarketplaceId,
  fileType: FileType
): unknown[] {
  if (fileType === 'income') {
    return parseIncomeFile(content, marketplace)
  }
  if (fileType === 'return') {
    return parseTiktokReturnFile(content)
  }
  if (fileType === 'cancel') {
    if (marketplace === 'lazada') return parseLazadaCancelFile(content)
    if (marketplace === 'shopee') return parseShopeeFile(content)
    return parseTokopediaFile(content)
  }
  if (fileType === 'failed') {
    return parseShopeeFile(content)
  }
  // 'order' | 'ads' | 'cashflow' → order parsers
  switch (marketplace) {
    case 'shopee': return parseShopeeFile(content)
    case 'tokopedia': return parseTokopediaFile(content)
    case 'lazada': return parseLazadaFile(content)
  }
}

// ---------------------------------------------------------------------------
// GET /api/monthly-uploads
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession()
    const { searchParams } = new URL(req.url)

    const storeId = searchParams.get('storeId') ?? undefined
    const yearRaw = searchParams.get('year')
    const monthRaw = searchParams.get('month')
    const fileType = searchParams.get('fileType') ?? undefined

    const periodYear = yearRaw !== null ? Number(yearRaw) : undefined
    const periodMonth = monthRaw !== null ? Number(monthRaw) : undefined

    if (periodYear !== undefined && (isNaN(periodYear) || periodYear < 2020 || periodYear > 2035)) {
      return NextResponse.json({ error: 'year tidak valid (2020-2035)' }, { status: 400 })
    }
    if (periodMonth !== undefined && (isNaN(periodMonth) || periodMonth < 1 || periodMonth > 12)) {
      return NextResponse.json({ error: 'month tidak valid (1-12)' }, { status: 400 })
    }
    if (fileType !== undefined && !VALID_FILE_TYPES.includes(fileType as FileType)) {
      return NextResponse.json({ error: 'fileType tidak valid' }, { status: 400 })
    }

    const records = await listMonthlyUploads({
      userId: session.sub,
      storeId,
      periodYear,
      periodMonth,
      fileType,
    })

    return NextResponse.json({ uploads: records })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[GET /api/monthly-uploads]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/monthly-uploads (multipart/form-data)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    const formData = await req.formData()

    // ── 1. Extract fields ──────────────────────────────────────────────────
    const storeId = formData.get('storeId')
    const periodYearRaw = formData.get('periodYear')
    const periodMonthRaw = formData.get('periodMonth')
    const fileTypeRaw = formData.get('fileType')
    const marketplaceRaw = formData.get('marketplace')
    const file = formData.get('file')

    // ── 2. Validate required fields ────────────────────────────────────────
    if (typeof storeId !== 'string' || storeId.trim() === '') {
      return NextResponse.json({ error: 'storeId wajib diisi' }, { status: 400 })
    }
    if (!marketplaceRaw || !VALID_MARKETPLACES.includes(marketplaceRaw as MarketplaceId)) {
      return NextResponse.json(
        { error: 'marketplace wajib diisi dan harus shopee, tokopedia, atau lazada' },
        { status: 400 }
      )
    }
    if (!fileTypeRaw || !VALID_FILE_TYPES.includes(fileTypeRaw as FileType)) {
      return NextResponse.json({ error: 'fileType tidak valid' }, { status: 400 })
    }

    const periodYear = Number(periodYearRaw)
    const periodMonth = Number(periodMonthRaw)
    if (isNaN(periodYear) || periodYear < 2020 || periodYear > 2035) {
      return NextResponse.json({ error: 'periodYear tidak valid (2020-2035)' }, { status: 400 })
    }
    if (isNaN(periodMonth) || periodMonth < 1 || periodMonth > 12) {
      return NextResponse.json({ error: 'periodMonth tidak valid (1-12)' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file wajib dikirim' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Ukuran file melebihi batas 50 MB' }, { status: 413 })
    }

    const marketplace = marketplaceRaw as MarketplaceId
    const fileType = fileTypeRaw as FileType

    // ── 3. Verify store ownership ──────────────────────────────────────────
    const store = await getStoreById(storeId.trim(), session.sub)
    if (!store) {
      return NextResponse.json({ error: 'Toko tidak ditemukan atau bukan milik Anda' }, { status: 404 })
    }

    // ── 4. Read file buffer ────────────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // ── 5. Validate file structure ─────────────────────────────────────────
    if (hasValidatorTemplate(fileType)) {
      try {
        validateUploadFileOrThrow({
          marketplace,
          role: mapFileTypeToRole(fileType),
          fileName: file.name,
          content: arrayBuffer,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'File tidak valid'
        return NextResponse.json({ error: message }, { status: 422 })
      }
    }

    // ── 6. Parse file ──────────────────────────────────────────────────────
    const parsedRows = parseFile(arrayBuffer, marketplace, fileType)

    // ── 7. Checksum ────────────────────────────────────────────────────────
    const checksumSha256 = createHash('sha256').update(buffer).digest('hex')

    // ── 8. Persist ─────────────────────────────────────────────────────────
    const id = randomUUID()
    await insertMonthlyUpload({
      id,
      userId: session.sub,
      storeId: storeId.trim(),
      marketplace,
      periodYear,
      periodMonth,
      fileType,
      fileName: file.name,
      parsedJson: parsedRows,
      rawRowCount: parsedRows.length,
      checksumSha256,
      uploadedAt: new Date(),
    })

    return NextResponse.json(
      { id, fileName: file.name, rawRowCount: parsedRows.length, fileType },
      { status: 201 }
    )
  } catch (e) {
    if (e instanceof Response) return e
    if (isDupEntryError(e)) {
      return NextResponse.json(
        { error: 'File yang identik sudah diupload untuk periode ini' },
        { status: 409 }
      )
    }
    console.error('[POST /api/monthly-uploads]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
