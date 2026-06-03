/**
 * Module: Monthly Uploads Query Helpers
 * Purpose: CRUD for monthly_uploads — parsed marketplace file archives per store per period
 * Used by: /api/monthly-uploads/*, /api/reports/calculate
 * Dependencies: db client, drizzle-orm, monthlyUploads schema
 * Public functions: listMonthlyUploads, getMonthlyUploadById, insertMonthlyUpload, deleteMonthlyUpload, getMonthlyUploadsByStoreAndPeriod
 * Side effects: reads/writes monthly_uploads in TiDB; parsedJson can be large (handle at caller)
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../client";
import { monthlyUploads } from "../schema";
import type {
  FileType,
  MarketplaceId,
  MonthlyUploadDetail,
  MonthlyUploadInsert,
  MonthlyUploadRecord,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Column selection helpers
// ---------------------------------------------------------------------------

/** All columns except parsedJson — used for list endpoints to avoid loading large blobs. */
const metadataColumns = {
  id: monthlyUploads.id,
  userId: monthlyUploads.userId,
  storeId: monthlyUploads.storeId,
  marketplace: monthlyUploads.marketplace,
  periodYear: monthlyUploads.periodYear,
  periodMonth: monthlyUploads.periodMonth,
  fileType: monthlyUploads.fileType,
  fileName: monthlyUploads.fileName,
  rawRowCount: monthlyUploads.rawRowCount,
  checksumSha256: monthlyUploads.checksumSha256,
  uploadedAt: monthlyUploads.uploadedAt,
} as const;

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * List monthly upload records (metadata only, no parsedJson).
 * Filters are all optional and ANDed together.
 */
export async function listMonthlyUploads(filters: {
  userId: string;
  storeId?: string;
  periodYear?: number;
  periodMonth?: number;
  fileType?: string;
}): Promise<MonthlyUploadRecord[]> {
  const db = await getDb();
  const conditions = [eq(monthlyUploads.userId, filters.userId)];
  if (filters.storeId !== undefined) {
    conditions.push(eq(monthlyUploads.storeId, filters.storeId));
  }
  if (filters.periodYear !== undefined) {
    conditions.push(eq(monthlyUploads.periodYear, filters.periodYear));
  }
  if (filters.periodMonth !== undefined) {
    conditions.push(eq(monthlyUploads.periodMonth, filters.periodMonth));
  }
  if (filters.fileType !== undefined) {
    conditions.push(
      eq(monthlyUploads.fileType, filters.fileType as FileType)
    );
  }
  const rows = await db
    .select(metadataColumns)
    .from(monthlyUploads)
    .where(and(...conditions));
  return rows.map(mapMetadataRow);
}

/** Fetch a single upload by id including parsedJson, scoped to userId. */
export async function getMonthlyUploadById(
  id: string,
  userId: string
): Promise<MonthlyUploadDetail | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(monthlyUploads)
    .where(and(eq(monthlyUploads.id, id), eq(monthlyUploads.userId, userId)))
    .limit(1);
  return rows.length > 0 ? mapDetailRow(rows[0]) : null;
}

/**
 * INSERT a new monthly upload record.
 * Idempotent by design: caller should catch the duplicate-key error from the
 * UNIQUE constraint (uq_mu_dedupe) and treat it as a no-op if needed.
 */
export async function insertMonthlyUpload(
  data: MonthlyUploadInsert
): Promise<void> {
  const db = await getDb();
  await db.insert(monthlyUploads).values({
    id: data.id,
    userId: data.userId,
    storeId: data.storeId,
    marketplace: data.marketplace as "shopee" | "tokopedia" | "lazada",
    periodYear: data.periodYear,
    periodMonth: data.periodMonth,
    fileType: data.fileType as
      | "order"
      | "income"
      | "return"
      | "cancel"
      | "failed"
      | "ads"
      | "cashflow",
    fileName: data.fileName,
    parsedJson: data.parsedJson,
    rawRowCount: data.rawRowCount,
    checksumSha256: data.checksumSha256,
  });
}

/** DELETE a single upload record, scoped to userId for ownership safety. */
export async function deleteMonthlyUpload(
  id: string,
  userId: string
): Promise<void> {
  const db = await getDb();
  await db
    .delete(monthlyUploads)
    .where(
      and(eq(monthlyUploads.id, id), eq(monthlyUploads.userId, userId))
    );
}

/**
 * Fetch all uploads for a store + period, WITH parsedJson.
 * Used by the calculate endpoint to reconstruct the full dataset.
 */
export async function getMonthlyUploadsByStoreAndPeriod(
  storeId: string,
  periodYear: number,
  periodMonth: number
): Promise<MonthlyUploadDetail[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(monthlyUploads)
    .where(
      and(
        eq(monthlyUploads.storeId, storeId),
        eq(monthlyUploads.periodYear, periodYear),
        eq(monthlyUploads.periodMonth, periodMonth)
      )
    );
  return rows.map(mapDetailRow);
}

// ---------------------------------------------------------------------------
// Internal mappers
// ---------------------------------------------------------------------------

function mapMetadataRow(
  row: Pick<
    typeof monthlyUploads.$inferSelect,
    | "id"
    | "userId"
    | "storeId"
    | "marketplace"
    | "periodYear"
    | "periodMonth"
    | "fileType"
    | "fileName"
    | "rawRowCount"
    | "checksumSha256"
    | "uploadedAt"
  >
): MonthlyUploadRecord {
  return {
    id: row.id,
    userId: row.userId,
    storeId: row.storeId,
    marketplace: row.marketplace as MarketplaceId,
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    fileType: row.fileType as FileType,
    fileName: row.fileName,
    rawRowCount: row.rawRowCount,
    checksumSha256: row.checksumSha256,
    uploadedAt: row.uploadedAt,
  };
}

function mapDetailRow(
  row: typeof monthlyUploads.$inferSelect
): MonthlyUploadDetail {
  return {
    ...mapMetadataRow(row),
    parsedJson: (row.parsedJson as unknown[]) ?? [],
  };
}
