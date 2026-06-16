/**
 * Module: Monthly Uploads Query Helpers
 * Purpose: CRUD for monthly_uploads — parsed marketplace file archives per store per period
 * Used by: /api/monthly-uploads/*, /api/reports/calculate
 * Dependencies: db client, drizzle-orm, monthlyUploads schema
 * Public functions: listMonthlyUploads, getMonthlyUploadById, insertMonthlyUpload, deleteMonthlyUpload, getMonthlyUploadsByStoreAndPeriod
 * Side effects: reads/writes monthly_uploads in TiDB; parsedJson can be large (handle at caller)
 */

import { and, eq, desc, sql } from "drizzle-orm";
import { getDb } from "../client";
import { monthlyUploads, stores } from "../schema";
import type {
	FileType,
	MarketplaceId,
	MonthlyUploadDetail,
	MonthlyUploadInsert,
	MonthlyUploadRecord,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * List monthly upload records (metadata only, no parsedJson).
 * Filters are all optional and ANDed together.
 * Supports pagination via limit/offset.
 */
export async function listMonthlyUploads(filters: {
	userId: string;
	marketplace?: MarketplaceId;
	storeId?: string;
	periodYear?: number;
	periodMonth?: number;
	fileType?: string;
	limit?: number;
	offset?: number;
}): Promise<{ records: MonthlyUploadRecord[]; total: number }> {
	const db = await getDb();
	const conditions = [eq(monthlyUploads.userId, filters.userId)];
	if (filters.marketplace !== undefined) {
		conditions.push(eq(monthlyUploads.marketplace, filters.marketplace));
	}
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
		conditions.push(eq(monthlyUploads.fileType, filters.fileType as FileType));
	}

	const limit = filters.limit ?? 20;
	const offset = filters.offset ?? 0;

	// Get total count for pagination using COUNT(*)
	const countResult = await db
		.select({ count: sql<number>`count(*)` })
		.from(monthlyUploads)
		.innerJoin(stores, eq(monthlyUploads.storeId, stores.id))
		.where(and(...conditions));
	const total = Number(countResult[0]?.count ?? 0);

	// Get paginated results
	const rows = await db
		.select({
			id: monthlyUploads.id,
			userId: monthlyUploads.userId,
			storeId: monthlyUploads.storeId,
			storeName: stores.storeName,
			marketplace: monthlyUploads.marketplace,
			periodYear: monthlyUploads.periodYear,
			periodMonth: monthlyUploads.periodMonth,
			fileType: monthlyUploads.fileType,
			fileName: monthlyUploads.fileName,
			rawRowCount: monthlyUploads.rawRowCount,
			checksumSha256: monthlyUploads.checksumSha256,
			uploadedAt: monthlyUploads.uploadedAt,
		})
		.from(monthlyUploads)
		.innerJoin(stores, eq(monthlyUploads.storeId, stores.id))
		.where(and(...conditions))
		.orderBy(desc(monthlyUploads.uploadedAt))
		.limit(limit)
		.offset(offset);

	return { records: rows.map(mapMetadataRow), total };
}

/** Fetch a single upload by id including parsedJson, scoped to userId. */
export async function getMonthlyUploadById(
	id: string,
	userId: string,
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
 * Idempotent: returns early if the same file (same checksum for same
 * store+period+type) already exists (uq_mu_dedupe constraint violation).
 */
export async function insertMonthlyUpload(
	data: MonthlyUploadInsert,
): Promise<"inserted" | "duplicate"> {
	const db = await getDb();

	// Pre-check: skip insert if same store+period+type already exists
	const existing = await db
		.select({ id: monthlyUploads.id })
		.from(monthlyUploads)
		.where(
			and(
				eq(monthlyUploads.storeId, data.storeId),
				eq(monthlyUploads.periodYear, data.periodYear),
				eq(monthlyUploads.periodMonth, data.periodMonth),
				eq(monthlyUploads.fileType, data.fileType as FileType),
			),
		)
		.limit(1);
	if (existing.length > 0) {
		return "duplicate";
	}

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
	return "inserted";
}

/**
 * Upsert a monthly upload record — replaces existing file for the same
 * store+period+type if `replace=true`, otherwise behaves like insertMonthlyUpload.
 */
export async function upsertMonthlyUpload(
	data: MonthlyUploadInsert,
	options: { replace?: boolean } = {},
): Promise<"inserted" | "replaced" | "duplicate"> {
	const db = await getDb();

	const existing = await db
		.select({ id: monthlyUploads.id })
		.from(monthlyUploads)
		.where(
			and(
				eq(monthlyUploads.storeId, data.storeId),
				eq(monthlyUploads.periodYear, data.periodYear),
				eq(monthlyUploads.periodMonth, data.periodMonth),
				eq(monthlyUploads.fileType, data.fileType as FileType),
			),
		)
		.limit(1);

	if (existing.length > 0) {
		if (options.replace) {
			// Delete existing → insert new (replace)
			await db
				.delete(monthlyUploads)
				.where(eq(monthlyUploads.id, existing[0].id));
		} else {
			return "duplicate";
		}
	}

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
	return existing.length > 0 && options.replace ? "replaced" : "inserted";
}

/** DELETE a single upload record, scoped to userId for ownership safety. */
export async function deleteMonthlyUpload(
	id: string,
	userId: string,
): Promise<void> {
	const db = await getDb();
	await db
		.delete(monthlyUploads)
		.where(and(eq(monthlyUploads.id, id), eq(monthlyUploads.userId, userId)));
}

/**
 * Fetch all uploads for a store + period, WITH parsedJson.
 * Used by the calculate endpoint to reconstruct the full dataset.
 */
export async function getMonthlyUploadsByStoreAndPeriod(
	storeId: string,
	periodYear: number,
	periodMonth: number,
): Promise<MonthlyUploadDetail[]> {
	const db = await getDb();
	const rows = await db
		.select()
		.from(monthlyUploads)
		.where(
			and(
				eq(monthlyUploads.storeId, storeId),
				eq(monthlyUploads.periodYear, periodYear),
				eq(monthlyUploads.periodMonth, periodMonth),
			),
		);
	return rows.map(mapDetailRow);
}

// ---------------------------------------------------------------------------
// Internal mappers
// ---------------------------------------------------------------------------

function mapMetadataRow(row: {
	id: string;
	userId: string;
	storeId: string;
	storeName: string;
	marketplace: "shopee" | "tokopedia" | "lazada";
	periodYear: number;
	periodMonth: number;
	fileType:
		| "order"
		| "income"
		| "return"
		| "cancel"
		| "failed"
		| "ads"
		| "cashflow";
	fileName: string;
	rawRowCount: number;
	checksumSha256: string;
	uploadedAt: Date;
}): MonthlyUploadRecord {
	return {
		id: row.id,
		userId: row.userId,
		storeId: row.storeId,
		storeName: row.storeName,
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
	row: typeof monthlyUploads.$inferSelect,
): MonthlyUploadDetail {
	return {
		id: row.id,
		userId: row.userId,
		storeId: row.storeId,
		storeName: "", // Will be fetched separately if needed
		marketplace: row.marketplace as MarketplaceId,
		periodYear: row.periodYear,
		periodMonth: row.periodMonth,
		fileType: row.fileType as FileType,
		fileName: row.fileName,
		rawRowCount: row.rawRowCount,
		checksumSha256: row.checksumSha256,
		uploadedAt: row.uploadedAt,
		parsedJson: (row.parsedJson as unknown[]) ?? [],
	};
}
