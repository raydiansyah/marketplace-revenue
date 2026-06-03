"use client";

/**
 * Module: DashboardPage
 * Purpose: Main financial dashboard — shows global multi-toko summary, per-report view, HPP, order table
 * Used by: /dashboard route
 * Dependencies: useAppStore, AuthAreaLayout, RevenueBarChart, FeePieChart, MonthlyRevenueLineChart,
 *               AiInsightPanel, StatTile, EmptyState, formatCompact, formatRupiah, formatPercent
 * Public functions: DashboardPage (default export)
 * Side effects: Loads savedReports on mount; localStorage via Zustand persist
 */
import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useState, Suspense } from "react";
import { useAppStore } from "@/store/app-store";
import AuthAreaLayout from "@/components/AuthAreaLayout";
import { formatRupiah, formatPercent, formatNumber } from "@/lib/utils";
import { formatCompact } from "@/lib/format/currency";
import { MARKETPLACE_LABELS, MARKETPLACE_COLORS } from "@/lib/types";
import RevenueBarChart from "@/components/charts/RevenueBarChart";
import FeePieChart from "@/components/charts/FeePieChart";
import MonthlyRevenueLineChart from "@/components/charts/MonthlyRevenueLineChart";
import AiInsightPanel from "@/components/ai/AiInsightPanel";
import StatTile from "@/components/dashboard/StatTile";
import EmptyState from "@/components/EmptyState";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNotification } from "@/lib/notifications/notification-context";
import {
  Download,
  FileSpreadsheet,
  Save,
  FolderOpen,
  Pencil,
  Trash2,
  Copy,
  Check,
  Search,
  X,
  CalendarDays,
  TrendingUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  DollarSign,
  Receipt,
  ShoppingCart,
  TrendingDown,
} from "lucide-react";
import type {
  CalculatedOrder,
  HppEntry,
  MarketplaceId,
  MarketplaceUploadSet,
  RawOrder,
  RevenueReport,
} from "@/lib/types";

function normalizeOrderId(orderId: string): string {
  return String(orderId ?? "")
    .trim()
    .replace(/^'+/, "")
    .replace(/\.0+$/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function parseDateLoose(value: string): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const normalized = raw.replace(/\./g, "/").replace(/-/g, "/");
  const [datePart, timePart = "00:00:00"] = normalized.split(" ");
  const dateTokens = datePart.split("/").map((token) => token.trim()).filter(Boolean);
  if (dateTokens.length !== 3) return null;

  let day = 0;
  let month = 0;
  let year = 0;
  if (dateTokens[0].length === 4) {
    year = Number(dateTokens[0]);
    month = Number(dateTokens[1]);
    day = Number(dateTokens[2]);
  } else {
    day = Number(dateTokens[0]);
    month = Number(dateTokens[1]);
    year = Number(dateTokens[2]);
    if (year < 100) year += 2000;
  }

  const [hourRaw = "0", minuteRaw = "0", secondRaw = "0"] = timePart.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);

  if (![day, month, year, hour, minute, second].every((n) => Number.isFinite(n))) return null;
  if (day <= 0 || month <= 0 || month > 12 || year <= 0) return null;

  const parsed = new Date(year, month - 1, day, hour, minute, second);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getRawValueByKey(rawData: Record<string, string> | undefined, candidates: string[]): string {
  if (!rawData) return "";
  const normalize = (value: string) =>
    String(value ?? "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ");

  const keys = Object.keys(rawData);
  for (const key of keys) {
    const keyNorm = normalize(key);
    if (candidates.some((candidate) => keyNorm.includes(candidate))) {
      return String(rawData[key] ?? "").trim();
    }
  }
  return "";
}

function resolveLineSku(line: RawOrder): string {
  const direct = String(line.sku ?? "").trim();
  if (direct) return direct;
  return getRawValueByKey(line.rawData, [
    "nomor referensi sku",
    "sku reference no",
    "variation sku",
    "seller sku",
    "master sku",
    "sku",
  ]);
}

function dedupeOrderLines(lines: RawOrder[]): RawOrder[] {
  const seen = new Set<string>();
  const result: RawOrder[] = [];

  for (const line of lines) {
    const lineId = getRawValueByKey(line.rawData, [
      "id pesanan baris",
      "order item id",
      "order line id",
      "line id",
    ]);
    const resolvedSku = resolveLineSku(line);

    const signature = lineId
      ? `line:${lineId}`
      : [
          normalizeOrderId(line.orderId),
          resolvedSku.trim().toLowerCase(),
          String(line.productName ?? "").trim().toLowerCase(),
          String(line.qty ?? 0),
          String(line.actualPrice ?? 0),
          String(line.orderDate ?? "").trim().toLowerCase(),
        ].join("|");

    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push(line);
  }

  return result;
}

function shouldUseAggregatedOrderView(marketplace: MarketplaceId): boolean {
  return marketplace === "lazada" || marketplace === "tokopedia" || marketplace === "shopee";
}

type HppLookupResult = {
  cost: number;
  matchedEntry: HppEntry | null;
};

function lookupHppMatchForLine(sku: string, productName: string, hppEntries: HppEntry[]): HppLookupResult {
  if (!hppEntries.length) return { cost: 0, matchedEntry: null };

  const normalizeSku = (value: string) =>
    String(value ?? "")
      .trim()
      .replace(/^'+/, "")
      .replace(/\.0+$/, "")
      .replace(/[^a-zA-Z0-9]+/g, "")
      .toLowerCase();

  const normalizeName = (value: string) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const splitSkuAliases = (value: string): string[] =>
    String(value ?? "")
      .split(/[,\n;|/]+/g)
      .map((part) => normalizeSku(part))
      .filter(Boolean);

  const normalizedSku = normalizeSku(sku);
  const normalizedProductName = normalizeName(productName);

  if (normalizedSku) {
    const bySku = hppEntries.find((entry) => {
      if (entry.cost <= 0) return false;
      const aliases = new Set<string>([
        ...splitSkuAliases(entry.sku),
        ...splitSkuAliases(entry.masterSku || ""),
      ]);
      return aliases.has(normalizedSku);
    });
    if (bySku) return { cost: bySku.cost, matchedEntry: bySku };
  }

  const scored = hppEntries
    .map((entry) => {
      const entryName = normalizeName(entry.productName);
      if (!entryName || !normalizedProductName) return { entry, score: 0 };
      if (entryName === normalizedProductName) return { entry, score: 100 };
      if (normalizedProductName.includes(entryName) || entryName.includes(normalizedProductName)) {
        return { entry, score: 80 };
      }

      const a = new Set(normalizedProductName.split(" ").filter(Boolean));
      const b = new Set(entryName.split(" ").filter(Boolean));
      const overlap = [...a].filter((token) => b.has(token)).length;
      return { entry, score: overlap >= 2 ? overlap * 10 : 0 };
    })
    .filter((item) => item.score > 0)
    .sort((x, y) => y.score - x.score);

  const withCost = scored.find((item) => item.entry.cost > 0);
  if (!withCost) {
    return {
      cost: scored[0]?.entry.cost ?? 0,
      matchedEntry: scored[0]?.entry ?? null,
    };
  }
  if (normalizedSku) {
    const distinctCosts = new Set(
      scored
        .map((item) => item.entry.cost)
        .filter((cost) => cost > 0)
    );
    if (distinctCosts.size !== 1) {
      return { cost: 0, matchedEntry: null };
    }
  }
  return { cost: withCost.entry.cost, matchedEntry: withCost.entry };
}

function lookupHppForLine(sku: string, productName: string, hppEntries: HppEntry[]): number {
  return lookupHppMatchForLine(sku, productName, hppEntries).cost;
}

function parseQtyLoose(value: string): number {
  const num = parseInt(String(value ?? "").replace(/[^\d-]/g, ""), 10);
  if (!Number.isFinite(num) || Number.isNaN(num)) return 0;
  return Math.max(0, num);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

type ReturnAggregate = {
  qty: number;
  amount: number;
};

function aggregateReturnsByOrder(
  transactions: { orderId: string; returnQuantity: number; returnUnitPrice: number }[]
): Map<string, ReturnAggregate> {
  const map = new Map<string, ReturnAggregate>();

  for (const tx of transactions) {
    const key = normalizeOrderId(tx.orderId);
    if (!key) continue;
    const current = map.get(key) ?? { qty: 0, amount: 0 };
    const qty = Math.max(0, tx.returnQuantity || 0);
    current.qty += qty;
    current.amount += Math.max(0, (tx.returnUnitPrice || 0) * qty);
    map.set(key, current);
  }

  return map;
}

function normalizeSkuToken(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/^'+/, "")
    .replace(/\.0+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function getReturnedQtyFromOrderLines(lines: RawOrder[]): number {
  return lines.reduce((sum, line) => {
    const returned = getRawValueByKey(line.rawData, [
      "sku quantity of return",
      "qty return",
      "jumlah retur",
      "returned quantity",
    ]);
    return sum + parseQtyLoose(returned);
  }, 0);
}

function adjustLinesWithReturnQty(
  lines: RawOrder[],
  returnedQtyBySku: Map<string, number> | undefined,
  returnedQtyTotal: number,
  hasEmbeddedReturn: boolean
): RawOrder[] {
  if (lines.length === 0 || hasEmbeddedReturn || returnedQtyTotal <= 0) return lines;

  const adjusted = lines.map((line) => ({ ...line }));
  let remaining = Math.max(0, returnedQtyTotal);

  if (returnedQtyBySku && returnedQtyBySku.size > 0) {
    for (const line of adjusted) {
      const skuKey = normalizeSkuToken(resolveLineSku(line));
      if (!skuKey) continue;
      const skuReturn = Math.max(0, returnedQtyBySku.get(skuKey) ?? 0);
      if (skuReturn <= 0) continue;
      const deduction = Math.min(line.qty, skuReturn, remaining);
      if (deduction > 0) {
        line.qty -= deduction;
        remaining -= deduction;
        returnedQtyBySku.set(skuKey, Math.max(0, skuReturn - deduction));
      }
      if (remaining <= 0) break;
    }
  }

  if (remaining > 0) {
    for (const line of adjusted) {
      if (remaining <= 0) break;
      if (line.qty <= 0) continue;
      const deduction = Math.min(line.qty, remaining);
      line.qty -= deduction;
      remaining -= deduction;
    }
  }

  return adjusted.filter((line) => line.qty > 0);
}

function applyReturnAdjustmentToMetrics(params: {
  revenue: number;
  hpp: number;
  platformFee: number;
  baseQty: number;
  returned?: ReturnAggregate;
  hasEmbeddedReturn: boolean;
}): { revenue: number; hpp: number; platformFee: number } {
  const { revenue, hpp, platformFee, baseQty, returned, hasEmbeddedReturn } = params;
  if (!returned || hasEmbeddedReturn) {
    return { revenue, hpp, platformFee };
  }

  const ratioByQty =
    baseQty > 0 && returned.qty > 0
      ? clamp01(returned.qty / baseQty)
      : 0;
  const ratioByAmount =
    revenue > 0 && returned.amount > 0
      ? clamp01(returned.amount / revenue)
      : 0;
  const ratio = clamp01(Math.max(ratioByQty, ratioByAmount));
  if (ratio <= 0) return { revenue, hpp, platformFee };

  const scale = 1 - ratio;
  return {
    revenue: revenue * scale,
    hpp: hpp * scale,
    platformFee: platformFee * scale,
  };
}

function createMarketplaceOnlyReport(report: RevenueReport, marketplace: MarketplaceId): RevenueReport {
  const summary = report.marketplaces.find((item) => item.marketplace === marketplace);
  if (!summary) {
    return {
      ...report,
      marketplaces: [],
      totalRevenue: 0,
      totalHpp: 0,
      totalGrossProfit: 0,
      totalPlatformFees: 0,
      totalNetProfit: 0,
      orders: [],
    };
  }

  const orders = report.orders.filter((order) => order.marketplace === marketplace);
  return {
    ...report,
    marketplaces: [summary],
    totalRevenue: summary.totalRevenue,
    totalHpp: summary.totalHpp,
    totalGrossProfit: summary.totalGrossProfit,
    totalPlatformFees: summary.totalPlatformFees,
    totalNetProfit: summary.totalNetProfit,
    orders,
  };
}

function toOrderKey(marketplace: MarketplaceId, orderId: string): string {
  return `${marketplace}:${normalizeOrderId(orderId)}`;
}

function applyManualOrderExclusions(report: RevenueReport, excludedOrderKeys: string[]): RevenueReport {
  if (excludedOrderKeys.length === 0) return report;
  const excluded = new Set(excludedOrderKeys);
  const orders = report.orders.filter((order) => !excluded.has(toOrderKey(order.marketplace, order.orderId)));

  const marketplaces = report.marketplaces.map((summary) => {
    const scopedOrders = orders.filter((order) => order.marketplace === summary.marketplace);

    const totalOrders = scopedOrders.length;
    const totalRevenue = scopedOrders.reduce((sum, order) => sum + order.revenue, 0);
    const totalHpp = scopedOrders.reduce((sum, order) => sum + order.hpp, 0);
    const totalGrossProfit = scopedOrders.reduce((sum, order) => sum + order.grossProfit, 0);
    const totalPlatformFees = scopedOrders.reduce((sum, order) => sum + order.fees.totalPlatformFee, 0);
    const totalNetProfit = scopedOrders.reduce((sum, order) => sum + order.netProfit, 0);

    return {
      ...summary,
      totalOrders,
      totalRevenue,
      totalHpp,
      totalGrossProfit,
      totalPlatformFees,
      totalNetProfit,
      avgGrossMargin: totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0,
      avgNetMargin: totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0,
      feeBreakdown: {
        commission: scopedOrders.reduce((sum, order) => sum + order.fees.commissionFee, 0),
        transactionFee: scopedOrders.reduce((sum, order) => sum + order.fees.transactionFee, 0),
        freeShipping: scopedOrders.reduce((sum, order) => sum + order.fees.freeShippingFee, 0),
        orderProcessing: scopedOrders.reduce((sum, order) => sum + order.fees.orderProcessingFee, 0),
        voucher: scopedOrders.reduce((sum, order) => sum + order.fees.voucherBySeller, 0),
        affiliate: scopedOrders.reduce((sum, order) => sum + order.fees.affiliateCommission, 0),
        other: scopedOrders.reduce((sum, order) => sum + order.fees.otherFees, 0),
      },
    };
  });

  return {
    ...report,
    marketplaces,
    orders,
    totalRevenue: marketplaces.reduce((sum, item) => sum + item.totalRevenue, 0),
    totalHpp: marketplaces.reduce((sum, item) => sum + item.totalHpp, 0),
    totalGrossProfit: marketplaces.reduce((sum, item) => sum + item.totalGrossProfit, 0),
    totalPlatformFees: marketplaces.reduce((sum, item) => sum + item.totalPlatformFees, 0),
    totalNetProfit: marketplaces.reduce((sum, item) => sum + item.totalNetProfit, 0),
  };
}

function rebuildReportFromOrders(
  sourceReport: RevenueReport,
  orders: CalculatedOrder[],
  period?: { from: string; to: string }
): RevenueReport {
  const marketplaces = sourceReport.marketplaces.map((summary) => {
    const scopedOrders = orders.filter((order) => order.marketplace === summary.marketplace);
    const totalOrders = scopedOrders.length;
    const totalRevenue = scopedOrders.reduce((sum, order) => sum + order.revenue, 0);
    const totalHpp = scopedOrders.reduce((sum, order) => sum + order.hpp, 0);
    const totalGrossProfit = scopedOrders.reduce((sum, order) => sum + order.grossProfit, 0);
    const totalPlatformFees = scopedOrders.reduce((sum, order) => sum + order.fees.totalPlatformFee, 0);
    const totalNetProfit = scopedOrders.reduce((sum, order) => sum + order.netProfit, 0);

    return {
      ...summary,
      totalOrders,
      totalRevenue,
      totalHpp,
      totalGrossProfit,
      totalPlatformFees,
      totalNetProfit,
      avgGrossMargin: totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0,
      avgNetMargin: totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0,
      feeBreakdown: {
        commission: scopedOrders.reduce((sum, order) => sum + order.fees.commissionFee, 0),
        transactionFee: scopedOrders.reduce((sum, order) => sum + order.fees.transactionFee, 0),
        freeShipping: scopedOrders.reduce((sum, order) => sum + order.fees.freeShippingFee, 0),
        orderProcessing: scopedOrders.reduce((sum, order) => sum + order.fees.orderProcessingFee, 0),
        voucher: scopedOrders.reduce((sum, order) => sum + order.fees.voucherBySeller, 0),
        affiliate: scopedOrders.reduce((sum, order) => sum + order.fees.affiliateCommission, 0),
        other: scopedOrders.reduce((sum, order) => sum + order.fees.otherFees, 0),
      },
    };
  });

  return {
    ...sourceReport,
    period,
    orders,
    marketplaces,
    totalRevenue: marketplaces.reduce((sum, item) => sum + item.totalRevenue, 0),
    totalHpp: marketplaces.reduce((sum, item) => sum + item.totalHpp, 0),
    totalGrossProfit: marketplaces.reduce((sum, item) => sum + item.totalGrossProfit, 0),
    totalPlatformFees: marketplaces.reduce((sum, item) => sum + item.totalPlatformFees, 0),
    totalNetProfit: marketplaces.reduce((sum, item) => sum + item.totalNetProfit, 0),
  };
}

function recalculateReportWithCurrentData(
  sourceReport: RevenueReport,
  uploadSets: Partial<Record<MarketplaceId, MarketplaceUploadSet>>,
  hppEntries: HppEntry[]
): RevenueReport {
  const derivedByOrderKey = new Map<
    string,
    {
      revenue: number;
      hpp: number;
      platformFee: number;
      grossProfit: number;
      netProfit: number;
    }
  >();

  const marketplaceMetrics = new Map<
    MarketplaceId,
    {
      totalOrders: number;
      totalRevenue: number;
      totalHpp: number;
      totalGrossProfit: number;
      totalPlatformFees: number;
      totalNetProfit: number;
    }
  >();

  const ensureMarketplaceMetrics = (marketplace: MarketplaceId) => {
    const existing = marketplaceMetrics.get(marketplace);
    if (existing) return existing;
    const initial = {
      totalOrders: 0,
      totalRevenue: 0,
      totalHpp: 0,
      totalGrossProfit: 0,
      totalPlatformFees: 0,
      totalNetProfit: 0,
    };
    marketplaceMetrics.set(marketplace, initial);
    return initial;
  };

  const returnMapByMarketplace = new Map<MarketplaceId, Map<string, ReturnAggregate>>();
  for (const [marketplaceKey, set] of Object.entries(uploadSets)) {
    if (!set?.returnOrderFile?.transactions?.length) continue;
    const marketplace = marketplaceKey as MarketplaceId;
    returnMapByMarketplace.set(
      marketplace,
      aggregateReturnsByOrder(set.returnOrderFile.transactions)
    );
  }

  for (const order of sourceReport.orders) {
    const normalized = normalizeOrderId(order.orderId);
    const key = `${order.marketplace}:${normalized}`;

    let derived = derivedByOrderKey.get(key);
    if (!derived) {
      const set = uploadSets[order.marketplace];
      const lines = dedupeOrderLines(
        (set?.orderFiles ?? [])
          .flatMap((file) => file.rawOrders)
          .filter((row) => normalizeOrderId(row.orderId) === normalized)
      );

      if (lines.length === 0) {
        const grossProfit = order.revenue - order.hpp;
        derived = {
          revenue: order.revenue,
          hpp: order.hpp,
          platformFee: order.fees.totalPlatformFee,
          grossProfit,
          netProfit: order.netProfit,
        };
      } else {
        const totalRevenueFromLines = lines.reduce((sum, line) => sum + line.actualPrice * line.qty, 0);
        const totalRevenue =
          order.marketplace === "tokopedia" && order.revenue > 0
            ? order.revenue
            : (totalRevenueFromLines > 0 ? totalRevenueFromLines : order.revenue);
        const totalHpp = lines.reduce((sum, line) => {
          const hppUnit = lookupHppForLine(resolveLineSku(line), line.productName, hppEntries);
          return sum + hppUnit * line.qty;
        }, 0);
        const totalPlatformFee = order.fees.totalPlatformFee;
        const hasEmbeddedReturn = lines.reduce((sum, line) => {
          const returned = getRawValueByKey(line.rawData, [
            "sku quantity of return",
            "qty return",
            "jumlah retur",
            "returned quantity",
          ]);
          return sum + parseQtyLoose(returned);
        }, 0) > 0;
        const totalQty = lines.reduce((sum, line) => sum + Math.max(0, line.qty || 0), 0);
        const adjusted = applyReturnAdjustmentToMetrics({
          revenue: totalRevenue,
          hpp: totalHpp,
          platformFee: totalPlatformFee,
          baseQty: totalQty,
          returned: returnMapByMarketplace.get(order.marketplace)?.get(normalized),
          hasEmbeddedReturn,
        });
        const grossProfit = adjusted.revenue - adjusted.hpp;
        const netProfit = (order.settlementAmount ?? 0) !== 0
          ? (order.settlementAmount ?? 0) - adjusted.hpp
          : grossProfit - adjusted.platformFee;

        derived = {
          revenue: adjusted.revenue,
          hpp: adjusted.hpp,
          platformFee: adjusted.platformFee,
          grossProfit,
          netProfit,
        };
      }

      derivedByOrderKey.set(key, derived);
    }

    const metrics = ensureMarketplaceMetrics(order.marketplace);
    metrics.totalOrders += 1;
    metrics.totalRevenue += derived.revenue;
    metrics.totalHpp += derived.hpp;
    metrics.totalGrossProfit += derived.grossProfit;
    metrics.totalPlatformFees += derived.platformFee;
    metrics.totalNetProfit += derived.netProfit;
  }

  const marketplaces = sourceReport.marketplaces.map((summary) => {
    const metrics = marketplaceMetrics.get(summary.marketplace) ?? {
      totalOrders: 0,
      totalRevenue: 0,
      totalHpp: 0,
      totalGrossProfit: 0,
      totalPlatformFees: 0,
      totalNetProfit: 0,
    };

    return {
      ...summary,
      totalOrders: metrics.totalOrders,
      totalRevenue: metrics.totalRevenue,
      totalHpp: metrics.totalHpp,
      totalGrossProfit: metrics.totalGrossProfit,
      totalPlatformFees: metrics.totalPlatformFees,
      totalNetProfit: metrics.totalNetProfit,
      avgGrossMargin: metrics.totalRevenue > 0 ? (metrics.totalGrossProfit / metrics.totalRevenue) * 100 : 0,
      avgNetMargin: metrics.totalRevenue > 0 ? (metrics.totalNetProfit / metrics.totalRevenue) * 100 : 0,
    };
  });

  return {
    ...sourceReport,
    marketplaces,
    totalRevenue: marketplaces.reduce((sum, item) => sum + item.totalRevenue, 0),
    totalHpp: marketplaces.reduce((sum, item) => sum + item.totalHpp, 0),
    totalGrossProfit: marketplaces.reduce((sum, item) => sum + item.totalGrossProfit, 0),
    totalPlatformFees: marketplaces.reduce((sum, item) => sum + item.totalPlatformFees, 0),
    totalNetProfit: marketplaces.reduce((sum, item) => sum + item.totalNetProfit, 0),
  };
}

function SummaryCard({
  label,
  value,
  sub,
  color = "text-slate-800",
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)]/95 p-4 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
      <p className="text-[11px] text-[var(--text-subtle)] font-semibold uppercase tracking-[0.12em]">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--text-subtle)] mt-0.5">{sub}</p>}
    </div>
  );
}

function MarketplaceTable({ reportData }: { reportData: RevenueReport }) {
  if (!reportData) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            <th className="text-left py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">Marketplace</th>
            <th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">Pesanan</th>
            <th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">Revenue</th>
            <th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">Biaya Platform</th>
            <th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">Gross Profit</th>
            <th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">Net Profit</th>
            <th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">Net Margin</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {reportData.marketplaces.map((m) => (
            <tr key={m.marketplace} className="hover:bg-[var(--surface-soft)]">
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: MARKETPLACE_COLORS[m.marketplace] }}
                  />
                  <span className="font-medium text-slate-800">
                    {MARKETPLACE_LABELS[m.marketplace]}
                  </span>
                </div>
              </td>
              <td className="py-3 px-4 text-right text-slate-600">{formatNumber(m.totalOrders)}</td>
              <td className="py-3 px-4 text-right font-medium text-slate-800">
                {formatRupiah(m.totalRevenue)}
              </td>
              <td className="py-3 px-4 text-right text-red-500">
                -{formatRupiah(m.totalPlatformFees)}
              </td>
              <td className="py-3 px-4 text-right text-emerald-600">
                {formatRupiah(m.totalGrossProfit)}
              </td>
              <td
                className={`py-3 px-4 text-right font-semibold ${
                  m.totalNetProfit >= 0 ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {formatRupiah(m.totalNetProfit)}
              </td>
              <td
                className={`py-3 px-4 text-right ${
                  m.avgNetMargin >= 0 ? "text-emerald-600" : "text-red-500"
                }`}
              >
                {formatPercent(m.avgNetMargin)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
            <tr className="border-t-2 border-[var(--border-subtle)] bg-[var(--surface-muted)]">
            <td className="py-3 px-4 font-bold text-slate-800">Total</td>
            <td className="py-3 px-4 text-right font-bold text-slate-800">
              {formatNumber(reportData.marketplaces.reduce((s, m) => s + m.totalOrders, 0))}
            </td>
            <td className="py-3 px-4 text-right font-bold text-slate-800">
              {formatRupiah(reportData.totalRevenue)}
            </td>
            <td className="py-3 px-4 text-right font-bold text-red-500">
              -{formatRupiah(reportData.totalPlatformFees)}
            </td>
            <td className="py-3 px-4 text-right font-bold text-emerald-600">
              {formatRupiah(reportData.totalGrossProfit)}
            </td>
            <td
              className={`py-3 px-4 text-right font-bold ${
                reportData.totalNetProfit >= 0 ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {formatRupiah(reportData.totalNetProfit)}
            </td>
              <td className="py-3 px-4 text-right font-bold text-[var(--text-subtle)]">
              {formatPercent(
                reportData.totalRevenue > 0
                  ? (reportData.totalNetProfit / reportData.totalRevenue) * 100
                  : 0
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const OrderDetailTable = memo(function OrderDetailTable({
  orders,
  allOrders,
  uploadSets,
  hppEntries,
  marketplaceFilter,
  onMarketplaceFilterChange,
  onDeleteOrder,
  deletedOrderCount,
  onResetDeletedOrders,
}: {
  orders: CalculatedOrder[];
  allOrders: CalculatedOrder[];
  uploadSets: Partial<Record<MarketplaceId, MarketplaceUploadSet>>;
  hppEntries: HppEntry[];
  marketplaceFilter: "all" | MarketplaceId;
  onMarketplaceFilterChange: (value: "all" | MarketplaceId) => void;
  onDeleteOrder: (order: CalculatedOrder) => void;
  deletedOrderCount: number;
  onResetDeletedOrders: () => void;
}) {
  type SortKey =
    | "no"
    | "orderId"
    | "productName"
    | "sku"
    | "marketplace"
    | "qty"
    | "revenue"
    | "hpp"
    | "platformFee"
    | "netProfit"
    | "margin";

  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [profitFilter, setProfitFilter] = useState<string>("all");
  const [rowsPerPage, setRowsPerPage] = useState<number | "all">(20);
  const [sortKey, setSortKey] = useState<SortKey>("no");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [selectedOrder, setSelectedOrder] = useState<CalculatedOrder | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [hppMapTarget, setHppMapTarget] = useState<{
    orderId: string;
    marketplace: MarketplaceId;
    sku: string;
    productName: string;
  } | null>(null);
  const [hppOptionQuery, setHppOptionQuery] = useState("");
  const [selectedHppOptionKey, setSelectedHppOptionKey] = useState("");
  const setHppEntries = useAppStore((state) => state.setHppEntries);

  const normalizeSkuKey = (value: string) =>
    String(value ?? "")
      .trim()
      .replace(/^'+/, "")
      .replace(/\.0+$/, "")
      .replace(/[^a-zA-Z0-9]+/g, "")
      .toLowerCase();

  const masterHppOptions = useMemo(() => {
    const map = new Map<string, { key: string; masterProductName: string; masterSku: string; cost: number }>();

    for (const entry of hppEntries) {
      const masterProductName = (entry.masterProductName || entry.productName || "").trim();
      const masterSku = (entry.masterSku || entry.sku || "-").trim();
      if (!masterProductName) continue;

      const key = `${masterProductName.toLowerCase()}|${masterSku.toLowerCase()}|${entry.cost}`;
      if (!map.has(key)) {
        map.set(key, { key, masterProductName, masterSku, cost: entry.cost });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const name = a.masterProductName.localeCompare(b.masterProductName, "id", { sensitivity: "base" });
      if (name !== 0) return name;
      return a.masterSku.localeCompare(b.masterSku, "id", { sensitivity: "base" });
    });
  }, [hppEntries]);

  const filteredMasterHppOptions = useMemo(() => {
    const q = hppOptionQuery.trim().toLowerCase();
    if (!q) return masterHppOptions;
    return masterHppOptions.filter((option) =>
      `${option.masterProductName} ${option.masterSku}`.toLowerCase().includes(q)
    );
  }, [hppOptionQuery, masterHppOptions]);

  const marketplaceOptions = useMemo(
    () => {
      const counts = (Object.keys(MARKETPLACE_LABELS) as MarketplaceId[]).reduce(
        (acc, marketplace) => {
          acc[marketplace] = 0;
          return acc;
        },
        {} as Record<MarketplaceId, number>
      );

      for (const order of allOrders) {
        counts[order.marketplace] += 1;
      }

      return (Object.keys(MARKETPLACE_LABELS) as MarketplaceId[]).map((marketplace) => ({
        value: marketplace,
        label: MARKETPLACE_LABELS[marketplace],
        count: counts[marketplace],
        disabled: counts[marketplace] === 0,
      }));
    },
    [allOrders]
  );

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();

    return orders.filter((order) => {
      if (marketplaceFilter !== "all" && order.marketplace !== marketplaceFilter) return false;
      if (profitFilter === "profit" && order.netProfit < 0) return false;
      if (profitFilter === "loss" && order.netProfit >= 0) return false;

      if (!q) return true;

      return (
        order.orderId.toLowerCase().includes(q) ||
        order.productName.toLowerCase().includes(q) ||
        order.sku.toLowerCase().includes(q)
      );
    });
  }, [orders, query, marketplaceFilter, profitFilter]);

  const orderSequenceMap = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach((order, idx) => {
      const key = `${order.marketplace}:${normalizeOrderId(order.orderId)}`;
      if (!map.has(key)) {
        map.set(key, idx + 1);
      }
    });
    return map;
  }, [orders]);

  const handleCopyOrderId = async (orderId: string) => {
    try {
      await navigator.clipboard.writeText(orderId);
      setCopiedOrderId(orderId);
      window.setTimeout(() => {
        setCopiedOrderId((current) => (current === orderId ? null : current));
      }, 1500);
    } catch {
      setCopiedOrderId(null);
    }
  };

  const openHppMapper = (row: {
    order: CalculatedOrder;
  }) => {
    setHppMapTarget({
      orderId: row.order.orderId,
      marketplace: row.order.marketplace,
      sku: row.order.sku,
      productName: row.order.productName,
    });
    setHppOptionQuery("");
    setSelectedHppOptionKey("");
  };

  const openHppMapperForOrderSku = (target: {
    orderId: string;
    marketplace: MarketplaceId;
    sku: string;
    productName: string;
  }) => {
    setHppMapTarget({
      orderId: target.orderId,
      marketplace: target.marketplace,
      sku: target.sku === "-" ? "" : target.sku,
      productName: target.productName,
    });
    setHppOptionQuery("");
    setSelectedHppOptionKey("");
  };

  const applyHppMapping = () => {
    if (!hppMapTarget || !selectedHppOptionKey) return;
    const selectedOption = masterHppOptions.find((option) => option.key === selectedHppOptionKey);
    if (!selectedOption) return;

    const targetSku = String(hppMapTarget.sku ?? "").trim();
    const targetProductName = String(hppMapTarget.productName ?? "").trim();
    const nextEntries = [...hppEntries];

    if (targetSku) {
      const normalizedTargetSku = normalizeSkuKey(targetSku);
      const existingIndex = nextEntries.findIndex((entry) => normalizeSkuKey(entry.sku) === normalizedTargetSku);
      const mappedEntry: HppEntry = {
        sku: targetSku,
        productName: targetProductName || selectedOption.masterProductName,
        masterProductName: selectedOption.masterProductName,
        masterSku: selectedOption.masterSku === "-" ? "" : selectedOption.masterSku,
        cost: selectedOption.cost,
      };

      if (existingIndex >= 0) {
        nextEntries[existingIndex] = { ...nextEntries[existingIndex], ...mappedEntry };
      } else {
        nextEntries.push(mappedEntry);
      }
    } else {
      const normalizedProductName = targetProductName.toLowerCase();
      const existingIndex = nextEntries.findIndex(
        (entry) =>
          !String(entry.sku ?? "").trim() &&
          String(entry.productName ?? "").trim().toLowerCase() === normalizedProductName
      );

      const mappedEntry: HppEntry = {
        sku: "",
        productName: targetProductName || selectedOption.masterProductName,
        masterProductName: selectedOption.masterProductName,
        masterSku: selectedOption.masterSku === "-" ? "" : selectedOption.masterSku,
        cost: selectedOption.cost,
      };

      if (existingIndex >= 0) {
        nextEntries[existingIndex] = { ...nextEntries[existingIndex], ...mappedEntry };
      } else {
        nextEntries.push(mappedEntry);
      }
    }

    setHppEntries(nextEntries);
    setHppMapTarget(null);
  };

  const selectedOrderLines = useMemo(() => {
    if (!selectedOrder) return [];

    const set = uploadSets[selectedOrder.marketplace];
    const normalized = normalizeOrderId(selectedOrder.orderId);
    const lines = (set?.orderFiles ?? [])
      .flatMap((file) => file.rawOrders)
      .filter((row) => normalizeOrderId(row.orderId) === normalized);

    if (lines.length > 0) {
      const deduped = dedupeOrderLines(lines);
      const hasEmbeddedReturn = getReturnedQtyFromOrderLines(deduped) > 0;

      const transactions = set?.returnOrderFile?.transactions ?? [];
      const returnedQtyBySku = new Map<string, number>();
      let returnedQtyTotal = 0;
      for (const tx of transactions) {
        if (normalizeOrderId(tx.orderId) !== normalized) continue;
        const qty = Math.max(0, tx.returnQuantity || 0);
        returnedQtyTotal += qty;
        const skuKey = normalizeSkuToken(tx.sellerSku || tx.skuId || tx.skuName || tx.productName);
        if (!skuKey) continue;
        returnedQtyBySku.set(skuKey, (returnedQtyBySku.get(skuKey) ?? 0) + qty);
      }

      return adjustLinesWithReturnQty(
        deduped,
        returnedQtyBySku,
        returnedQtyTotal,
        hasEmbeddedReturn
      );
    }

    const fallback: RawOrder = {
      orderId: selectedOrder.orderId,
      orderDate: selectedOrder.orderDate,
      productName: selectedOrder.productName,
      sku: selectedOrder.sku,
      qty: selectedOrder.qty,
      sellingPrice: selectedOrder.sellingPrice,
      actualPrice: selectedOrder.actualPrice,
      settlementAmount: selectedOrder.settlementAmount,
      reportedCommission: selectedOrder.reportedCommission,
      shippingFeeByseller: selectedOrder.shippingFeeByseller,
      shippingSubsidy: selectedOrder.shippingSubsidy,
      voucherBySeller: selectedOrder.voucherBySeller,
      voucherByPlatform: selectedOrder.voucherByPlatform,
      affiliateCommission: selectedOrder.affiliateCommission,
      status: selectedOrder.status,
      marketplace: selectedOrder.marketplace,
      rawData: selectedOrder.rawData,
    };
    return [fallback];
  }, [selectedOrder, uploadSets]);

  const orderTotalQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    const returnQtyByOrderMap = new Map<string, number>();
    const returnQtyByOrderSkuMap = new Map<string, Map<string, number>>();

    for (const [marketplace, set] of Object.entries(uploadSets)) {
      const transactions = set?.returnOrderFile?.transactions ?? [];
      for (const tx of transactions) {
        const orderId = normalizeOrderId(tx.orderId);
        if (!orderId) continue;
        const key = `${marketplace}:${orderId}`;
        const qty = Math.max(0, tx.returnQuantity || 0);
        returnQtyByOrderMap.set(key, (returnQtyByOrderMap.get(key) ?? 0) + qty);

        const skuKey = normalizeSkuToken(tx.sellerSku || tx.skuId || tx.skuName || tx.productName);
        if (!skuKey) continue;
        const skuMap = returnQtyByOrderSkuMap.get(key) ?? new Map<string, number>();
        skuMap.set(skuKey, (skuMap.get(skuKey) ?? 0) + qty);
        returnQtyByOrderSkuMap.set(key, skuMap);
      }
    }

    for (const order of orders) {
      const set = uploadSets[order.marketplace];
      const normalized = normalizeOrderId(order.orderId);
      const lines = (set?.orderFiles ?? [])
        .flatMap((file) => file.rawOrders)
        .filter((row) => normalizeOrderId(row.orderId) === normalized);

      const deduped = dedupeOrderLines(lines);
      const key = `${order.marketplace}:${normalized}`;
      const hasEmbeddedReturn = getReturnedQtyFromOrderLines(deduped) > 0;
      const adjustedLines = adjustLinesWithReturnQty(
        deduped,
        new Map(returnQtyByOrderSkuMap.get(key) ?? []),
        returnQtyByOrderMap.get(key) ?? 0,
        hasEmbeddedReturn
      );

      const qtyFromLines = adjustedLines.reduce((sum, line) => sum + line.qty, 0);
      map.set(key, qtyFromLines > 0 ? qtyFromLines : Math.max(0, order.qty - (returnQtyByOrderMap.get(key) ?? 0)));
    }

    return map;
  }, [orders, uploadSets]);

  const orderSkuCountMap = useMemo(() => {
    const map = new Map<string, number>();

    for (const order of orders) {
      const set = uploadSets[order.marketplace];
      const normalized = normalizeOrderId(order.orderId);
      const lines = dedupeOrderLines(
        (set?.orderFiles ?? [])
          .flatMap((file) => file.rawOrders)
          .filter((row) => normalizeOrderId(row.orderId) === normalized)
      );

      const skuSet = new Set(
        lines
          .map((line) => resolveLineSku(line).trim().toLowerCase())
          .filter(Boolean)
      );

      const skuCount = skuSet.size > 0 ? skuSet.size : 1;
      map.set(`${order.marketplace}:${normalized}`, skuCount);
    }

    return map;
  }, [orders, uploadSets]);

  const orderDerivedMetricsMap = useMemo(() => {
    const map = new Map<string, {
      totalQty: number;
      totalRevenue: number;
      totalHpp: number;
      totalPlatformFee: number;
      netProfit: number;
      netMargin: number;
    }>();
    const returnQtyByOrderMap = new Map<string, number>();
    const returnQtyByOrderSkuMap = new Map<string, Map<string, number>>();

    for (const [marketplace, set] of Object.entries(uploadSets)) {
      const transactions = set?.returnOrderFile?.transactions ?? [];
      for (const tx of transactions) {
        const orderId = normalizeOrderId(tx.orderId);
        if (!orderId) continue;
        const key = `${marketplace}:${orderId}`;
        const qty = Math.max(0, tx.returnQuantity || 0);
        returnQtyByOrderMap.set(key, (returnQtyByOrderMap.get(key) ?? 0) + qty);

        const skuKey = normalizeSkuToken(tx.sellerSku || tx.skuId || tx.skuName || tx.productName);
        if (!skuKey) continue;
        const skuMap = returnQtyByOrderSkuMap.get(key) ?? new Map<string, number>();
        skuMap.set(skuKey, (skuMap.get(skuKey) ?? 0) + qty);
        returnQtyByOrderSkuMap.set(key, skuMap);
      }
    }

    for (const order of orders) {
      const set = uploadSets[order.marketplace];
      const normalized = normalizeOrderId(order.orderId);
      const lines = dedupeOrderLines(
        (set?.orderFiles ?? [])
          .flatMap((file) => file.rawOrders)
          .filter((row) => normalizeOrderId(row.orderId) === normalized)
      );

      if (lines.length === 0) {
        map.set(`${order.marketplace}:${normalized}`, {
          totalQty: order.qty,
          totalPlatformFee: order.fees.totalPlatformFee,
          netProfit: order.netProfit,
          netMargin: order.netMargin,
          totalHpp: order.hpp,
          totalRevenue: order.revenue,
        });
        continue;
      }

      const key = `${order.marketplace}:${normalized}`;
      const hasEmbeddedReturn = getReturnedQtyFromOrderLines(lines) > 0;
      const adjustedLines = adjustLinesWithReturnQty(
        lines,
        new Map(returnQtyByOrderSkuMap.get(key) ?? []),
        returnQtyByOrderMap.get(key) ?? 0,
        hasEmbeddedReturn
      );

      const totalQty = adjustedLines.reduce((sum, line) => sum + line.qty, 0);
      const totalRevenueFromLines = adjustedLines.reduce((sum, line) => sum + line.actualPrice * line.qty, 0);
      const totalRevenue =
        order.marketplace === "tokopedia" && order.revenue > 0
          ? order.revenue
          : (totalRevenueFromLines > 0 ? totalRevenueFromLines : order.revenue);
      const totalHpp = adjustedLines.reduce((sum, line) => {
        const hppUnit = lookupHppForLine(resolveLineSku(line), line.productName, hppEntries);
        return sum + hppUnit * line.qty;
      }, 0);
      const totalPlatformFee = order.fees.totalPlatformFee;

      const netProfit = (order.settlementAmount ?? 0) !== 0
        ? (order.settlementAmount ?? 0) - totalHpp
        : (totalRevenue - totalHpp) - totalPlatformFee;
      const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      map.set(`${order.marketplace}:${normalized}`, {
        totalQty: totalQty > 0 ? totalQty : order.qty,
        totalPlatformFee,
        netProfit,
        netMargin,
        totalHpp,
        totalRevenue,
      });
    }

    return map;
  }, [orders, uploadSets, hppEntries]);

  const returnQtyBadgeMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const [marketplace, set] of Object.entries(uploadSets)) {
      const transactions = set?.returnOrderFile?.transactions ?? [];
      for (const tx of transactions) {
        const key = `${marketplace}:${normalizeOrderId(tx.orderId)}`;
        if (!normalizeOrderId(tx.orderId)) continue;
        map.set(key, (map.get(key) ?? 0) + Math.max(0, tx.returnQuantity || 0));
      }
    }
    return map;
  }, [uploadSets]);

  const filteredOrderRows = useMemo(() => {
    return filteredOrders.map((order) => {
      const normalized = normalizeOrderId(order.orderId);
      const qtyKey = `${order.marketplace}:${normalized}`;
      const isAggregated = shouldUseAggregatedOrderView(order.marketplace);
      const derived = isAggregated ? orderDerivedMetricsMap.get(qtyKey) : undefined;

      return {
        order,
        rowNumber: orderSequenceMap.get(qtyKey) ?? 0,
        displayQty: derived?.totalQty ?? (isAggregated ? (orderTotalQtyMap.get(qtyKey) ?? order.qty) : order.qty),
        returnQty: returnQtyBadgeMap.get(qtyKey) ?? 0,
        skuCount: orderSkuCountMap.get(qtyKey) ?? 1,
        displayRevenue: derived?.totalRevenue ?? order.revenue,
        displayHpp: derived?.totalHpp ?? order.hpp,
        displayPlatformFee: derived?.totalPlatformFee ?? order.fees.totalPlatformFee,
        displayNetProfit: derived?.netProfit ?? order.netProfit,
        displayNetMargin: derived?.netMargin ?? order.netMargin,
      };
    });
  }, [filteredOrders, orderDerivedMetricsMap, orderSequenceMap, orderSkuCountMap, orderTotalQtyMap, returnQtyBadgeMap]);

  const sortedOrderRows = useMemo(() => {
    const rows = [...filteredOrderRows];
    const direction = sortDirection === "asc" ? 1 : -1;

    rows.sort((a, b) => {
      const marketplaceLabelA = MARKETPLACE_LABELS[a.order.marketplace];
      const marketplaceLabelB = MARKETPLACE_LABELS[b.order.marketplace];

      const valueByKey: Record<SortKey, [string | number, string | number]> = {
        no: [a.rowNumber, b.rowNumber],
        orderId: [a.order.orderId, b.order.orderId],
        productName: [a.order.productName, b.order.productName],
        sku: [a.order.sku, b.order.sku],
        marketplace: [marketplaceLabelA, marketplaceLabelB],
        qty: [a.displayQty, b.displayQty],
        revenue: [a.displayRevenue, b.displayRevenue],
        hpp: [a.displayHpp, b.displayHpp],
        platformFee: [a.displayPlatformFee, b.displayPlatformFee],
        netProfit: [a.displayNetProfit, b.displayNetProfit],
        margin: [a.displayNetMargin, b.displayNetMargin],
      };

      const [left, right] = valueByKey[sortKey];

      if (typeof left === "number" && typeof right === "number") {
        if (left === right) return a.order.orderId.localeCompare(b.order.orderId);
        return (left - right) * direction;
      }

      const strCompare = String(left ?? "").localeCompare(String(right ?? ""), "id", { sensitivity: "base" });
      if (strCompare === 0) return a.order.orderId.localeCompare(b.order.orderId);
      return strCompare * direction;
    });

    return rows;
  }, [filteredOrderRows, sortDirection, sortKey]);

  const orderTableTotals = useMemo(() => {
    const totals = sortedOrderRows.reduce(
      (acc, row) => {
        acc.qty += row.displayQty;
        acc.revenue += row.displayRevenue;
        acc.hpp += row.displayHpp;
        acc.platformFee += row.displayPlatformFee;
        acc.netProfit += row.displayNetProfit;
        return acc;
      },
      { qty: 0, revenue: 0, hpp: 0, platformFee: 0, netProfit: 0 }
    );

    return {
      ...totals,
      margin: totals.revenue > 0 ? (totals.netProfit / totals.revenue) * 100 : 0,
    };
  }, [sortedOrderRows]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "no" ? "asc" : "desc");
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />;
    return sortDirection === "asc"
      ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
      : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />;
  };

  useEffect(() => {
    setPage(1);
  }, [query, marketplaceFilter, profitFilter, sortKey, sortDirection, rowsPerPage]);

  const effectivePerPage = rowsPerPage === "all" ? Math.max(1, sortedOrderRows.length) : rowsPerPage;
  const totalPages = rowsPerPage === "all" ? 1 : Math.max(1, Math.ceil(sortedOrderRows.length / effectivePerPage));
  const paged =
    rowsPerPage === "all"
      ? sortedOrderRows
      : sortedOrderRows.slice((page - 1) * effectivePerPage, page * effectivePerPage);

  const modalSummary = useMemo(() => {
    if (!selectedOrder) {
      return {
        totalQty: 0,
        totalRevenue: 0,
        totalHpp: 0,
        totalPlatformFee: 0,
        totalNetProfit: 0,
      };
    }

    const totalRevenueFromLines = selectedOrderLines.reduce(
      (sum, line) => sum + line.actualPrice * line.qty,
      0
    );

    const totalQty = selectedOrderLines.reduce((sum, line) => sum + line.qty, 0);
    const totalRevenue =
      selectedOrder.marketplace === "tokopedia" && selectedOrder.revenue > 0
        ? selectedOrder.revenue
        : (totalRevenueFromLines > 0 ? totalRevenueFromLines : selectedOrder.revenue);

    const totalHpp = selectedOrderLines.reduce((sum, line) => {
      const hppUnit = lookupHppForLine(resolveLineSku(line), line.productName, hppEntries);
      return sum + hppUnit * line.qty;
    }, 0);

    const totalPlatformFee = selectedOrderLines.reduce((sum, line) => {
      const lineRevenue = line.actualPrice * line.qty;
      const ratio =
        totalRevenueFromLines > 0
          ? lineRevenue / totalRevenueFromLines
          : 1 / Math.max(1, selectedOrderLines.length);
      return sum + selectedOrder.fees.totalPlatformFee * ratio;
    }, 0);

    const totalNetProfit = selectedOrderLines.reduce((sum, line) => {
      const lineRevenue = line.actualPrice * line.qty;
      const ratio =
        totalRevenueFromLines > 0
          ? lineRevenue / totalRevenueFromLines
          : 1 / Math.max(1, selectedOrderLines.length);
      const resolvedSku = resolveLineSku(line);
      const hppUnit = lookupHppForLine(resolvedSku, line.productName, hppEntries);
      const hpp = hppUnit * line.qty;
      const allocatedFee = selectedOrder.fees.totalPlatformFee * ratio;
      const allocatedSettlement = (selectedOrder.settlementAmount ?? 0) * ratio;
      const allocatedRevenue = totalRevenue * ratio;
      const grossProfit = allocatedRevenue - hpp;
      const lineNetProfit =
        (selectedOrder.settlementAmount ?? 0) !== 0
          ? allocatedSettlement - hpp
          : grossProfit - allocatedFee;
      return sum + lineNetProfit;
    }, 0);

    return {
      totalQty,
      totalRevenue,
      totalHpp,
      totalPlatformFee,
      totalNetProfit,
    };
  }, [selectedOrder, selectedOrderLines, hppEntries]);

  const selectedOrderSkuBreakdowns = useMemo(() => {
    if (!selectedOrder || selectedOrderLines.length === 0) return [];

    const normalizeSku = (value: string) =>
      String(value ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

    const totalRevenueFromLines = selectedOrderLines.reduce(
      (sum, line) => sum + line.actualPrice * line.qty,
      0
    );
    const totalRevenue =
      selectedOrder.marketplace === "tokopedia" && selectedOrder.revenue > 0
        ? selectedOrder.revenue
        : (totalRevenueFromLines > 0 ? totalRevenueFromLines : selectedOrder.revenue);

    const groups = new Map<
      string,
      {
        sku: string;
        products: Set<string>;
        qty: number;
        baseRevenue: number;
        hpp: number;
        hppUnitAvg: number;
        masterSkus: Set<string>;
      }
    >();

    for (const line of selectedOrderLines) {
      const resolvedSku = resolveLineSku(line);
      const key = normalizeSku(resolvedSku) || `product:${line.productName.toLowerCase()}`;
      const existing = groups.get(key) ?? {
        sku: resolvedSku || "-",
        products: new Set<string>(),
        qty: 0,
        baseRevenue: 0,
        hpp: 0,
        hppUnitAvg: 0,
        masterSkus: new Set<string>(),
      };

      const lineRevenue = line.actualPrice * line.qty;
      const hppMatch = lookupHppMatchForLine(resolvedSku, line.productName, hppEntries);
      const hppUnit = hppMatch.cost;
      const lineHpp = hppUnit * line.qty;
      const mappedMasterSku = (hppMatch.matchedEntry?.masterSku || hppMatch.matchedEntry?.sku || "").trim();

      existing.products.add(line.productName || "-");
      existing.qty += line.qty;
      existing.baseRevenue += lineRevenue;
      existing.hpp += lineHpp;
      existing.hppUnitAvg = existing.qty > 0 ? existing.hpp / existing.qty : 0;
      if (mappedMasterSku) {
        existing.masterSkus.add(mappedMasterSku);
      }

      groups.set(key, existing);
    }

    return Array.from(groups.values()).map((group) => {
      const ratio = totalRevenueFromLines > 0
        ? group.baseRevenue / totalRevenueFromLines
        : 1 / Math.max(1, groups.size);
      const allocatedRevenue = totalRevenue * ratio;
      const allocatedFee = modalSummary.totalPlatformFee * ratio;
      const allocatedSettlement = (selectedOrder.settlementAmount ?? 0) * ratio;
      const grossProfit = allocatedRevenue - group.hpp;
      const netProfit = (selectedOrder.settlementAmount ?? 0) !== 0
        ? allocatedSettlement - group.hpp
        : grossProfit - allocatedFee;
      const grossMargin = allocatedRevenue > 0 ? (grossProfit / allocatedRevenue) * 100 : 0;
      const netMargin = allocatedRevenue > 0 ? (netProfit / allocatedRevenue) * 100 : 0;

      return {
        ...group,
        products: Array.from(group.products),
        masterSkus: Array.from(group.masterSkus),
        allocatedRevenue,
        allocatedFee,
        allocatedSettlement,
        grossProfit,
        netProfit,
        grossMargin,
        netMargin,
      };
    });
  }, [selectedOrder, selectedOrderLines, hppEntries, modalSummary]);

  return (
    <div>
      <div className="px-4 py-4 border-b border-[var(--border-subtle)] bg-gradient-to-r from-[var(--surface-muted)] to-[var(--surface-soft)] flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari order ID, produk, atau SKU"
              className="field-input pl-9 pr-3 py-2.5"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-[var(--surface)] border border-[var(--border-subtle)] px-3 py-1 text-xs text-[var(--foreground)]">
              {filteredOrders.length} order ditemukan
            </span>
            <span className="inline-flex items-center rounded-full bg-[var(--surface)] border border-[var(--border-subtle)] px-3 py-1 text-xs text-[var(--foreground)]">
              Klik baris untuk detail
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={marketplaceFilter}
            onChange={(e) => onMarketplaceFilterChange(e.target.value as "all" | MarketplaceId)}
            className="field-input w-auto"
          >
            <option value="all">Semua marketplace</option>
            {marketplaceOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label} ({formatNumber(option.count)})
              </option>
            ))}
          </select>
          <select
            value={profitFilter}
            onChange={(e) => setProfitFilter(e.target.value)}
            className="field-input w-auto"
          >
            <option value="all">Semua profit</option>
            <option value="profit">Profit (+)</option>
            <option value="loss">Rugi (-)</option>
          </select>
          <select
            value={String(rowsPerPage)}
            onChange={(e) => {
              const value = e.target.value;
              setRowsPerPage(value === "all" ? "all" : Number(value));
            }}
            className="field-input w-auto"
          >
            <option value="5">5 rows</option>
            <option value="10">10 rows</option>
            <option value="20">20 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
            <option value="all">All rows</option>
          </select>
          {deletedOrderCount > 0 && (
            <button
              type="button"
              onClick={onResetDeletedOrders}
              className="border border-amber-300 bg-amber-50 text-amber-700 rounded-lg px-3 py-2 text-sm font-medium hover:bg-amber-100"
            >
              Pulihkan {deletedOrderCount} order
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-b-xl border-t border-[var(--border-subtle)]">
        <table className="w-full min-w-[1260px] text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/95 backdrop-blur">
              <th className="text-left py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">
                <button type="button" onClick={() => toggleSort("no")} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                  No <SortIcon column="no" />
                </button>
              </th>
              <th className="text-left py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">
                <button type="button" onClick={() => toggleSort("orderId")} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                  Order ID <SortIcon column="orderId" />
                </button>
              </th>
              <th className="text-left py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">
                <button type="button" onClick={() => toggleSort("productName")} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                  Produk <SortIcon column="productName" />
                </button>
              </th>
              <th className="text-left py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">
                <button type="button" onClick={() => toggleSort("sku")} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                  SKU <SortIcon column="sku" />
                </button>
              </th>
              <th className="text-left py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">
                <button type="button" onClick={() => toggleSort("marketplace")} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                  Marketplace <SortIcon column="marketplace" />
                </button>
              </th>
              <th className="text-right py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">
                <button type="button" onClick={() => toggleSort("qty")} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                  Qty <SortIcon column="qty" />
                </button>
              </th>
              <th className="text-right py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">
                <button type="button" onClick={() => toggleSort("revenue")} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                  Revenue <SortIcon column="revenue" />
                </button>
              </th>
              <th className="text-right py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">
                <button type="button" onClick={() => toggleSort("hpp")} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                  HPP <SortIcon column="hpp" />
                </button>
              </th>
              <th className="text-right py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">
                <button type="button" onClick={() => toggleSort("platformFee")} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                  Biaya Platform <SortIcon column="platformFee" />
                </button>
              </th>
              <th className="text-right py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">
                <button type="button" onClick={() => toggleSort("netProfit")} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                  Net Profit <SortIcon column="netProfit" />
                </button>
              </th>
              <th className="text-right py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">
                <button type="button" onClick={() => toggleSort("margin")} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
                  Margin <SortIcon column="margin" />
                </button>
              </th>
              <th className="text-center py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {paged.map((row, index) => (
              <tr
                key={`${row.order.marketplace}-${row.order.orderId}`}
                className={`cursor-pointer transition-colors ${index % 2 === 0 ? "bg-[var(--surface)]" : "bg-[var(--surface-muted)]"} hover:bg-[var(--hover-strong)]`}
                onClick={() => setSelectedOrder(row.order)}
              >
                <td className="py-2 px-3 text-slate-500">{row.rowNumber}</td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[var(--foreground)] whitespace-nowrap">{row.order.orderId}</span>
                    {row.skuCount > 1 && (
                      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        {row.skuCount} SKU
                      </span>
                    )}
                    {row.returnQty > 0 && (
                      <span className="inline-flex items-center rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                        Retur {formatNumber(row.returnQty)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCopyOrderId(row.order.orderId);
                      }}
                      className="inline-flex items-center justify-center rounded-md border border-[var(--border-subtle)] p-1 text-[var(--text-subtle)] hover:bg-[var(--surface)] hover:text-[var(--foreground)] transition"
                      title="Copy Order ID"
                    >
                      {copiedOrderId === row.order.orderId ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </td>
                <td className="py-2 px-3 text-[var(--foreground)] max-w-[200px] truncate">{row.order.productName}</td>
                <td className="py-2 px-3 font-mono text-[var(--text-subtle)] max-w-[180px] truncate">{row.order.sku || "-"}</td>
                <td className="py-2 px-3">
                  <span
                    className="px-1.5 py-0.5 rounded text-white text-xs font-medium"
                    style={{ backgroundColor: MARKETPLACE_COLORS[row.order.marketplace] }}
                  >
                    {MARKETPLACE_LABELS[row.order.marketplace]}
                  </span>
                </td>
                <td className="py-2 px-3 text-right text-[var(--foreground)]">{formatNumber(row.displayQty)}</td>
                <td className="py-2 px-3 text-right text-[var(--foreground)]">{formatRupiah(row.displayRevenue)}</td>
                <td className="py-2 px-3 text-right text-[var(--text-subtle)]">
                  <div className="inline-flex items-center gap-2">
                    <span>{formatRupiah(row.displayHpp)}</span>
                    {row.displayHpp <= 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openHppMapper(row);
                        }}
                        className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-100"
                      >
                        Pilih HPP
                      </button>
                    )}
                  </div>
                </td>
                <td className="py-2 px-3 text-right text-red-500">
                  -{formatRupiah(row.displayPlatformFee)}
                </td>
                <td
                  className={`py-2 px-3 text-right font-medium ${
                    row.displayNetProfit >= 0 ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {formatRupiah(row.displayNetProfit)}
                </td>
                <td
                  className={`py-2 px-3 text-right ${
                    row.displayNetMargin >= 0 ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {formatPercent(row.displayNetMargin)}
                </td>
                <td className="py-2 px-3 text-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteOrder(row.order);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-100"
                    title="Hapus order ini dari perhitungan"
                  >
                    <Trash2 size={12} />
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={12} className="py-6 px-3 text-center text-sm text-slate-500">
                  Tidak ada data yang cocok dengan filter.
                </td>
              </tr>
            )}
          </tbody>
          {sortedOrderRows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                <td className="py-3 px-3 text-slate-400">-</td>
                <td className="py-3 px-3 font-semibold text-slate-800" colSpan={4}>Total (Reactive)</td>
                <td className="py-3 px-3 text-right font-semibold text-slate-700">{formatNumber(orderTableTotals.qty)}</td>
                <td className="py-3 px-3 text-right font-semibold text-slate-800">{formatRupiah(orderTableTotals.revenue)}</td>
                <td className="py-3 px-3 text-right font-semibold text-slate-700">{formatRupiah(orderTableTotals.hpp)}</td>
                <td className="py-3 px-3 text-right font-semibold text-red-500">-{formatRupiah(orderTableTotals.platformFee)}</td>
                <td className={`py-3 px-3 text-right font-semibold ${orderTableTotals.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {formatRupiah(orderTableTotals.netProfit)}
                </td>
                <td className={`py-3 px-3 text-right font-semibold ${orderTableTotals.margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {formatPercent(orderTableTotals.margin)}
                </td>
                <td className="py-3 px-3 text-center text-slate-400">-</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {filteredOrders.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--surface-muted)]">
          <p className="text-xs text-[var(--text-subtle)]">
            {filteredOrders.length} pesanan{filteredOrders.length !== orders.length ? ` dari ${orders.length}` : ""} &bull; halaman {page}/{totalPages} &bull; {rowsPerPage === "all" ? "all" : rowsPerPage} rows
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg disabled:opacity-40 hover:bg-[var(--surface)]"
            >
              &larr; Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg disabled:opacity-40 hover:bg-[var(--surface)]"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => setSelectedOrder(null)}>
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4 rounded-t-2xl bg-[var(--surface-soft)]">
              <div>
                <h3 className="text-base font-semibold text-[var(--text)]">Detail Pesanan</h3>
                <p className="text-xs text-[var(--text-subtle)] font-mono mt-0.5">{selectedOrder.orderId}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-subtle)] hover:bg-[var(--surface)]"
              >
                <X size={13} /> Tutup
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-[var(--text-subtle)]">Produk:</span> <span className="text-[var(--text)]">{selectedOrderLines.length} produk</span></div>
                <div><span className="text-[var(--text-subtle)]">SKU:</span> <span className="font-mono text-[var(--text)]">{selectedOrderLines.length > 1 ? "Multi SKU" : selectedOrder.sku || "-"}</span></div>
                <div><span className="text-[var(--text-subtle)]">Qty:</span> <span className="text-[var(--text)]">{modalSummary.totalQty}</span></div>
                <div><span className="text-[var(--text-subtle)]">Marketplace:</span> <span className="text-[var(--text)]">{MARKETPLACE_LABELS[selectedOrder.marketplace]}</span></div>
                <div><span className="text-[var(--text-subtle)]">Revenue:</span> <span className="text-[var(--text)]">{formatRupiah(modalSummary.totalRevenue)}</span></div>
                <div><span className="text-[var(--text-subtle)]">HPP:</span> <span className="text-cyan-300 font-medium">{formatRupiah(modalSummary.totalHpp)}</span></div>
                <div><span className="text-[var(--text-subtle)]">Biaya Platform:</span> <span className="text-red-400">-{formatRupiah(modalSummary.totalPlatformFee)}</span></div>
                <div><span className="text-[var(--text-subtle)]">Net Profit:</span> <span className={modalSummary.totalNetProfit >= 0 ? "text-emerald-400" : "text-red-400"}>{formatRupiah(modalSummary.totalNetProfit)}</span></div>
              </div>

              <div>
                <p className="text-xs font-semibold text-[var(--text-subtle)] mb-2">Detail Produk per Order</p>
                <div className="space-y-2">
                  {selectedOrderSkuBreakdowns.map((skuDetail, index) => {
                    const notMapped = skuDetail.hpp <= 0;
                    return (
                      <details
                        key={`${selectedOrder.orderId}-${skuDetail.sku}-${index}`}
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-soft)]"
                        open={index === 0}
                      >
                        <summary className="cursor-pointer list-none px-3 py-2.5 flex items-center justify-between text-sm">
                          <span className="text-[var(--text)] font-medium">SKU {index + 1}: {skuDetail.sku || "-"}</span>
                          <span className="text-[var(--text-subtle)] text-xs">{skuDetail.products.length} produk</span>
                        </summary>
                        <div className="border-t border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div><span className="text-[var(--text-subtle)]">Qty:</span> <span className="text-[var(--text)]">{skuDetail.qty}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Revenue:</span> <span className="text-[var(--text)]">{formatRupiah(skuDetail.allocatedRevenue)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">HPP / unit:</span> <span className="text-cyan-300">{formatRupiah(skuDetail.hppUnitAvg)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Total HPP:</span> <span className="text-cyan-300">{formatRupiah(skuDetail.hpp)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Alokasi Biaya Platform:</span> <span className="text-red-400">-{formatRupiah(skuDetail.allocatedFee)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Gross Profit:</span> <span className={skuDetail.grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}>{formatRupiah(skuDetail.grossProfit)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Net Profit:</span> <span className={skuDetail.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}>{formatRupiah(skuDetail.netProfit)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Net Margin:</span> <span className={skuDetail.netMargin >= 0 ? "text-emerald-400" : "text-red-400"}>{formatPercent(skuDetail.netMargin)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Gross Margin:</span> <span className={skuDetail.grossMargin >= 0 ? "text-emerald-400" : "text-red-400"}>{formatPercent(skuDetail.grossMargin)}</span></div>
                          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                            <span className="text-[var(--text-subtle)]">Master SKU:</span>
                            <span className="text-[var(--text)] font-mono">{skuDetail.masterSkus.length > 0 ? skuDetail.masterSkus.join(", ") : "-"}</span>
                            {notMapped && (
                              <>
                                <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                  Belum termapping
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openHppMapperForOrderSku({
                                      orderId: selectedOrder.orderId,
                                      marketplace: selectedOrder.marketplace,
                                      sku: skuDetail.sku || "",
                                      productName: skuDetail.products[0] || selectedOrder.productName || "",
                                    })
                                  }
                                  className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100"
                                >
                                  Pilih HPP
                                </button>
                              </>
                            )}
                          </div>
                          <div className="sm:col-span-2"><span className="text-[var(--text-subtle)]">Produk:</span> <span className="text-[var(--text)]">{skuDetail.products.join(", ")}</span></div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-[var(--text-subtle)] mb-2">Data Mentah</p>
                <div className="rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {Object.entries(selectedOrder.rawData ?? {}).length > 0 ? (
                        Object.entries(selectedOrder.rawData ?? {}).map(([key, value]) => (
                          <tr key={key}>
                            <td className="w-1/3 bg-[var(--surface-soft)] px-3 py-2 text-[var(--text-subtle)]">{key}</td>
                            <td className="px-3 py-2 text-[var(--text)] break-all">{String(value ?? "-")}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-3 py-3 text-[var(--text-subtle)]">Data mentah tidak tersedia untuk pesanan ini.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {hppMapTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => setHppMapTarget(null)}>
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4 bg-[var(--surface-soft)] rounded-t-2xl">
              <div>
                <h3 className="text-base font-semibold text-[var(--text)]">Pilih Master HPP</h3>
                <p className="text-xs text-[var(--text-subtle)] mt-0.5">
                  Order {hppMapTarget.orderId} • {hppMapTarget.sku || "SKU kosong"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHppMapTarget(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-subtle)] hover:bg-[var(--surface)]"
              >
                <X size={13} /> Tutup
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-[var(--text-subtle)]">
                Produk: <span className="font-medium text-[var(--text)]">{hppMapTarget.productName || "-"}</span>
              </p>
              <input
                value={hppOptionQuery}
                onChange={(e) => setHppOptionQuery(e.target.value)}
                placeholder="Cari master product / master SKU"
                className="w-full border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
              />
              <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
                {filteredMasterHppOptions.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-[var(--text-subtle)]">Tidak ada master HPP yang cocok.</p>
                ) : (
                  filteredMasterHppOptions.map((option) => (
                    <label key={option.key} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-[var(--surface-soft)] cursor-pointer">
                      <div>
                        <p className="text-sm font-medium text-[var(--text)]">{option.masterProductName}</p>
                        <p className="text-xs text-[var(--text-subtle)]">Master SKU: {option.masterSku}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-semibold ${option.cost > 0 ? "text-emerald-400" : "text-amber-300"}`}>
                          {formatRupiah(option.cost)}
                        </span>
                        {option.cost <= 0 && (
                          <span className="inline-flex rounded-full border border-amber-300/40 bg-amber-300/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                            HPP 0
                          </span>
                        )}
                        <input
                          type="radio"
                          name="hpp-master-option"
                          checked={selectedHppOptionKey === option.key}
                          onChange={() => setSelectedHppOptionKey(option.key)}
                        />
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-5 py-3">
              <button
                type="button"
                onClick={() => setHppMapTarget(null)}
                className="px-3 py-2 text-xs border border-[var(--border-subtle)] rounded-lg text-[var(--text-subtle)] hover:bg-[var(--surface-soft)]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={applyHppMapping}
                disabled={!selectedHppOptionKey}
                className="px-3 py-2 text-xs rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
              >
                Gunakan HPP Ini
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

function SaveReportCard({
  buildReportForMarketplace,
  marketplaceOptions,
}: {
  buildReportForMarketplace: (marketplace: MarketplaceId) => RevenueReport;
  marketplaceOptions: MarketplaceId[];
}) {
  const saveStoreReport = useAppStore((state) => state.saveStoreReport);
  const { notify } = useNotification();
  const [storeName, setStoreName] = useState("");
  const [selectedMarketplace, setSelectedMarketplace] = useState<MarketplaceId | "">("");

  useEffect(() => {
    if (marketplaceOptions.length === 0) {
      setSelectedMarketplace("");
      return;
    }
    if (!selectedMarketplace || !marketplaceOptions.includes(selectedMarketplace)) {
      setSelectedMarketplace(marketplaceOptions[0]);
    }
  }, [marketplaceOptions, selectedMarketplace]);

  const handleSaveByStore = async () => {
    if (!selectedMarketplace) return;
    const trimmedStoreName = storeName.trim();
    if (!trimmedStoreName) {
      notify("warning", "Nama toko wajib diisi.");
      return;
    }

    const saved = buildReportForMarketplace(selectedMarketplace);
    if (saved.marketplaces.length === 0) {
      notify("warning", "Marketplace yang dipilih tidak ada di hasil hitung.");
      return;
    }

    const reportId = await saveStoreReport({
      marketplace: selectedMarketplace,
      storeName: trimmedStoreName,
      report: saved,
    });

    if (!reportId) {
      notify("error", "Gagal menyimpan laporan. Coba lagi.");
      return;
    }

    notify("success", `Tersimpan: ${MARKETPLACE_LABELS[selectedMarketplace]} - ${trimmedStoreName}`);
    setStoreName("");
  };

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4 mb-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="font-semibold text-[var(--foreground)]">Simpan Laporan per Toko</h3>
          <p className="text-xs text-[var(--text-subtle)] mt-1">
            Simpan hasil hitung dengan format: Marketplace - Nama Toko.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
          <select
            value={selectedMarketplace}
            onChange={(e) => setSelectedMarketplace(e.target.value as MarketplaceId)}
            className="border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          >
            <option value="">Pilih marketplace</option>
            {marketplaceOptions.map((marketplace) => (
              <option key={marketplace} value={marketplace}>
                {MARKETPLACE_LABELS[marketplace]}
              </option>
            ))}
          </select>
          <input
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="Nama toko (contoh: Aquadrat)"
            className="border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          <button
            onClick={handleSaveByStore}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[var(--brand)] text-[var(--background)] rounded-lg text-sm font-medium hover:bg-[var(--brand-hover)]"
          >
            <Save className="w-4 h-4" />
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Global Dashboard Section: aggregate all savedReports into one view
// ─────────────────────────────────────────────────────────────────────────────

function buildGlobalOrders(
  savedReports: import("@/lib/types").SavedStoreReport[],
  excludedIds: Set<string>,
  currentReport: import("@/lib/types").RevenueReport | null
): CalculatedOrder[] {
  const seen = new Set<string>();
  const result: CalculatedOrder[] = [];

  const addOrders = (orders: CalculatedOrder[]) => {
    for (const order of orders) {
      const key = toOrderKey(order.marketplace, order.orderId);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(order);
    }
  };

  for (const sr of savedReports) {
    if (excludedIds.has(sr.id)) continue;
    addOrders(sr.report.orders ?? []);
  }

  // Also include active report if not already covered
  if (currentReport) {
    addOrders(currentReport.orders ?? []);
  }

  return result;
}

function buildGlobalSummary(orders: CalculatedOrder[]): {
  totalRevenue: number;
  totalGrossProfit: number;
  totalNetProfit: number;
  totalHpp: number;
  totalPlatformFees: number;
  totalOrders: number;
  avgNetMargin: number;
  byMarketplace: Record<string, { orders: number; revenue: number; hpp: number; platformFees: number; netProfit: number; avgMargin: number }>;
} {
  const byMarketplace: Record<string, { orders: number; revenue: number; hpp: number; platformFees: number; netProfit: number }> = {};
  let totalRevenue = 0;
  let totalNetProfit = 0;
  let totalHpp = 0;
  let totalPlatformFees = 0;

  for (const order of orders) {
    const mp = order.marketplace;
    if (!byMarketplace[mp]) byMarketplace[mp] = { orders: 0, revenue: 0, hpp: 0, platformFees: 0, netProfit: 0 };
    // Fallback: jika revenue = 0 tapi ada net profit / hpp, estimasi dari komponen settlement
    const effectiveRevenue = order.revenue > 0
      ? order.revenue
      : Math.max(0, order.netProfit + order.hpp + order.fees.totalPlatformFee);
    byMarketplace[mp].orders += 1;
    byMarketplace[mp].revenue += effectiveRevenue;
    byMarketplace[mp].hpp += order.hpp;
    byMarketplace[mp].platformFees += order.fees.totalPlatformFee;
    byMarketplace[mp].netProfit += order.netProfit;
    totalRevenue += effectiveRevenue;
    totalNetProfit += order.netProfit;
    totalHpp += order.hpp;
    totalPlatformFees += order.fees.totalPlatformFee;
  }

  const totalGrossProfit = totalRevenue - totalHpp;
  const avgNetMargin = totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0;

  const byMarketplaceFinal: Record<string, { orders: number; revenue: number; hpp: number; platformFees: number; netProfit: number; avgMargin: number }> = {};
  for (const [mp, data] of Object.entries(byMarketplace)) {
    byMarketplaceFinal[mp] = { ...data, avgMargin: data.revenue > 0 ? (data.netProfit / data.revenue) * 100 : 0 };
  }

  return {
    totalRevenue,
    totalGrossProfit,
    totalNetProfit,
    totalHpp,
    totalPlatformFees,
    totalOrders: orders.length,
    avgNetMargin,
    byMarketplace: byMarketplaceFinal,
  };
}

// GlobalOrderTable: full interactive order table for global view
const GlobalOrderTable = memo(function GlobalOrderTable({
  orders,
}: {
  orders: CalculatedOrder[];
}) {
  type SortKey = "no" | "orderDate" | "orderId" | "productName" | "marketplace" | "qty" | "revenue" | "hpp" | "platformFee" | "netProfit" | "margin";

  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState<"all" | MarketplaceId>("all");
  const [profitFilter, setProfitFilter] = useState<"all" | "profit" | "loss">("all");
  const [rowsPerPage, setRowsPerPage] = useState<20 | 50 | 100>(20);
  const [sortKey, setSortKey] = useState<SortKey>("orderDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-blue-500" /> : <ArrowDown className="w-3 h-3 text-blue-500" />;
  };

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return orders.filter((o) => {
      if (marketplaceFilter !== "all" && o.marketplace !== marketplaceFilter) return false;
      if (profitFilter === "profit" && o.netProfit < 0) return false;
      if (profitFilter === "loss" && o.netProfit >= 0) return false;
      if (!q) return true;
      return (
        o.orderId.toLowerCase().includes(q) ||
        o.productName.toLowerCase().includes(q) ||
        (o.sku || "").toLowerCase().includes(q)
      );
    });
  }, [orders, deferredQuery, marketplaceFilter, profitFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "no": return 0;
        case "orderDate": {
          const da = parseDateLoose(a.orderDate)?.getTime() ?? 0;
          const db = parseDateLoose(b.orderDate)?.getTime() ?? 0;
          return (da - db) * dir;
        }
        case "orderId": return a.orderId.localeCompare(b.orderId) * dir;
        case "productName": return a.productName.localeCompare(b.productName, "id") * dir;
        case "marketplace": return a.marketplace.localeCompare(b.marketplace) * dir;
        case "qty": return (a.qty - b.qty) * dir;
        case "revenue": return (a.revenue - b.revenue) * dir;
        case "hpp": return (a.hpp - b.hpp) * dir;
        case "platformFee": return (a.fees.totalPlatformFee - b.fees.totalPlatformFee) * dir;
        case "netProfit": return (a.netProfit - b.netProfit) * dir;
        case "margin": return (a.netMargin - b.netMargin) * dir;
        default: return 0;
      }
    });
  }, [filtered, sortKey, sortDir]);

  useEffect(() => { setPage(1); }, [deferredQuery, marketplaceFilter, profitFilter, sortKey, sortDir, rowsPerPage]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / rowsPerPage));
  const paged = sorted.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const tableTotals = useMemo(() => {
    const rev = sorted.reduce((s, o) => s + o.revenue, 0);
    const np = sorted.reduce((s, o) => s + o.netProfit, 0);
    return {
      qty: sorted.reduce((s, o) => s + o.qty, 0),
      revenue: rev,
      hpp: sorted.reduce((s, o) => s + o.hpp, 0),
      platformFee: sorted.reduce((s, o) => s + o.fees.totalPlatformFee, 0),
      netProfit: np,
      margin: rev > 0 ? (np / rev) * 100 : 0,
    };
  }, [sorted]);

  const colHeader = (label: string, col: SortKey, align: "left" | "right" = "left") => (
    <th className={`py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold text-${align}`}>
      <button type="button" onClick={() => toggleSort(col)} className={`inline-flex items-center gap-1 hover:text-[var(--foreground)] ${align === "right" ? "ml-auto" : ""}`}>
        {label} <SortIcon col={col} />
      </button>
    </th>
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--surface-muted)] flex flex-col gap-2.5">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari order ID, produk, SKU..."
              className="field-input pl-9 pr-3 py-2"
            />
          </div>
          <span className="text-xs text-[var(--text-subtle)]">
            {sorted.length} dari {orders.length} pesanan
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={marketplaceFilter} onChange={(e) => setMarketplaceFilter(e.target.value as "all" | MarketplaceId)} className="field-input w-auto text-xs py-1.5">
            <option value="all">Semua marketplace</option>
            {(Object.keys(MARKETPLACE_LABELS) as MarketplaceId[]).map((mp) => (
              <option key={mp} value={mp}>{MARKETPLACE_LABELS[mp]}</option>
            ))}
          </select>
          <select value={profitFilter} onChange={(e) => setProfitFilter(e.target.value as "all" | "profit" | "loss")} className="field-input w-auto text-xs py-1.5">
            <option value="all">Semua profit</option>
            <option value="profit">Profit (+)</option>
            <option value="loss">Rugi (-)</option>
          </select>
          <select value={String(rowsPerPage)} onChange={(e) => setRowsPerPage(Number(e.target.value) as 20 | 50 | 100)} className="field-input w-auto text-xs py-1.5">
            <option value="20">20 baris</option>
            <option value="50">50 baris</option>
            <option value="100">100 baris</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/95 backdrop-blur">
              <th className="py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold text-left w-8">No</th>
              {colHeader("Tanggal", "orderDate")}
              {colHeader("Order ID", "orderId")}
              {colHeader("Produk", "productName")}
              {colHeader("Marketplace", "marketplace")}
              {colHeader("Qty", "qty", "right")}
              {colHeader("Revenue", "revenue", "right")}
              <th className="py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold text-right hidden md:table-cell">HPP</th>
              <th className="py-3 px-3 text-[11px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold text-right hidden md:table-cell">Biaya</th>
              {colHeader("Net Profit", "netProfit", "right")}
              {colHeader("Margin", "margin", "right")}
              <th className="py-3 px-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {paged.map((order, idx) => {
              const rowKey = `${order.marketplace}:${order.orderId}`;
              const isExpanded = expanded === rowKey;
              const isProfit = order.netProfit >= 0;
              const rowBg = isProfit
                ? (idx % 2 === 0 ? "bg-[var(--surface)]" : "bg-emerald-50/30 dark:bg-emerald-950/10")
                : (idx % 2 === 0 ? "bg-red-50/30 dark:bg-red-950/10" : "bg-red-50/50 dark:bg-red-950/20");

              return (
                <React.Fragment key={rowKey}>
                  <tr
                    className={`${rowBg} hover:bg-[var(--hover-strong)] cursor-pointer transition-colors`}
                    onClick={() => setExpanded(isExpanded ? null : rowKey)}
                  >
                    <td className="py-2 px-3 text-[var(--text-subtle)]">{(page - 1) * rowsPerPage + idx + 1}</td>
                    <td className="py-2 px-3 text-[var(--text-subtle)] whitespace-nowrap">
                      {parseDateLoose(order.orderDate)?.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" }) ?? order.orderDate}
                    </td>
                    <td className="py-2 px-3 font-mono text-[var(--foreground)] whitespace-nowrap max-w-[140px] truncate">{order.orderId}</td>
                    <td className="py-2 px-3 text-[var(--foreground)] max-w-[180px] truncate">{order.productName}</td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 rounded text-white text-[10px] font-semibold" style={{ backgroundColor: MARKETPLACE_COLORS[order.marketplace] }}>
                        {MARKETPLACE_LABELS[order.marketplace]}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">{formatNumber(order.qty)}</td>
                    <td className="py-2 px-3 text-right font-medium text-[var(--foreground)]">{formatRupiah(order.revenue)}</td>
                    <td className="py-2 px-3 text-right text-[var(--text-subtle)] hidden md:table-cell">{formatRupiah(order.hpp)}</td>
                    <td className="py-2 px-3 text-right text-red-500 hidden md:table-cell">-{formatRupiah(order.fees.totalPlatformFee)}</td>
                    <td className={`py-2 px-3 text-right font-semibold ${isProfit ? "text-emerald-600" : "text-red-500"}`}>{formatRupiah(order.netProfit)}</td>
                    <td className={`py-2 px-3 text-right ${isProfit ? "text-emerald-600" : "text-red-500"}`}>{formatPercent(order.netMargin)}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-block transition-transform ${isExpanded ? "rotate-90" : ""} text-[var(--text-subtle)]`}>›</span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${rowKey}-detail`} className="bg-[var(--surface-soft)]">
                      <td colSpan={12} className="px-5 py-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs">
                          <div><span className="text-[var(--text-subtle)]">SKU:</span> <span className="font-mono text-[var(--foreground)]">{order.sku || "-"}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Status:</span> <span className="text-[var(--foreground)]">{order.status || "-"}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Harga Jual:</span> <span className="text-[var(--foreground)]">{formatRupiah(order.sellingPrice)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Harga Aktual:</span> <span className="text-[var(--foreground)]">{formatRupiah(order.actualPrice)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Settlement:</span> <span className="text-[var(--foreground)]">{order.settlementAmount != null ? formatRupiah(order.settlementAmount) : "-"}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Komisi:</span> <span className="text-red-500">-{formatRupiah(order.fees.commissionFee)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Tx Fee:</span> <span className="text-red-500">-{formatRupiah(order.fees.transactionFee)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Free Ship:</span> <span className="text-red-500">-{formatRupiah(order.fees.freeShippingFee)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Voucher:</span> <span className="text-red-500">-{formatRupiah(order.fees.voucherBySeller)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Gross Profit:</span> <span className={order.grossProfit >= 0 ? "text-emerald-600" : "text-red-500"}>{formatRupiah(order.grossProfit)}</span></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {paged.length === 0 && (
              <tr>
                <td colSpan={12} className="py-8 text-center text-sm text-[var(--text-subtle)]">
                  Tidak ada pesanan yang cocok dengan filter.
                </td>
              </tr>
            )}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--border-subtle)] bg-[var(--surface-muted)] font-semibold text-xs">
                <td colSpan={5} className="py-3 px-3 text-[var(--foreground)]">Total ({sorted.length} pesanan terfilter)</td>
                <td className="py-3 px-3 text-right">{formatNumber(tableTotals.qty)}</td>
                <td className="py-3 px-3 text-right">{formatRupiah(tableTotals.revenue)}</td>
                <td className="py-3 px-3 text-right hidden md:table-cell text-[var(--text-subtle)]">{formatRupiah(tableTotals.hpp)}</td>
                <td className="py-3 px-3 text-right hidden md:table-cell text-red-500">-{formatRupiah(tableTotals.platformFee)}</td>
                <td className={`py-3 px-3 text-right ${tableTotals.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatRupiah(tableTotals.netProfit)}</td>
                <td className={`py-3 px-3 text-right ${tableTotals.margin >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatPercent(tableTotals.margin)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination */}
      {sorted.length > rowsPerPage && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--surface-muted)]">
          <p className="text-xs text-[var(--text-subtle)]">
            Halaman {page}/{totalPages} &bull; {rowsPerPage} baris/halaman
          </p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg disabled:opacity-40 hover:bg-[var(--surface)]">
              &larr; Prev
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg disabled:opacity-40 hover:bg-[var(--surface)]">
              Next &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// ── Period filter helpers ──────────────────────────────────────
type PeriodPreset = "all" | "this-month" | "3-months" | "this-year" | "custom";

function getPeriodRange(preset: PeriodPreset, customFrom: string, customTo: string): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (preset === "this-month") {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
  }
  if (preset === "3-months") {
    const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return { from, to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
  }
  if (preset === "this-year") {
    return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31, 23, 59, 59) };
  }
  if (preset === "custom") {
    return { from: customFrom ? new Date(customFrom) : null, to: customTo ? new Date(customTo + "T23:59:59") : null };
  }
  return { from: null, to: null };
}

function filterOrdersByPeriod(orders: CalculatedOrder[], from: Date | null, to: Date | null): CalculatedOrder[] {
  if (!from && !to) return orders;
  return orders.filter((o) => {
    const d = parseDateLoose(o.orderDate);
    if (!d) return true;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

function buildMonthlyTrend(orders: CalculatedOrder[]): { dayLabel: string; revenue: number; netProfit: number }[] {
  const map = new Map<string, { revenue: number; netProfit: number }>();
  for (const o of orders) {
    const d = parseDateLoose(o.orderDate);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cur = map.get(key) ?? { revenue: 0, netProfit: 0 };
    cur.revenue += o.revenue;
    cur.netProfit += o.netProfit;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => ({
      dayLabel: key.slice(0, 7).replace(/-(\d+)$/, (_, m) => `-${m}`),
      ...val,
    }))
    .map((item) => {
      const [year, month] = item.dayLabel.split("-");
      const d = new Date(Number(year), Number(month) - 1, 1);
      return { ...item, dayLabel: d.toLocaleString("id-ID", { month: "short", year: "2-digit" }) };
    });
}

// GlobalDashboardSection: full section shown when savedReports exist
function GlobalDashboardSection({
  savedReports,
}: {
  savedReports: import("@/lib/types").SavedStoreReport[];
}) {
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [showReportPanel, setShowReportPanel] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const toggleReport = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeCount = savedReports.length - excludedIds.size;

  const globalOrders = useMemo(
    () => buildGlobalOrders(savedReports, excludedIds, null),
    [savedReports, excludedIds]
  );

  const { from: periodFrom, to: periodTo } = useMemo(
    () => getPeriodRange(periodPreset, customFrom, customTo),
    [periodPreset, customFrom, customTo]
  );

  const filteredOrders = useMemo(
    () => filterOrdersByPeriod(globalOrders, periodFrom, periodTo),
    [globalOrders, periodFrom, periodTo]
  );

  const summary = useMemo(() => buildGlobalSummary(filteredOrders), [filteredOrders]);
  const monthlyTrend = useMemo(() => buildMonthlyTrend(filteredOrders), [filteredOrders]);
  const storePerformance = useMemo(() => {
    const rows = savedReports
      .filter((sr) => !excludedIds.has(sr.id))
      .map((sr) => {
        const scopedOrders = filterOrdersByPeriod(sr.report.orders ?? [], periodFrom, periodTo);
        const revenue = scopedOrders.reduce((sum, order) => sum + order.revenue, 0);
        const netProfit = scopedOrders.reduce((sum, order) => sum + order.netProfit, 0);
        const qty = scopedOrders.reduce((sum, order) => sum + order.qty, 0);
        return {
          id: sr.id,
          storeName: sr.storeName,
          label: sr.label,
          orderCount: scopedOrders.length,
          qty,
          revenue,
          netProfit,
        };
      })
      .filter((item) => item.orderCount > 0)
      .sort((a, b) => {
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        return b.qty - a.qty;
      });
    return rows.slice(0, 8);
  }, [savedReports, excludedIds, periodFrom, periodTo]);
  const topProducts = useMemo(() => {
    const map = new Map<string, { productName: string; qty: number; revenue: number; netProfit: number }>();
    for (const order of filteredOrders) {
      const productName = String(order.productName ?? "").trim() || "(Tanpa Nama Produk)";
      const key = productName.toLowerCase();
      const current = map.get(key) ?? { productName, qty: 0, revenue: 0, netProfit: 0 };
      current.qty += order.qty;
      current.revenue += order.revenue;
      current.netProfit += order.netProfit;
      map.set(key, current);
    }
    return [...map.values()]
      .sort((a, b) => {
        if (b.qty !== a.qty) return b.qty - a.qty;
        return b.revenue - a.revenue;
      })
      .slice(0, 10);
  }, [filteredOrders]);

  // Semua marketplace dari globalOrders (sebelum filter periode) — untuk breakdown table agar selalu tampil
  const allActiveMarketplaces = useMemo(() => {
    const mps = new Set<MarketplaceId>();
    for (const o of globalOrders) mps.add(o.marketplace);
    return Array.from(mps);
  }, [globalOrders]);
  const isPositive = summary.totalNetProfit >= 0;

  const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
    { value: "all", label: "Semua Waktu" },
    { value: "this-month", label: "Bulan Ini" },
    { value: "3-months", label: "3 Bulan Terakhir" },
    { value: "this-year", label: "Tahun Ini" },
    { value: "custom", label: "Custom" },
  ];

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-[var(--foreground)]">Dashboard Global</h2>
          <p className="text-sm text-[var(--text-subtle)] mt-0.5">
            {summary.totalOrders} pesanan unik
            {periodPreset !== "all" && <span className="ml-1 text-cyan-400">• Difilter</span>}
            <span className="ml-1">• Sumber: laporan tersimpan</span>
          </p>
        </div>

        {/* Compact source reports selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowReportPanel((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-soft)] transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            {activeCount} laporan aktif
            <ChevronDown className="w-3.5 h-3.5 text-[var(--text-subtle)]" />
          </button>

          {showReportPanel && (
            <div className="absolute right-0 top-full mt-1 z-20 w-72 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">Sumber Laporan</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setExcludedIds(new Set())} className="text-[10px] text-cyan-400 hover:underline">Semua</button>
                  <span className="text-[var(--border-subtle)]">·</span>
                  <button type="button" onClick={() => setExcludedIds(new Set(savedReports.map((r) => r.id)))} className="text-[10px] text-[var(--text-subtle)] hover:underline">Kosongkan</button>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                {savedReports.map((sr) => {
                  const isExcluded = excludedIds.has(sr.id);
                  return (
                    <label key={sr.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[var(--surface-soft)] select-none">
                      <input
                        type="checkbox"
                        checked={!isExcluded}
                        onChange={() => toggleReport(sr.id)}
                        className="rounded"
                      />
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: MARKETPLACE_COLORS[sr.marketplace] }} />
                      <span className="text-xs text-[var(--foreground)] truncate flex-1">{sr.label}</span>
                    </label>
                  );
                })}
              </div>
              <div className="px-3 py-2 border-t border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                <button
                  type="button"
                  onClick={() => setShowReportPanel(false)}
                  className="w-full text-xs text-center text-[var(--text-subtle)] hover:text-[var(--foreground)]"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPeriodPreset(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              periodPreset === opt.value
                ? "bg-[var(--brand)] border-[var(--brand)] text-[var(--background)]"
                : "border-[var(--border-subtle)] text-[var(--text-subtle)] hover:border-[var(--brand)]/50 hover:text-[var(--foreground)]"
            }`}
          >
            {opt.label}
          </button>
        ))}
        {periodPreset === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="field-input text-xs py-1"
            />
            <span className="text-xs text-[var(--text-subtle)]">s/d</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="field-input text-xs py-1"
            />
          </div>
        )}
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Total Revenue</p>
          <p className="text-2xl font-bold text-[var(--foreground)] mt-1 leading-none">{formatRupiah(summary.totalRevenue)}</p>
          <p className="text-xs text-[var(--text-subtle)] mt-1">{formatNumber(summary.totalOrders)} pesanan</p>
        </div>
        <div className={`rounded-2xl border p-4 ${isPositive ? "border-emerald-400/30 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-red-400/30 bg-red-50/50 dark:bg-red-950/20"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Net Profit</p>
          <p className={`text-2xl font-bold mt-1 leading-none ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {formatRupiah(summary.totalNetProfit)}
          </p>
          <p className={`text-xs mt-1 ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
            Net Margin {formatPercent(summary.avgNetMargin)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Total Pesanan</p>
          <p className="text-2xl font-bold text-[var(--foreground)] mt-1 leading-none">{formatNumber(summary.totalOrders)}</p>
          <p className="text-xs text-[var(--text-subtle)] mt-1">
            Avg {formatRupiah(summary.totalOrders > 0 ? summary.totalRevenue / summary.totalOrders : 0)}/order
          </p>
        </div>
        <div className={`rounded-2xl border p-4 ${summary.avgNetMargin >= 0 ? "border-[var(--border-subtle)] bg-[var(--surface)]" : "border-red-400/30 bg-red-50/50 dark:bg-red-950/20"}`}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Avg Net Margin</p>
          <p className={`text-2xl font-bold mt-1 leading-none ${summary.avgNetMargin >= 0 ? "text-[var(--foreground)]" : "text-red-600"}`}>
            {formatPercent(summary.avgNetMargin)}
          </p>
          <p className="text-xs text-[var(--text-subtle)] mt-1">HPP total {formatRupiah(summary.totalHpp)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Rincian Perhitungan</p>
        <div className="mt-2 space-y-1.5 text-sm">
          <p className="text-[var(--foreground)]">
            Laba Kotor: <span className="font-semibold">{formatRupiah(summary.totalRevenue)}</span> -{" "}
            <span className="font-semibold">{formatRupiah(summary.totalHpp)}</span> ={" "}
            <span className={summary.totalGrossProfit >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-500"}>
              {formatRupiah(summary.totalGrossProfit)}
            </span>
          </p>
          <p className="text-[var(--foreground)]">
            Laba Bersih: <span className="font-semibold">{formatRupiah(summary.totalGrossProfit)}</span> -{" "}
            <span className="font-semibold">{formatRupiah(summary.totalPlatformFees)}</span> ={" "}
            <span className={summary.totalNetProfit >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-500"}>
              {formatRupiah(summary.totalNetProfit)}
            </span>
          </p>
        </div>
      </div>

      {/* Monthly trend chart */}
      {monthlyTrend.length > 1 && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Tren Revenue & Net Profit per Bulan</h3>
            <span className="text-xs text-[var(--text-subtle)]">{monthlyTrend.length} bulan</span>
          </div>
          <MonthlyRevenueLineChart data={monthlyTrend} />
        </div>
      )}

      {/* Marketplace breakdown table */}
      {allActiveMarketplaces.length > 0 && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Breakdown per Marketplace</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                  <th className="text-left py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">Marketplace</th>
                  <th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">Pesanan</th>
                  <th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">Revenue</th>
                  <th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium hidden sm:table-cell">HPP</th>
                  <th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium hidden sm:table-cell">Biaya Platform</th>
                  <th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">Net Profit</th>
                  <th className="text-right py-3 px-4 text-xs text-[var(--text-subtle)] font-medium">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {allActiveMarketplaces.map((mp) => {
                  const data = summary.byMarketplace[mp];
                  const isEmpty = !data || data.orders === 0;
                  return (
                    <tr key={mp} className={`hover:bg-[var(--surface-soft)] ${isEmpty ? "opacity-40" : ""}`}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MARKETPLACE_COLORS[mp] }} />
                          <span className="font-medium text-[var(--foreground)]">{MARKETPLACE_LABELS[mp]}</span>
                          {isEmpty && <span className="text-[10px] text-[var(--text-subtle)] italic">tidak ada di periode ini</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-[var(--text-subtle)]">{formatNumber(data?.orders ?? 0)}</td>
                      <td className="py-3 px-4 text-right font-medium text-[var(--foreground)]">{formatRupiah(data?.revenue ?? 0)}</td>
                      <td className="py-3 px-4 text-right text-[var(--text-subtle)] hidden sm:table-cell">{formatRupiah(data?.hpp ?? 0)}</td>
                      <td className="py-3 px-4 text-right text-red-500 hidden sm:table-cell">-{formatRupiah(data?.platformFees ?? 0)}</td>
                      <td className={`py-3 px-4 text-right font-semibold ${(data?.netProfit ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatRupiah(data?.netProfit ?? 0)}</td>
                      <td className={`py-3 px-4 text-right ${(data?.avgMargin ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatPercent(data?.avgMargin ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border-subtle)] bg-[var(--surface-muted)] font-bold">
                  <td className="py-3 px-4 text-[var(--foreground)]">Total</td>
                  <td className="py-3 px-4 text-right text-[var(--foreground)]">{formatNumber(summary.totalOrders)}</td>
                  <td className="py-3 px-4 text-right text-[var(--foreground)]">{formatRupiah(summary.totalRevenue)}</td>
                  <td className="py-3 px-4 text-right text-[var(--text-subtle)] hidden sm:table-cell">{formatRupiah(summary.totalHpp)}</td>
                  <td className="py-3 px-4 text-right text-red-500 hidden sm:table-cell">-{formatRupiah(summary.totalPlatformFees)}</td>
                  <td className={`py-3 px-4 text-right ${summary.totalNetProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatRupiah(summary.totalNetProfit)}</td>
                  <td className={`py-3 px-4 text-right ${summary.avgNetMargin >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatPercent(summary.avgNetMargin)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Toko Terlaris</h3>
            <p className="text-xs text-[var(--text-subtle)] mt-0.5">Peringkat toko dari laporan aktif pada periode terpilih.</p>
          </div>
          {storePerformance.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--text-subtle)]">Belum ada data toko pada periode ini.</p>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {storePerformance.map((store, idx) => (
                <div key={store.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--foreground)] truncate">{idx + 1}. {store.storeName}</p>
                    <p className="text-xs text-[var(--text-subtle)] truncate">
                      {store.label} • {formatNumber(store.orderCount)} order • Qty {formatNumber(store.qty)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-[var(--foreground)]">{formatRupiah(store.revenue)}</p>
                    <p className={`text-xs ${store.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      Net {formatRupiah(store.netProfit)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Produk Terlaris Global</h3>
            <p className="text-xs text-[var(--text-subtle)] mt-0.5">Produk paling laku lintas semua laporan aktif.</p>
          </div>
          {topProducts.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--text-subtle)]">Belum ada data produk pada periode ini.</p>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {topProducts.map((item, idx) => (
                <div key={`${item.productName}-${idx}`} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--foreground)] truncate">{idx + 1}. {item.productName}</p>
                    <p className="text-xs text-[var(--text-subtle)]">Qty {formatNumber(item.qty)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-[var(--foreground)]">{formatRupiah(item.revenue)}</p>
                    <p className={`text-xs ${item.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      Net {formatRupiah(item.netProfit)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main DashboardPage
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const {
    report,
    reportSource,
    uploadSets,
    hppEntries,
    savedReports,
    loadSavedReports,
    renameSavedReport,
    deleteSavedReport,
  } = useAppStore();
  const [dashboardMarketplaceFilter, setDashboardMarketplaceFilter] = useState<"all" | MarketplaceId>("all");
  const [deletedOrderKeys, setDeletedOrderKeys] = useState<string[]>([]);
  const [hppSearch, setHppSearch] = useState("");
  const [hppMin, setHppMin] = useState("");
  const [hppMax, setHppMax] = useState("");
  const [hppUsageFilter, setHppUsageFilter] = useState<"all" | "used" | "unused">("all");
  const [timeRangeFilter, setTimeRangeFilter] = useState<"this_month" | "three_months" | "one_year">("this_month");
  const [hppSortKey, setHppSortKey] = useState<"masterSku" | "sku" | "productName" | "cost" | "usageQty">("usageQty");
  const [hppSortDirection, setHppSortDirection] = useState<"asc" | "desc">("desc");
  const [hppPage, setHppPage] = useState(1);
  const [hppRowsPerPage, setHppRowsPerPage] = useState<number | "all">(10);
  const deferredHppSearch = useDeferredValue(hppSearch);

  const visibleReport = useMemo<RevenueReport | null>(() => {
    if (!report) return null;
    return dashboardMarketplaceFilter === "all"
      ? report
      : createMarketplaceOnlyReport(report, dashboardMarketplaceFilter);
  }, [dashboardMarketplaceFilter, report]);

  const visibleReportAfterDelete = useMemo<RevenueReport | null>(() => {
    if (!visibleReport) return null;
    return applyManualOrderExclusions(visibleReport, deletedOrderKeys);
  }, [visibleReport, deletedOrderKeys]);

  const reactiveVisibleReport = useMemo<RevenueReport | null>(() => {
    if (!visibleReportAfterDelete) return null;
    if (reportSource === "saved") return visibleReportAfterDelete;
    return recalculateReportWithCurrentData(visibleReportAfterDelete, uploadSets, hppEntries);
  }, [visibleReportAfterDelete, reportSource, uploadSets, hppEntries]);

  const timeFilterMeta = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    if (timeRangeFilter === "this_month") {
      return {
        label: "This Month",
        start: monthStart,
        end: monthEnd,
      };
    }
    if (timeRangeFilter === "three_months") {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
      return {
        label: "3 Months",
        start,
        end: monthEnd,
      };
    }
    return {
      label: "1 Year",
      start: new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0),
      end: monthEnd,
    };
  }, [timeRangeFilter]);

  const filteredReportByTime = useMemo<RevenueReport | null>(() => {
    if (!reactiveVisibleReport) return null;
    const filteredOrders = reactiveVisibleReport.orders.filter((order) => {
      const parsed = parseDateLoose(order.orderDate);
      if (!parsed) return false;
      return parsed.getTime() >= timeFilterMeta.start.getTime() && parsed.getTime() <= timeFilterMeta.end.getTime();
    });
    const period = {
      from: timeFilterMeta.start.toISOString().slice(0, 10),
      to: timeFilterMeta.end.toISOString().slice(0, 10),
    };
    return rebuildReportFromOrders(reactiveVisibleReport, filteredOrders, period);
  }, [reactiveVisibleReport, timeFilterMeta]);

  const buildReportForMarketplace = useCallback(
    (marketplace: MarketplaceId) => {
      if (!report) {
        return {
          generatedAt: new Date().toISOString(),
          marketplaces: [],
          totalRevenue: 0,
          totalHpp: 0,
          totalGrossProfit: 0,
          totalPlatformFees: 0,
          totalNetProfit: 0,
          orders: [],
        };
      }
      const scoped = createMarketplaceOnlyReport(report, marketplace);
      const scopedAfterDelete = applyManualOrderExclusions(scoped, deletedOrderKeys);
      if (reportSource === "saved") return scopedAfterDelete;
      return recalculateReportWithCurrentData(scopedAfterDelete, uploadSets, hppEntries);
    },
    [report, uploadSets, hppEntries, deletedOrderKeys, reportSource]
  );

  useEffect(() => {
    loadSavedReports().catch(console.error);
  }, [loadSavedReports]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const qpMarketplace = searchParams.get("marketplace") as MarketplaceId | null;
    if (!qpMarketplace) return;
    if (!report?.marketplaces.some((m) => m.marketplace === qpMarketplace)) return;
    setDashboardMarketplaceFilter(qpMarketplace);
  }, [report]);

  useEffect(() => {
    setDeletedOrderKeys([]);
  }, [report?.generatedAt, reportSource]);

  const handleDeleteOrder = useCallback((order: CalculatedOrder) => {
    const key = toOrderKey(order.marketplace, order.orderId);
    setDeletedOrderKeys((prev) => {
      if (prev.includes(key)) return prev;
      return [...prev, key];
    });
  }, []);

  if (!report || !visibleReport || !visibleReportAfterDelete || !reactiveVisibleReport || !filteredReportByTime) {
    // If there are saved reports, show global dashboard without active report
    if (savedReports.length > 0) {
      return (
        <AuthAreaLayout contentClassName="dashboard-theme px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1320px] space-y-6">
            <GlobalDashboardSection savedReports={savedReports} />

            <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] mt-6">
              <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
                <h3 className="font-semibold text-[var(--foreground)]">Laporan Tersimpan</h3>
                <Link href="/reports" className="text-xs px-3 py-1.5 border border-[var(--border-subtle)] rounded-lg text-[var(--text-subtle)] hover:bg-[var(--surface-muted)]">
                  Buka Menu Laporan
                </Link>
              </div>
              <div className="divide-y divide-[var(--border-subtle)]">
                {savedReports.map((item) => (
                  <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">{item.label}</p>
                      <p className="text-xs text-[var(--text-subtle)]">
                        {new Date(item.createdAt).toLocaleString("id-ID")} • Revenue {formatRupiah(item.report.totalRevenue)} • Net {formatRupiah(item.report.totalNetProfit)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const nextName = window.prompt("Ubah nama toko", item.storeName)?.trim();
                          if (nextName) renameSavedReport(item.id, nextName);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Rename
                      </button>
                      <button
                        onClick={() => router.push(`/reports/${item.id}`)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg hover:bg-[var(--surface-muted)] text-[var(--foreground)]"
                      >
                        <FolderOpen className="w-3.5 h-3.5" /> Buka
                      </button>
                      <button
                        onClick={() => deleteSavedReport(item.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </AuthAreaLayout>
      );
    }

    return (
      <AuthAreaLayout contentClassName="flex-1 flex items-center justify-center px-4 py-10">
        <EmptyState
          icon={FileSpreadsheet}
          title="Belum ada laporan"
          description="Upload data transaksi terlebih dahulu untuk melihat dashboard revenue."
          actionLabel="Upload Data"
          actionHref="/upload"
        />
      </AuthAreaLayout>
    );
  }

  const dashboardReport = filteredReportByTime;
  const netMargin =
    dashboardReport.totalRevenue > 0
      ? (dashboardReport.totalNetProfit / dashboardReport.totalRevenue) * 100
      : 0;

  const canceledOrderSummary = Object.values(uploadSets).reduce(
    (acc, set) => {
      if (!set?.canceledOrderFile) return acc;
      if (dashboardMarketplaceFilter !== "all" && set.marketplace !== dashboardMarketplaceFilter) {
        return acc;
      }
      const count = set.canceledOrderFile.rawOrders.length;
      if (count <= 0) return acc;
      return {
        total: acc.total + count,
        byMarketplace: [
          ...acc.byMarketplace,
          `${MARKETPLACE_LABELS[set.marketplace]}: ${formatNumber(count)}`,
        ],
      };
    },
    { total: 0, byMarketplace: [] as string[] }
  );

  const topMarketplace = [...dashboardReport.marketplaces].sort(
    (a, b) => b.totalNetProfit - a.totalNetProfit
  )[0];
  const avgOrderValue =
    dashboardReport.orders.length > 0
      ? dashboardReport.totalRevenue / dashboardReport.orders.length
      : 0;
  const currentMonthPeriodLabel = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const month = first.toLocaleString("id-ID", { month: "short" });
    return `${String(first.getDate()).padStart(2, "0")} ${month} ${first.getFullYear()} - ${String(last.getDate()).padStart(2, "0")} ${month} ${last.getFullYear()}`;
  }, []);
  const currentMonthTrendData = useMemo(() => {
    if (timeRangeFilter === "this_month") {
      const lastDate = new Date(
        timeFilterMeta.start.getFullYear(),
        timeFilterMeta.start.getMonth() + 1,
        0
      ).getDate();
      const map = new Map<number, { revenue: number; netProfit: number }>();
      for (let day = 1; day <= lastDate; day += 1) {
        map.set(day, { revenue: 0, netProfit: 0 });
      }

      for (const order of dashboardReport.orders) {
        const parsed = parseDateLoose(order.orderDate);
        if (!parsed) continue;
        const day = parsed.getDate();
        const current = map.get(day);
        if (!current) continue;
        current.revenue += order.revenue;
        current.netProfit += order.netProfit;
      }
      return Array.from(map.entries()).map(([day, value]) => ({
        dayLabel: String(day).padStart(2, "0"),
        revenue: value.revenue,
        netProfit: value.netProfit,
      }));
    }

    const monthMap = new Map<string, { revenue: number; netProfit: number }>();
    const cursor = new Date(timeFilterMeta.start.getFullYear(), timeFilterMeta.start.getMonth(), 1);
    const endMonth = new Date(timeFilterMeta.end.getFullYear(), timeFilterMeta.end.getMonth(), 1);
    while (cursor.getTime() <= endMonth.getTime()) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, { revenue: 0, netProfit: 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    for (const order of dashboardReport.orders) {
      const parsed = parseDateLoose(order.orderDate);
      if (!parsed) continue;
      const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
      const current = monthMap.get(key);
      if (!current) continue;
      current.revenue += order.revenue;
      current.netProfit += order.netProfit;
    }
    return Array.from(monthMap.entries()).map(([key, value]) => {
      const [year, month] = key.split("-");
      return {
        dayLabel: new Date(Number(year), Number(month) - 1, 1).toLocaleString("id-ID", { month: "short", year: "2-digit" }),
        revenue: value.revenue,
        netProfit: value.netProfit,
      };
    });
  }, [dashboardReport.orders, timeFilterMeta.end, timeFilterMeta.start, timeRangeFilter]);

  const productPerformance = useMemo(() => {
    const map = new Map<string, { productName: string; qty: number; revenue: number; netProfit: number }>();
    for (const order of dashboardReport.orders) {
      const name = String(order.productName ?? "").trim() || "(Tanpa Nama Produk)";
      const key = name.toLowerCase();
      const existing = map.get(key) ?? { productName: name, qty: 0, revenue: 0, netProfit: 0 };
      existing.qty += order.qty;
      existing.revenue += order.revenue;
      existing.netProfit += order.netProfit;
      map.set(key, existing);
    }
    const sorted = Array.from(map.values()).sort((a, b) => {
      if (b.qty !== a.qty) return b.qty - a.qty;
      return b.revenue - a.revenue;
    });

    return {
      top: sorted.slice(0, 5),
      bottom: [...sorted].reverse().slice(0, 5),
    };
  }, [dashboardReport.orders]);

  const marketplaceByRevenue = useMemo(() => {
    const sorted = [...dashboardReport.marketplaces].sort((a, b) => b.totalRevenue - a.totalRevenue);
    return {
      top: sorted[0] ?? null,
      bottom: sorted[sorted.length - 1] ?? null,
    };
  }, [dashboardReport.marketplaces]);

  const normalizedSkuKey = useCallback(
    (value: string) =>
      String(value ?? "")
        .trim()
        .replace(/^'+/, "")
        .replace(/\.0+$/, "")
        .replace(/[^a-zA-Z0-9]+/g, "")
        .toLowerCase(),
    []
  );

  const hppUsageMap = useMemo(() => {
    const usage = new Map<string, number>();
    for (const order of dashboardReport.orders) {
      const key = normalizedSkuKey(order.sku);
      if (!key) continue;
      usage.set(key, (usage.get(key) ?? 0) + order.qty);
    }
    return usage;
  }, [normalizedSkuKey, dashboardReport.orders]);

  const hppRows = useMemo(
    () =>
      hppEntries.map((entry, idx) => {
        const key = normalizedSkuKey(entry.sku);
        const usageQty = key ? hppUsageMap.get(key) ?? 0 : 0;
        return {
          id: `${idx}-${entry.sku}-${entry.productName}-${entry.cost}`,
          masterSku: entry.masterSku || "-",
          sku: entry.sku || "-",
          productName: entry.masterProductName || entry.productName || "-",
          cost: entry.cost,
          usageQty,
        };
      }),
    [hppEntries, hppUsageMap, normalizedSkuKey]
  );

  const filteredHppRows = useMemo(() => {
    const q = deferredHppSearch.trim().toLowerCase();
    const min = Number(hppMin || "0");
    const max = Number(hppMax || "0");
    return hppRows.filter((row) => {
      if (q) {
        const source = `${row.masterSku} ${row.sku} ${row.productName}`.toLowerCase();
        if (!source.includes(q)) return false;
      }
      if (Number.isFinite(min) && min > 0 && row.cost < min) return false;
      if (Number.isFinite(max) && max > 0 && row.cost > max) return false;
      if (hppUsageFilter === "used" && row.usageQty <= 0) return false;
      if (hppUsageFilter === "unused" && row.usageQty > 0) return false;
      return true;
    });
  }, [deferredHppSearch, hppMin, hppMax, hppRows, hppUsageFilter]);

  const sortedHppRows = useMemo(() => {
    const list = [...filteredHppRows];
    list.sort((a, b) => {
      const dir = hppSortDirection === "asc" ? 1 : -1;
      if (hppSortKey === "cost") return (a.cost - b.cost) * dir;
      if (hppSortKey === "usageQty") return (a.usageQty - b.usageQty) * dir;
      return String(a[hppSortKey]).localeCompare(String(b[hppSortKey]), "id", { sensitivity: "base" }) * dir;
    });
    return list;
  }, [filteredHppRows, hppSortDirection, hppSortKey]);

  const hppTotalPages = useMemo(() => {
    if (hppRowsPerPage === "all") return 1;
    return Math.max(1, Math.ceil(sortedHppRows.length / hppRowsPerPage));
  }, [hppRowsPerPage, sortedHppRows.length]);

  const pagedHppRows = useMemo(() => {
    if (hppRowsPerPage === "all") return sortedHppRows;
    const start = (hppPage - 1) * hppRowsPerPage;
    return sortedHppRows.slice(start, start + hppRowsPerPage);
  }, [hppPage, hppRowsPerPage, sortedHppRows]);

  useEffect(() => {
    setHppPage(1);
  }, [deferredHppSearch, hppMin, hppMax, hppUsageFilter, hppRowsPerPage, hppSortKey, hppSortDirection]);

  useEffect(() => {
    setHppPage((prev) => Math.min(prev, hppTotalPages));
  }, [hppTotalPages]);

  const toggleHppSort = (key: "masterSku" | "sku" | "productName" | "cost" | "usageQty") => {
    if (hppSortKey === key) {
      setHppSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setHppSortKey(key);
    setHppSortDirection(key === "productName" ? "asc" : "desc");
  };

  return (
    <AuthAreaLayout contentClassName="dashboard-theme px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1320px] space-y-6">

        {/* Global section — always shown when savedReports exist */}
        {savedReports.length > 0 && (
          <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4 sm:p-5">
            <GlobalDashboardSection savedReports={savedReports} />
          </section>
        )}

        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-[var(--foreground)]">Financial Dashboard</h1>
              <p className="text-sm text-[var(--text-subtle)] mt-1">
                Update terakhir: {new Date(dashboardReport.generatedAt).toLocaleString("id-ID")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-1">
                <button
                  type="button"
                  onClick={() => setTimeRangeFilter("this_month")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${timeRangeFilter === "this_month" ? "bg-[var(--brand)] text-white" : "text-[var(--text-subtle)] hover:bg-[var(--surface-soft)]"}`}
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => setTimeRangeFilter("three_months")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${timeRangeFilter === "three_months" ? "bg-[var(--brand)] text-white" : "text-[var(--text-subtle)] hover:bg-[var(--surface-soft)]"}`}
                >
                  3 Months
                </button>
                <button
                  type="button"
                  onClick={() => setTimeRangeFilter("one_year")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${timeRangeFilter === "one_year" ? "bg-[var(--brand)] text-white" : "text-[var(--text-subtle)] hover:bg-[var(--surface-soft)]"}`}
                >
                  1 Year
                </button>
              </div>
              <div className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] text-sm text-[var(--text-subtle)]">
                <CalendarDays className="w-4 h-4" /> {timeFilterMeta.label === "This Month" ? currentMonthPeriodLabel : `${timeFilterMeta.start.toISOString().slice(0, 10)} - ${timeFilterMeta.end.toISOString().slice(0, 10)}`}
              </div>
              <ExportButtons />
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-[var(--accent)]/20 bg-gradient-to-r from-[#0b3d38] to-[#0a2a27] px-5 py-4 text-white">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-[var(--accent)]/90">Total Balance (Net Profit)</p>
                <p className="text-3xl font-bold tracking-tight">{formatRupiah(dashboardReport.totalNetProfit)}</p>
                <p className="text-xs text-white/70 mt-1">Net Margin {formatPercent(netMargin)} • {formatNumber(dashboardReport.orders.length)} pesanan</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-semibold">Revenue {formatCompact(dashboardReport.totalRevenue)}</span>
                <span className="rounded-lg bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-semibold">Biaya {formatCompact(dashboardReport.totalPlatformFees)}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
          <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Cash Flow Marketplace</h3>
              <span className="text-xs text-[var(--text-subtle)]">Mode: Aggregated</span>
            </div>
            <RevenueBarChart marketplaces={dashboardReport.marketplaces} />
          </section>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
              <h3 className="font-semibold text-[var(--foreground)] mb-3">Wawasan Cepat</h3>
              <div className="space-y-2 text-sm">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2">
                  <p className="text-xs text-[var(--text-subtle)]">Marketplace tertinggi</p>
                  <p className="font-semibold text-[var(--foreground)] mt-0.5">
                    {topMarketplace ? MARKETPLACE_LABELS[topMarketplace.marketplace] : "-"}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2">
                  <p className="text-xs text-[var(--text-subtle)]">Rata-rata order value</p>
                  <p className="font-semibold text-[var(--foreground)] mt-0.5">{formatRupiah(avgOrderValue)}</p>
                </div>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--accent-soft)] px-3 py-2">
                  <p className="text-xs text-[var(--accent)]">Performa Net Margin</p>
                  <p className="font-semibold text-[var(--accent)] mt-0.5 inline-flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" /> {formatPercent(netMargin)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
              <h3 className="font-semibold text-[var(--foreground)] text-sm mb-4">Breakdown Biaya Platform</h3>
              <FeePieChart marketplaces={dashboardReport.marketplaces} />
            </div>
          </aside>
        </div>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            label="Total Revenue"
            value={formatCompact(dashboardReport.totalRevenue)}
            icon={DollarSign}
          />
          <StatTile
            label="Gross Profit"
            value={formatCompact(dashboardReport.totalGrossProfit)}
            icon={TrendingUp}
          />
          <StatTile
            label="Total Biaya Platform"
            value={formatCompact(dashboardReport.totalPlatformFees)}
            icon={Receipt}
          />
          <StatTile
            label="Net Profit"
            value={formatCompact(dashboardReport.totalNetProfit)}
            icon={ShoppingCart}
          />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
          <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Grafik Laporan ({timeFilterMeta.label})</h3>
                <p className="text-xs text-[var(--text-subtle)] mt-1">
                  Sumber tanggal dari laporan pendapatan/order pada range terpilih.
                </p>
              </div>
              <span className="text-xs text-[var(--text-subtle)]">{currentMonthPeriodLabel}</span>
            </div>
            <MonthlyRevenueLineChart data={currentMonthTrendData} />
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Marketplace Terlaris / Tersepi</h3>
              <div className="space-y-2 text-sm">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                  <p className="text-xs text-emerald-300">Terlaris (by revenue)</p>
                  <p className="text-[var(--foreground)] font-semibold mt-0.5">
                    {marketplaceByRevenue.top ? MARKETPLACE_LABELS[marketplaceByRevenue.top.marketplace] : "-"}
                  </p>
                  <p className="text-xs text-[var(--text-subtle)] mt-0.5">
                    {marketplaceByRevenue.top ? formatRupiah(marketplaceByRevenue.top.totalRevenue) : "-"}
                  </p>
                </div>
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                  <p className="text-xs text-rose-300">Tersepi (by revenue)</p>
                  <p className="text-[var(--foreground)] font-semibold mt-0.5">
                    {marketplaceByRevenue.bottom ? MARKETPLACE_LABELS[marketplaceByRevenue.bottom.marketplace] : "-"}
                  </p>
                  <p className="text-xs text-[var(--text-subtle)] mt-0.5">
                    {marketplaceByRevenue.bottom ? formatRupiah(marketplaceByRevenue.bottom.totalRevenue) : "-"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Produk Terlaris</h3>
            <div className="space-y-2">
              {productPerformance.top.length === 0 ? (
                <p className="text-xs text-[var(--text-subtle)]">Belum ada data produk.</p>
              ) : (
                productPerformance.top.map((item, index) => (
                  <div key={`top-${item.productName}-${index}`} className="rounded-xl border border-[var(--border-subtle)] px-3 py-2 bg-[var(--surface-muted)]">
                    <p className="text-sm text-[var(--foreground)] truncate">{item.productName}</p>
                    <p className="text-xs text-[var(--text-subtle)] mt-0.5">
                      Qty {formatNumber(item.qty)} • Revenue {formatRupiah(item.revenue)} • Net {formatRupiah(item.netProfit)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">Produk Tersepi</h3>
            <div className="space-y-2">
              {productPerformance.bottom.length === 0 ? (
                <p className="text-xs text-[var(--text-subtle)]">Belum ada data produk.</p>
              ) : (
                productPerformance.bottom.map((item, index) => (
                  <div key={`bottom-${item.productName}-${index}`} className="rounded-xl border border-[var(--border-subtle)] px-3 py-2 bg-[var(--surface-muted)]">
                    <p className="text-sm text-[var(--foreground)] truncate">{item.productName}</p>
                    <p className="text-xs text-[var(--text-subtle)] mt-0.5">
                      Qty {formatNumber(item.qty)} • Revenue {formatRupiah(item.revenue)} • Net {formatRupiah(item.netProfit)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)]">
          <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
            <h3 className="font-semibold text-[var(--foreground)]">HPP Dengan Filter</h3>
            <p className="text-xs text-[var(--text-subtle)] mt-1">
              Filter Master SKU / SKU / Nama Produk, rentang HPP, dan status pemakaian.
            </p>
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input
                value={hppSearch}
                onChange={(e) => setHppSearch(e.target.value)}
                placeholder="Cari master SKU, SKU, produk"
                className="field-input"
              />
              <input
                value={hppMin}
                onChange={(e) => setHppMin(e.target.value)}
                placeholder="Min HPP"
                type="number"
                className="field-input"
              />
              <input
                value={hppMax}
                onChange={(e) => setHppMax(e.target.value)}
                placeholder="Max HPP"
                type="number"
                className="field-input"
              />
              <select
                value={hppUsageFilter}
                onChange={(e) => setHppUsageFilter(e.target.value as "all" | "used" | "unused")}
                className="field-input"
              >
                <option value="all">Semua pemakaian</option>
                <option value="used">HPP terpakai</option>
                <option value="unused">HPP tidak terpakai</option>
              </select>
            </div>
            <p className="text-xs text-[var(--text-subtle)] mt-2">
              Menampilkan {formatNumber(filteredHppRows.length)} dari {formatNumber(hppRows.length)} data HPP.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-[var(--text-subtle)]">Rows:</span>
              <select
                value={String(hppRowsPerPage)}
                onChange={(e) => {
                  const value = e.target.value;
                  setHppRowsPerPage(value === "all" ? "all" : Number(value));
                }}
                className="field-input w-auto text-xs py-1.5"
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="100">100</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto border-t border-[var(--border-subtle)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                  <th className="text-left px-4 py-3 text-xs text-[var(--text-subtle)]">
                    <button type="button" onClick={() => toggleHppSort("masterSku")} className="inline-flex items-center gap-1">
                      Master SKU {hppSortKey === "masterSku" ? (hppSortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-[var(--text-subtle)]">
                    <button type="button" onClick={() => toggleHppSort("sku")} className="inline-flex items-center gap-1">
                      SKU {hppSortKey === "sku" ? (hppSortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-[var(--text-subtle)]">
                    <button type="button" onClick={() => toggleHppSort("productName")} className="inline-flex items-center gap-1">
                      Produk {hppSortKey === "productName" ? (hppSortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th className="text-right px-4 py-3 text-xs text-[var(--text-subtle)]">
                    <button type="button" onClick={() => toggleHppSort("cost")} className="inline-flex items-center gap-1">
                      HPP / unit {hppSortKey === "cost" ? (hppSortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                  <th className="text-right px-4 py-3 text-xs text-[var(--text-subtle)]">
                    <button type="button" onClick={() => toggleHppSort("usageQty")} className="inline-flex items-center gap-1">
                      Terpakai Qty {hppSortKey === "usageQty" ? (hppSortDirection === "asc" ? "↑" : "↓") : ""}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {pagedHppRows.map((row) => (
                  <tr key={row.id} className="hover:bg-[var(--surface-soft)]">
                    <td className="px-4 py-3 text-[var(--text-subtle)] font-mono text-xs">{row.masterSku}</td>
                    <td className="px-4 py-3 text-[var(--text-subtle)] font-mono text-xs">{row.sku}</td>
                    <td className="px-4 py-3 text-[var(--foreground)]">{row.productName}</td>
                    <td className="px-4 py-3 text-right text-cyan-300">{formatRupiah(row.cost)}</td>
                    <td className="px-4 py-3 text-right text-[var(--text-subtle)]">{formatNumber(row.usageQty)}</td>
                  </tr>
                ))}
                {sortedHppRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-[var(--text-subtle)]">
                      Tidak ada data HPP yang cocok dengan filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {sortedHppRows.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--surface-muted)]">
              <p className="text-xs text-[var(--text-subtle)]">
                Halaman {hppPage} / {hppTotalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHppPage((prev) => Math.max(1, prev - 1))}
                  disabled={hppPage <= 1 || hppRowsPerPage === "all"}
                  className="px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg disabled:opacity-40 hover:bg-[var(--surface-soft)]"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  onClick={() => setHppPage((prev) => Math.min(hppTotalPages, prev + 1))}
                  disabled={hppPage >= hppTotalPages || hppRowsPerPage === "all"}
                  className="px-3 py-1.5 text-xs border border-[var(--border-subtle)] rounded-lg disabled:opacity-40 hover:bg-[var(--surface-soft)]"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </section>

        {/* AI Insight Panel — shown if at least one saved report exists */}
        {savedReports.length > 0 && savedReports[0]?.id && (
          <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
            <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-[var(--surface-muted)]" />}>
              <AiInsightPanel reportId={savedReports[0].id} />
            </Suspense>
          </section>
        )}

        <SaveReportCard
          buildReportForMarketplace={buildReportForMarketplace}
          marketplaceOptions={dashboardReport.marketplaces.map((item) => item.marketplace)}
        />

        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] mb-6">
          <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
            <h3 className="font-semibold text-[var(--foreground)]">Ringkasan per Marketplace</h3>
          </div>
          <MarketplaceTable reportData={dashboardReport} />
        </section>

        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)]">
          <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-[var(--foreground)]">Detail per Pesanan</h3>
                <p className="text-xs text-[var(--text-subtle)] mt-0.5">
                  Order retur Shopee (settlement=0, biaya=0) otomatis dikecualikan. Untuk order lain yang perlu dihapus, klik tombol <strong>Hapus</strong> di kolom paling kanan tiap baris.
                </p>
              </div>
              {deletedOrderKeys.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDeletedOrderKeys([])}
                  className="shrink-0 border border-amber-300 bg-amber-50 text-amber-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-amber-100"
                >
                  Pulihkan {formatNumber(deletedOrderKeys.length)} order
                </button>
              )}
            </div>
            {deletedOrderKeys.length > 0 && (
              <p className="text-xs text-red-600 mt-1">
                Dihapus manual: {formatNumber(deletedOrderKeys.length)} order
              </p>
            )}
            {canceledOrderSummary.total > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                Order cancel dikecualikan: {formatNumber(canceledOrderSummary.total)}
                {canceledOrderSummary.byMarketplace.length > 0
                  ? ` (${canceledOrderSummary.byMarketplace.join(" • ")})`
                  : ""}
              </p>
            )}
          </div>
          <OrderDetailTable
            orders={dashboardReport.orders}
            allOrders={dashboardReport.orders}
            uploadSets={uploadSets}
            hppEntries={hppEntries}
            marketplaceFilter={dashboardMarketplaceFilter}
            onMarketplaceFilterChange={setDashboardMarketplaceFilter}
            onDeleteOrder={handleDeleteOrder}
            deletedOrderCount={deletedOrderKeys.length}
            onResetDeletedOrders={() => setDeletedOrderKeys([])}
          />
        </section>

      </div>
    </AuthAreaLayout>
  );
}

function ExportButtons() {
  const { report } = useAppStore();

  const handleExcelExport = async () => {
    if (!report) return;
    const { exportToExcel } = await import("@/lib/export/excel");
    exportToExcel(report);
  };

  const handlePdfExport = async () => {
    if (!report) return;
    const { exportToPdf } = await import("@/lib/export/pdf");
    exportToPdf(report);
  };

  return (
    <>
      <button
        onClick={handleExcelExport}
        className="flex items-center gap-1.5 px-3 py-2 border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-subtle)] hover:bg-[var(--surface-muted)] transition-colors"
      >
        <Download className="w-4 h-4" />
        Excel
      </button>
      <button
        onClick={handlePdfExport}
        className="flex items-center gap-1.5 px-3 py-2 bg-[var(--brand)] text-[var(--background)] rounded-lg text-sm hover:bg-[var(--brand-hover)] transition-colors"
      >
        <Download className="w-4 h-4" />
        PDF
      </button>
    </>
  );
}
