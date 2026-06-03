/**
 * Module: Reports Calculate API
 * Purpose: Hitung laporan revenue dari monthly_uploads untuk store+period tertentu
 * Used by: /reports/new page (POST)
 * Dependencies: reconcile.ts, monthly_uploads queries, loadCombinedHpp, user_configs, saved_reports
 * Public functions: POST (storeId, periodYear, periodMonth) → savedReport id + label
 * Side effects: INSERT saved_reports row setelah kalkulasi
 */

import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { monthlyUploads, userConfigs, savedReports, stores } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { loadCombinedHpp } from "@/lib/hpp/combined";
import { generateReportFromSets } from "@/lib/reconcile";
import {
  DEFAULT_SHOPEE_CONFIG,
  DEFAULT_TOKOPEDIA_CONFIG,
  DEFAULT_LAZADA_CONFIG,
} from "@/lib/defaults";
import type {
  MarketplaceId,
  MarketplaceUploadSet,
  OrderFile,
  IncomeFile,
  ReturnOrderFile,
  RawOrder,
  IncomeTransaction,
  ReturnOrderTransaction,
  ShopeeConfig,
  TokopediaConfig,
  LazadaConfig,
} from "@/lib/types";

const MONTH_LABELS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const { storeId, periodYear, periodMonth } = body as {
      storeId: string;
      periodYear: number;
      periodMonth: number;
    };

    if (!storeId || !periodYear || !periodMonth) {
      return NextResponse.json({ error: "storeId, periodYear, periodMonth wajib diisi" }, { status: 400 });
    }
    if (periodMonth < 1 || periodMonth > 12) {
      return NextResponse.json({ error: "periodMonth harus antara 1–12" }, { status: 400 });
    }

    const db = await getDb();

    // Verifikasi store milik user
    const storeRows = await db
      .select()
      .from(stores)
      .where(and(eq(stores.id, storeId), eq(stores.userId, session.sub)))
      .limit(1);

    if (storeRows.length === 0) {
      return NextResponse.json({ error: "Store tidak ditemukan" }, { status: 404 });
    }
    const store = storeRows[0];
    const marketplace = store.marketplace as MarketplaceId;

    // Ambil semua monthly_uploads untuk store+period (single query, no N+1)
    const uploads = await db
      .select()
      .from(monthlyUploads)
      .where(
        and(
          eq(monthlyUploads.storeId, storeId),
          eq(monthlyUploads.userId, session.sub),
          eq(monthlyUploads.periodYear, periodYear),
          eq(monthlyUploads.periodMonth, periodMonth)
        )
      );

    if (uploads.length === 0) {
      return NextResponse.json(
        { error: "Tidak ada data upload untuk store dan periode ini. Upload file terlebih dahulu di /upload." },
        { status: 422 }
      );
    }

    // Susun MarketplaceUploadSet dari uploads
    const orderFiles: OrderFile[] = [];
    let incomeFile: IncomeFile | null = null;
    let returnOrderFile: ReturnOrderFile | null = null;
    let canceledOrderFile: OrderFile | null = null;
    let failedDeliveryFile: OrderFile | null = null;

    for (const upload of uploads) {
      const now = upload.uploadedAt.toISOString();
      switch (upload.fileType) {
        case "order":
          orderFiles.push({
            fileName: upload.fileName,
            rawOrders: upload.parsedJson as RawOrder[],
            uploadedAt: now,
          });
          break;
        case "income":
          incomeFile = {
            fileName: upload.fileName,
            transactions: upload.parsedJson as IncomeTransaction[],
            uploadedAt: now,
          };
          break;
        case "return":
          returnOrderFile = {
            fileName: upload.fileName,
            transactions: upload.parsedJson as ReturnOrderTransaction[],
            uploadedAt: now,
          };
          break;
        case "cancel":
          canceledOrderFile = {
            fileName: upload.fileName,
            rawOrders: upload.parsedJson as RawOrder[],
            uploadedAt: now,
          };
          break;
        case "failed":
          failedDeliveryFile = {
            fileName: upload.fileName,
            rawOrders: upload.parsedJson as RawOrder[],
            uploadedAt: now,
          };
          break;
        // ads + cashflow diabaikan di kalkulasi revenue
      }
    }

    if (orderFiles.length === 0 && incomeFile === null) {
      return NextResponse.json(
        { error: "Minimal satu file Pesanan atau file Pendapatan diperlukan untuk kalkulasi." },
        { status: 422 }
      );
    }

    const uploadSet: MarketplaceUploadSet = {
      marketplace,
      orderFiles,
      incomeFile,
      returnOrderFile,
      canceledOrderFile,
      failedDeliveryFile,
    };

    // HPP entries — combined loader with fallback to legacy hpp_entries
    const hppList = await loadCombinedHpp(session.sub);

    // Configs (single query)
    const configRows = await db
      .select()
      .from(userConfigs)
      .where(eq(userConfigs.userId, session.sub));

    const configMap: Record<string, unknown> = {};
    for (const row of configRows) configMap[row.marketplace] = row.configJson;

    const configs = {
      shopee: (configMap.shopee as ShopeeConfig) ?? DEFAULT_SHOPEE_CONFIG,
      tokopedia: (configMap.tokopedia as TokopediaConfig) ?? DEFAULT_TOKOPEDIA_CONFIG,
      lazada: (configMap.lazada as LazadaConfig) ?? DEFAULT_LAZADA_CONFIG,
    };

    // Kalkulasi
    const report = generateReportFromSets({ [marketplace]: uploadSet }, hppList, configs);

    // Tambah metadata store+period ke report
    report.storeId = storeId;
    report.reportPeriod = { year: periodYear, month: periodMonth };

    const monthLabel = MONTH_LABELS[(periodMonth - 1)] ?? String(periodMonth);
    const label = `${store.storeName} — ${monthLabel} ${periodYear}`;
    const reportId = randomUUID();

    await db.insert(savedReports).values({
      id: reportId,
      userId: session.sub,
      marketplace,
      storeName: store.storeName,
      label,
      reportJson: report,
      storeId,
      periodYear,
      periodMonth,
    });

    return NextResponse.json({ id: reportId, label, marketplace, storeName: store.storeName }, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/reports/calculate]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
