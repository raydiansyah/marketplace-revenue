/**
 * Module: Upload Result Page
 * Purpose: Menampilkan hasil rekonsiliasi upload (order, fee, HPP, net profit) beserta modal detail pesanan.
 * Used by: Route `/upload/result` melalui Next.js App Router.
 * Dependencies: useAppStore (state upload/report), generateReportFromSets(), komponen chart, formatter util.
 * Public functions: UploadResultPage(), helper kalkulasi lokal untuk sorting, lookup SKU, dan ringkasan modal.
 * Side effects: Update store laporan/HPP, simpan laporan, sinkronisasi report tersimpan, copy order ID ke clipboard.
 */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import AuthAreaLayout from "@/components/AuthAreaLayout";
import RevenueBarChart from "@/components/charts/RevenueBarChart";
import FeePieChart from "@/components/charts/FeePieChart";
import { generateReportFromSets } from "@/lib/reconcile";
import { useAppStore } from "@/store/app-store";
import { useNotification } from "@/lib/notifications/notification-context";
import {
  MARKETPLACE_LABELS,
  type CalculatedOrder,
  type HppEntry,
  type MarketplaceId,
  type MarketplaceSummary,
  type RawOrder,
  type RevenueReport,
} from "@/lib/types";
import { formatNumber, formatPercent, formatRupiah } from "@/lib/utils";

type SortKey =
  | "no"
  | "orderId"
  | "orderDate"
  | "productName"
  | "sku"
  | "masterSku"
  | "hppMatch"
  | "marketplace"
  | "qty"
  | "revenue"
  | "hpp"
  | "platformFee"
  | "netProfit"
  | "margin";

type EnrichedOrder = CalculatedOrder & {
  hppMatched: boolean;
  matchedMasterSku: string;
};

function normalizeSkuKey(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/^'+/, "")
    .replace(/\.0+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function splitSkuAliases(value: string): string[] {
  return String(value ?? "")
    .split(/[,\n;|/]+/g)
    .map((part) => normalizeSkuKey(part))
    .filter(Boolean);
}

function splitSkuAliasesRaw(value: string): string[] {
  return String(value ?? "")
    .split(/[,\n;|/]+/g)
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
}

function entryHasSkuAlias(entry: HppEntry, normalizedSku: string): boolean {
  if (!normalizedSku) return false;
  const aliases = new Set<string>([
    ...splitSkuAliases(entry.sku),
    ...splitSkuAliases(entry.masterSku || ""),
  ]);
  return aliases.has(normalizedSku);
}

function decorateOrderWithHppMeta(order: CalculatedOrder, hppEntries: HppEntry[]): EnrichedOrder {
  const normalizedOrderSku = normalizeSkuKey(order.sku);
  if (!normalizedOrderSku) {
    return {
      ...order,
      hppMatched: false,
      matchedMasterSku: "-",
    };
  }

  const matchedEntry = hppEntries.find(
    (entry) => entry.cost > 0 && entryHasSkuAlias(entry, normalizedOrderSku)
  );

  return {
    ...order,
    hppMatched: Boolean(matchedEntry),
    matchedMasterSku: (matchedEntry?.masterSku || matchedEntry?.sku || "-").trim() || "-",
  };
}

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

type HppLookupResult = {
  cost: number;
  matchedEntry: HppEntry | null;
};

function lookupHppMatchForLine(sku: string, productName: string, hppEntries: HppEntry[]): HppLookupResult {
  if (!hppEntries.length) return { cost: 0, matchedEntry: null };

  const normalizeName = (value: string) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const normalizedSku = normalizeSkuKey(sku);
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

function rebuildScopedReport(report: RevenueReport, marketplaceFilter: "all" | MarketplaceId): RevenueReport {
  if (marketplaceFilter === "all") return report;

  const marketplaceSummary = report.marketplaces.find((m) => m.marketplace === marketplaceFilter);
  if (!marketplaceSummary) {
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

  const orders = report.orders.filter((order) => order.marketplace === marketplaceFilter);
  return {
    ...report,
    marketplaces: [marketplaceSummary],
    totalRevenue: marketplaceSummary.totalRevenue,
    totalHpp: marketplaceSummary.totalHpp,
    totalGrossProfit: marketplaceSummary.totalGrossProfit,
    totalPlatformFees: marketplaceSummary.totalPlatformFees,
    totalNetProfit: marketplaceSummary.totalNetProfit,
    orders,
  };
}

export default function UploadResultPage() {
  const { notify } = useNotification();
  const uploadPreviewReport = useAppStore((state) => state.uploadPreviewReport);
  const setUploadPreviewReport = useAppStore((state) => state.setUploadPreviewReport);
  const reportSource = useAppStore((state) => state.reportSource);
  const activeSavedReportId = useAppStore((state) => state.activeSavedReportId);
  const setReport = useAppStore((state) => state.setReport);
  const hppEntries = useAppStore((state) => state.hppEntries);
  const replaceHppEntriesAndSync = useAppStore((state) => state.replaceHppEntriesAndSync);
  const hppLoading = useAppStore((state) => state.hppLoading);
  const loadHpp = useAppStore((state) => state.loadHpp);
  const uploadSets = useAppStore((state) => state.uploadSets);
  const configs = useAppStore((state) => state.configs);
  const saveStoreReport = useAppStore((state) => state.saveStoreReport);
  const updateSavedReportContent = useAppStore((state) => state.updateSavedReportContent);

  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveStoreName, setSaveStoreName] = useState("");
  const [savingReport, setSavingReport] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [query, setQuery] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState<"all" | MarketplaceId>("all");
  const [profitFilter, setProfitFilter] = useState<"all" | "profit" | "loss">("all");
  const [rowsPerPage, setRowsPerPage] = useState<number | "all">(20);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("orderDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedOrder, setSelectedOrder] = useState<EnrichedOrder | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

  const [hppMapTarget, setHppMapTarget] = useState<{
    orderId: string;
    marketplace: MarketplaceId;
    sku: string;
    productName: string;
  } | null>(null);
  const [hppOptionQuery, setHppOptionQuery] = useState("");
  const [selectedHppOptionKey, setSelectedHppOptionKey] = useState("");
  const [hppMapperError, setHppMapperError] = useState<string | null>(null);
  const [savingHppMapping, setSavingHppMapping] = useState(false);

  const syncSavedReportIfNeeded = async (report: RevenueReport) => {
    if (reportSource !== "saved" || !activeSavedReportId) return true;
    return updateSavedReportContent(activeSavedReportId, report);
  };

  const orderSequenceMap = useMemo(() => {
    const map = new Map<string, number>();
    (uploadPreviewReport?.orders ?? []).forEach((order, index) => {
      const key = `${order.marketplace}:${normalizeOrderId(order.orderId)}`;
      if (!map.has(key)) map.set(key, index + 1);
    });
    return map;
  }, [uploadPreviewReport]);

  const orderSkuCountMap = useMemo(() => {
    const map = new Map<string, number>();

    for (const [marketplace, set] of Object.entries(uploadSets) as Array<[MarketplaceId, typeof uploadSets[MarketplaceId]]>) {
      if (!set) continue;
      const perOrder = new Map<string, Set<string>>();

      const allLines = set.orderFiles.flatMap((file) => file.rawOrders);
      for (const line of allLines) {
        const orderKey = `${marketplace}:${normalizeOrderId(line.orderId)}`;
        if (!perOrder.has(orderKey)) perOrder.set(orderKey, new Set<string>());
        const sku = resolveLineSku(line);
        const skuKey = normalizeSkuKey(sku) || `product:${String(line.productName || "").trim().toLowerCase()}`;
        perOrder.get(orderKey)?.add(skuKey);
      }

      perOrder.forEach((skuSet, key) => map.set(key, skuSet.size));
    }

    return map;
  }, [uploadSets]);

  const returnQtyBadgeMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const [marketplace, set] of Object.entries(uploadSets) as Array<[MarketplaceId, typeof uploadSets[MarketplaceId]]>) {
      if (!set?.returnOrderFile?.transactions?.length) continue;
      for (const tx of set.returnOrderFile.transactions) {
        const key = `${marketplace}:${normalizeOrderId(tx.orderId)}`;
        map.set(key, (map.get(key) ?? 0) + Math.max(0, tx.returnQuantity || 0));
      }
    }
    return map;
  }, [uploadSets]);

  const enrichedOrders = useMemo(() => {
    if (!uploadPreviewReport) return [] as EnrichedOrder[];
    return uploadPreviewReport.orders.map((order) => decorateOrderWithHppMeta(order, hppEntries));
  }, [uploadPreviewReport, hppEntries]);

  useEffect(() => {
    if (!selectedOrder) return;
    const refreshed = enrichedOrders.find(
      (order) =>
        order.marketplace === selectedOrder.marketplace &&
        normalizeOrderId(order.orderId) === normalizeOrderId(selectedOrder.orderId)
    );
    if (!refreshed) {
      setSelectedOrder(null);
      return;
    }

    const sameSnapshot =
      refreshed.sku === selectedOrder.sku &&
      refreshed.hpp === selectedOrder.hpp &&
      refreshed.revenue === selectedOrder.revenue &&
      refreshed.netProfit === selectedOrder.netProfit &&
      refreshed.fees.totalPlatformFee === selectedOrder.fees.totalPlatformFee &&
      refreshed.hppMatched === selectedOrder.hppMatched &&
      refreshed.matchedMasterSku === selectedOrder.matchedMasterSku;

    if (!sameSnapshot) setSelectedOrder(refreshed);
  }, [selectedOrder, enrichedOrders]);

  const displayReport = useMemo(() => {
    if (!uploadPreviewReport) return null;
    return rebuildScopedReport(uploadPreviewReport, marketplaceFilter);
  }, [uploadPreviewReport, marketplaceFilter]);

  const netMargin = useMemo(() => {
    if (!displayReport || displayReport.totalRevenue <= 0) return 0;
    return (displayReport.totalNetProfit / displayReport.totalRevenue) * 100;
  }, [displayReport]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enrichedOrders.filter((order) => {
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
  }, [enrichedOrders, marketplaceFilter, profitFilter, query]);

  const sortedOrders = useMemo(() => {
    const list = [...filteredOrders];
    list.sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;
      if (sortKey === "no") {
        const aSeq = orderSequenceMap.get(`${a.marketplace}:${normalizeOrderId(a.orderId)}`) ?? 0;
        const bSeq = orderSequenceMap.get(`${b.marketplace}:${normalizeOrderId(b.orderId)}`) ?? 0;
        return (aSeq - bSeq) * dir;
      }
      if (sortKey === "orderDate") {
        const aTs = parseDateLoose(a.orderDate)?.getTime() ?? 0;
        const bTs = parseDateLoose(b.orderDate)?.getTime() ?? 0;
        return (aTs - bTs) * dir;
      }
      if (sortKey === "qty") return (a.qty - b.qty) * dir;
      if (sortKey === "revenue") return (a.revenue - b.revenue) * dir;
      if (sortKey === "hpp") return (a.hpp - b.hpp) * dir;
      if (sortKey === "platformFee") return (a.fees.totalPlatformFee - b.fees.totalPlatformFee) * dir;
      if (sortKey === "netProfit") return (a.netProfit - b.netProfit) * dir;
      if (sortKey === "margin") return (a.netMargin - b.netMargin) * dir;
      if (sortKey === "hppMatch") {
        const av = a.hppMatched && a.hpp > 0 ? 1 : 0;
        const bv = b.hppMatched && b.hpp > 0 ? 1 : 0;
        return (av - bv) * dir;
      }
      if (sortKey === "marketplace") {
        return MARKETPLACE_LABELS[a.marketplace].localeCompare(MARKETPLACE_LABELS[b.marketplace], "id", {
          sensitivity: "base",
        }) * dir;
      }
      if (sortKey === "masterSku") {
        return a.matchedMasterSku.localeCompare(b.matchedMasterSku, "id", { sensitivity: "base" }) * dir;
      }
      return String(a[sortKey]).localeCompare(String(b[sortKey]), "id", { sensitivity: "base" }) * dir;
    });
    return list;
  }, [filteredOrders, sortDirection, sortKey, orderSequenceMap]);

  const totals = useMemo(() => {
    return sortedOrders.reduce(
      (acc, order) => {
        acc.qty += order.qty;
        acc.revenue += order.revenue;
        acc.hpp += order.hpp;
        acc.platformFee += order.fees.totalPlatformFee;
        acc.netProfit += order.netProfit;
        return acc;
      },
      { qty: 0, revenue: 0, hpp: 0, platformFee: 0, netProfit: 0 }
    );
  }, [sortedOrders]);

  const unmatchedCount = useMemo(() => sortedOrders.filter((order) => order.hpp <= 0).length, [sortedOrders]);

  const totalPages = useMemo(() => {
    if (rowsPerPage === "all") return 1;
    return Math.max(1, Math.ceil(sortedOrders.length / rowsPerPage));
  }, [rowsPerPage, sortedOrders.length]);

  useEffect(() => {
    setPage(1);
  }, [query, marketplaceFilter, profitFilter, rowsPerPage, sortKey, sortDirection]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pagedOrders = useMemo(() => {
    if (rowsPerPage === "all") return sortedOrders;
    const start = (page - 1) * rowsPerPage;
    return sortedOrders.slice(start, start + rowsPerPage);
  }, [page, rowsPerPage, sortedOrders]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "orderId" || key === "productName" || key === "sku" || key === "masterSku" || key === "marketplace" ? "asc" : "desc");
  };

  const handleSaveReport = async () => {
    if (!uploadPreviewReport || !saveStoreName.trim()) return;
    setSavingReport(true);
    setSaveError(null);

    // Simpan per marketplace yang ada di report
    const marketplaces = uploadPreviewReport.marketplaces.map((m) => m.marketplace);
    const primaryMarketplace = marketplaces[0] ?? "shopee";

    const result = await saveStoreReport({
      storeName: saveStoreName.trim(),
      marketplace: primaryMarketplace,
      report: uploadPreviewReport,
    });

    setSavingReport(false);
    if (result) {
      setSaveSuccess(true);
      setShowSaveForm(false);
      setSaveStoreName("");
      window.setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      setSaveError("Gagal menyimpan laporan. Pastikan sudah login dan coba lagi.");
    }
  };

  const handleCopyOrderId = async (orderId: string) => {
    try {
      await navigator.clipboard.writeText(orderId);
      setCopiedOrderId(orderId);
      window.setTimeout(() => {
        setCopiedOrderId((current) => (current === orderId ? null : current));
      }, 1400);
    } catch {
      setCopiedOrderId(null);
    }
  };

  const handleDeleteOrder = async (orderToDelete: EnrichedOrder) => {
    if (!uploadPreviewReport) return;

    const remainingOrders = uploadPreviewReport.orders.filter(
      (o) =>
        !(
          o.marketplace === orderToDelete.marketplace &&
          normalizeOrderId(o.orderId) === normalizeOrderId(orderToDelete.orderId)
        )
    );

    const marketplaceMap = new Map<MarketplaceId, CalculatedOrder[]>();
    for (const order of remainingOrders) {
      if (!marketplaceMap.has(order.marketplace)) marketplaceMap.set(order.marketplace, []);
      marketplaceMap.get(order.marketplace)!.push(order);
    }

    const marketplaces: MarketplaceSummary[] = Array.from(marketplaceMap.entries()).map(
      ([marketplace, orders]) => {
        const totalRevenue = orders.reduce((s, o) => s + o.revenue, 0);
        const totalHpp = orders.reduce((s, o) => s + o.hpp, 0);
        const totalGrossProfit = totalRevenue - totalHpp;
        const totalPlatformFees = orders.reduce((s, o) => s + o.fees.totalPlatformFee, 0);
        const totalNetProfit = totalGrossProfit - totalPlatformFees;
        const feeBreakdown = orders.reduce(
          (acc, o) => ({
            commission: acc.commission + o.fees.commissionFee,
            transactionFee: acc.transactionFee + o.fees.transactionFee,
            freeShipping: acc.freeShipping + o.fees.freeShippingFee,
            orderProcessing: acc.orderProcessing + o.fees.orderProcessingFee,
            voucher: acc.voucher + o.fees.voucherBySeller,
            affiliate: acc.affiliate + o.fees.affiliateCommission,
            other: acc.other + o.fees.otherFees,
          }),
          { commission: 0, transactionFee: 0, freeShipping: 0, orderProcessing: 0, voucher: 0, affiliate: 0, other: 0 }
        );
        return {
          marketplace,
          totalOrders: orders.length,
          totalRevenue,
          totalHpp,
          totalGrossProfit,
          totalPlatformFees,
          totalNetProfit,
          avgGrossMargin: totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0,
          avgNetMargin: totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0,
          feeBreakdown,
        };
      }
    );

    const totalRevenue = marketplaces.reduce((s, m) => s + m.totalRevenue, 0);
    const totalHpp = marketplaces.reduce((s, m) => s + m.totalHpp, 0);
    const totalGrossProfit = totalRevenue - totalHpp;
    const totalPlatformFees = marketplaces.reduce((s, m) => s + m.totalPlatformFees, 0);

    const nextReport = {
      ...uploadPreviewReport,
      orders: remainingOrders,
      marketplaces,
      totalRevenue,
      totalHpp,
      totalGrossProfit,
      totalPlatformFees,
      totalNetProfit: totalGrossProfit - totalPlatformFees,
    };
    setUploadPreviewReport(nextReport);
    const ok = await syncSavedReportIfNeeded(nextReport);
    if (!ok) {
      notify("warning", "Perubahan hanya tersimpan lokal. Gagal update laporan tersimpan.");
    }
  };

  const selectedOrderLines = useMemo(() => {
    if (!selectedOrder) return [];

    const set = uploadSets[selectedOrder.marketplace];
    const normalized = normalizeOrderId(selectedOrder.orderId);
    const lines = (set?.orderFiles ?? [])
      .flatMap((file) => file.rawOrders)
      .filter((row) => normalizeOrderId(row.orderId) === normalized);

    if (lines.length > 0) return dedupeOrderLines(lines);

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

  const modalSummary = useMemo(() => {
    if (!selectedOrder) {
      return {
        totalQty: 0,
        totalRevenue: 0,
        totalHpp: 0,
        totalGrossProfit: 0,
        totalPlatformFee: 0,
        settlementAdjustment: 0,
        totalNetProfit: 0,
      };
    }

    const totalQty = selectedOrderLines.reduce((sum, line) => sum + line.qty, 0);
    const totalRevenueFromLines = selectedOrderLines.reduce(
      (sum, line) => sum + Math.max(0, (line.actualPrice || 0) * line.qty),
      0
    );
    const totalRevenue =
      selectedOrder.marketplace === "tokopedia" && selectedOrder.revenue > 0
        ? selectedOrder.revenue
        : totalRevenueFromLines > 0
          ? totalRevenueFromLines
          : selectedOrder.revenue;

    const totalHpp = selectedOrderLines.reduce((sum, line) => {
      const resolvedSku = resolveLineSku(line);
      const hppMatch = lookupHppMatchForLine(resolvedSku, line.productName, hppEntries);
      return sum + hppMatch.cost * line.qty;
    }, 0);

    const totalPlatformFee = selectedOrder.fees.totalPlatformFee;
    const totalGrossProfit = totalRevenue - totalHpp;
    const settlementAmount = selectedOrder.settlementAmount ?? 0;
    const settlementAdjustment =
      settlementAmount !== 0
        ? settlementAmount - (totalRevenue - totalPlatformFee)
        : 0;
    const totalNetProfit = totalGrossProfit - totalPlatformFee + settlementAdjustment;

    return {
      totalQty,
      totalRevenue,
      totalHpp,
      totalGrossProfit,
      totalPlatformFee,
      settlementAdjustment,
      totalNetProfit,
    };
  }, [selectedOrder, selectedOrderLines, hppEntries]);

  const selectedOrderSkuBreakdowns = useMemo(() => {
    if (!selectedOrder || selectedOrderLines.length === 0) return [] as Array<{
      sku: string;
      qty: number;
      allocatedRevenue: number;
      allocatedFee: number;
      allocatedAdjustment: number;
      hpp: number;
      hppUnitAvg: number;
      grossProfit: number;
      grossMargin: number;
      netProfit: number;
      netMargin: number;
      masterSkus: string[];
      products: string[];
    }>;

    const totalRevenueFromLines = selectedOrderLines.reduce(
      (sum, line) => sum + Math.max(0, (line.actualPrice || 0) * line.qty),
      0
    );

    const totalRevenue =
      selectedOrder.marketplace === "tokopedia" && selectedOrder.revenue > 0
        ? selectedOrder.revenue
        : totalRevenueFromLines > 0
          ? totalRevenueFromLines
          : selectedOrder.revenue;

    const grouped = new Map<
      string,
      {
        sku: string;
        qty: number;
        weight: number;
        allocatedRevenue: number;
        allocatedFee: number;
        allocatedAdjustment: number;
        hpp: number;
        hppUnitAvg: number;
        grossProfit: number;
        grossMargin: number;
        netProfit: number;
        netMargin: number;
        masterSkus: Set<string>;
        products: Set<string>;
      }
    >();

    const totalWeight = selectedOrderLines.reduce((sum, line) => {
      const weight = Math.max(0, (line.actualPrice || 0) * line.qty);
      return sum + weight;
    }, 0);
    const settlementAdjustment =
      (selectedOrder.settlementAmount ?? 0) !== 0
        ? (selectedOrder.settlementAmount ?? 0) - (totalRevenue - selectedOrder.fees.totalPlatformFee)
        : 0;

    selectedOrderLines.forEach((line) => {
      const sku = resolveLineSku(line) || "-";
      const lineKey = normalizeSkuKey(sku) || `${line.productName.toLowerCase()}-no-sku`;
      const current = grouped.get(lineKey) ?? {
        sku,
        qty: 0,
        weight: 0,
        allocatedRevenue: 0,
        allocatedFee: 0,
        allocatedAdjustment: 0,
        hpp: 0,
        hppUnitAvg: 0,
        grossProfit: 0,
        grossMargin: 0,
        netProfit: 0,
        netMargin: 0,
        masterSkus: new Set<string>(),
        products: new Set<string>(),
      };

      const weight = Math.max(0, (line.actualPrice || 0) * line.qty);
      const ratio = totalWeight > 0 ? weight / totalWeight : 1 / Math.max(1, selectedOrderLines.length);

      const hppMatch = lookupHppMatchForLine(sku, line.productName, hppEntries);
      const lineHpp = hppMatch.cost * line.qty;
      const mappedMasterSku = (hppMatch.matchedEntry?.masterSku || hppMatch.matchedEntry?.sku || "").trim();

      current.qty += line.qty;
      current.weight += weight;
      current.allocatedRevenue += totalRevenue * ratio;
      current.allocatedFee += selectedOrder.fees.totalPlatformFee * ratio;
      current.allocatedAdjustment += settlementAdjustment * ratio;
      current.hpp += lineHpp;
      if (mappedMasterSku) current.masterSkus.add(mappedMasterSku);
      current.products.add(line.productName);

      grouped.set(lineKey, current);
    });

    return Array.from(grouped.values()).map((group) => {
      group.hppUnitAvg = group.qty > 0 ? group.hpp / group.qty : 0;
      group.grossProfit = group.allocatedRevenue - group.hpp;
      group.grossMargin = group.allocatedRevenue > 0 ? (group.grossProfit / group.allocatedRevenue) * 100 : 0;
      group.netProfit = group.grossProfit - group.allocatedFee + group.allocatedAdjustment;
      group.netMargin = group.allocatedRevenue > 0 ? (group.netProfit / group.allocatedRevenue) * 100 : 0;

      return {
        sku: group.sku,
        qty: group.qty,
        allocatedRevenue: group.allocatedRevenue,
        allocatedFee: group.allocatedFee,
        allocatedAdjustment: group.allocatedAdjustment,
        hpp: group.hpp,
        hppUnitAvg: group.hppUnitAvg,
        grossProfit: group.grossProfit,
        grossMargin: group.grossMargin,
        netProfit: group.netProfit,
        netMargin: group.netMargin,
        masterSkus: Array.from(group.masterSkus),
        products: Array.from(group.products),
      };
    });
  }, [selectedOrder, selectedOrderLines, hppEntries]);

  const masterHppOptions = useMemo(() => {
    const map = new Map<string, {
      key: string;
      masterProductName: string;
      masterSku: string;
      rawSku: string;
      rawProductName: string;
      cost: number;
    }>();

    for (const entry of hppEntries) {
      const masterProductName = (entry.masterProductName || entry.productName || "").trim();
      const masterSku = (entry.masterSku || entry.sku || "-").trim() || "-";
      const rawSku = (entry.sku || "").trim();
      const rawProductName = (entry.productName || "").trim();
      if (!masterProductName) continue;

      const key = `${masterProductName.toLowerCase()}|${masterSku.toLowerCase()}|${entry.cost}`;
      if (!map.has(key)) {
        map.set(key, { key, masterProductName, masterSku, rawSku, rawProductName, cost: entry.cost });
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
    return masterHppOptions.filter((option) => {
      const searchTarget = [
        option.masterProductName,
        option.masterSku,
        option.rawSku,
        option.rawProductName,
      ].join(" ").toLowerCase();
      return searchTarget.includes(q);
    });
  }, [hppOptionQuery, masterHppOptions]);

  const openHppMapper = (order: EnrichedOrder) => {
    setHppMapTarget({
      orderId: order.orderId,
      marketplace: order.marketplace,
      sku: order.sku || "",
      productName: order.productName || "",
    });
    setHppOptionQuery("");
    setSelectedHppOptionKey("");
    setHppMapperError(null);
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
    setHppMapperError(null);
  };

  const mapTargetSkuOptions = useMemo(() => {
    if (!hppMapTarget) return [] as Array<{ sku: string; productName: string; qty: number }>;
    const set = uploadSets[hppMapTarget.marketplace];
    if (!set) return [];

    const normalizedOrderId = normalizeOrderId(hppMapTarget.orderId);
    const rawLines = set.orderFiles
      .flatMap((file) => file.rawOrders)
      .filter((line) => normalizeOrderId(line.orderId) === normalizedOrderId);

    const grouped = new Map<string, { sku: string; productName: string; qty: number }>();
    for (const line of rawLines) {
      const sku = resolveLineSku(line) || "";
      const key = normalizeSkuKey(sku) || `product:${String(line.productName || "").trim().toLowerCase()}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          sku,
          productName: line.productName || "",
          qty: line.qty || 0,
        });
      } else {
        existing.qty += line.qty || 0;
      }
    }

    return Array.from(grouped.values());
  }, [hppMapTarget, uploadSets]);

  const applyHppMapping = async () => {
    setHppMapperError(null);
    if (!hppMapTarget) return;
    if (!selectedHppOptionKey) {
      setHppMapperError("Pilih master HPP terlebih dahulu.");
      return;
    }
    const selectedOption = masterHppOptions.find((option) => option.key === selectedHppOptionKey);
    if (!selectedOption) {
      setHppMapperError("Master HPP tidak ditemukan. Silakan pilih ulang.");
      return;
    }

    const targetSkuRaw = String(hppMapTarget.sku ?? "").trim();
    const isMultiSkuTarget = normalizeSkuKey(targetSkuRaw) === "multisku";
    const effectiveSku = isMultiSkuTarget
      ? String(mapTargetSkuOptions.find((item) => String(item.sku || "").trim())?.sku ?? "").trim()
      : targetSkuRaw;
    if (!effectiveSku && isMultiSkuTarget) {
      setHppMapperError("SKU target tidak ditemukan. Buka detail order lalu pilih HPP per SKU.");
      return;
    }

    const selectedSkuMeta = mapTargetSkuOptions.find((item) => item.sku === effectiveSku);
    const targetProductName = String(
      selectedSkuMeta?.productName || hppMapTarget.productName || selectedOption.masterProductName
    ).trim();
    const nextEntries = [...hppEntries];

    if (effectiveSku) {
      const normalizedTargetSku = normalizeSkuKey(effectiveSku);
      const exactIndex = nextEntries.findIndex((entry) => normalizeSkuKey(entry.sku) === normalizedTargetSku);
      const aliasIndex =
        exactIndex >= 0
          ? -1
          : nextEntries.findIndex((entry) => entryHasSkuAlias(entry, normalizedTargetSku));
      const mappedEntry: HppEntry = {
        sku: effectiveSku,
        productName: targetProductName || selectedOption.masterProductName,
        masterProductName: selectedOption.masterProductName,
        masterSku: selectedOption.masterSku === "-" ? "" : selectedOption.masterSku,
        cost: selectedOption.cost,
      };

      if (exactIndex >= 0) {
        nextEntries[exactIndex] = { ...nextEntries[exactIndex], ...mappedEntry };
      } else if (aliasIndex >= 0) {
        const aliasParts = splitSkuAliasesRaw(nextEntries[aliasIndex].sku);
        const remainingAliases = aliasParts.filter((alias) => normalizeSkuKey(alias) !== normalizedTargetSku);
        if (remainingAliases.length > 0) {
          nextEntries[aliasIndex] = {
            ...nextEntries[aliasIndex],
            sku: remainingAliases.join(", "),
          };
          nextEntries.push(mappedEntry);
        } else {
          nextEntries[aliasIndex] = { ...nextEntries[aliasIndex], ...mappedEntry };
        }
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

    setSavingHppMapping(true);
    const ok = await replaceHppEntriesAndSync(nextEntries);
    setSavingHppMapping(false);
    if (!ok) {
      setHppMapperError("Gagal menyimpan mapping HPP ke database. Coba lagi.");
      notify("error", "Gagal menyimpan mapping HPP ke database.");
      return;
    }

    const persistedEntries = useAppStore.getState().hppEntries;
    const nextReport = generateReportFromSets(uploadSets, persistedEntries, configs);
    setUploadPreviewReport(nextReport);
    const reportSaved = await syncSavedReportIfNeeded(nextReport);
    if (!reportSaved) {
      notify("warning", "Mapping HPP diterapkan, tetapi gagal update laporan tersimpan.");
    }
    if (selectedOrder) {
      const refreshed = nextReport.orders.find(
        (order) =>
          order.marketplace === selectedOrder.marketplace &&
          normalizeOrderId(order.orderId) === normalizeOrderId(selectedOrder.orderId)
      );
      if (refreshed) setSelectedOrder(decorateOrderWithHppMeta(refreshed, persistedEntries));
    }
    setHppMapTarget(null);
    setHppMapperError(null);
    notify("success", "Mapping HPP berhasil disimpan.");
  };

  const handleRemoveHppForSku = async (skuDetail: { sku: string; products: string[] }) => {
    const label = skuDetail.sku && skuDetail.sku !== "-" ? skuDetail.sku : skuDetail.products[0] || "SKU ini";
    if (!confirm(`Hapus mapping HPP untuk "${label}"? Perhitungan HPP untuk SKU ini akan menjadi 0.`)) return;

    const normalizedTargetSku = normalizeSkuKey(skuDetail.sku);
    let nextEntries: HppEntry[];

    if (normalizedTargetSku && normalizedTargetSku !== "-") {
      const mutated: HppEntry[] = [];
      for (const entry of hppEntries) {
        if (!entryHasSkuAlias(entry, normalizedTargetSku)) {
          mutated.push(entry);
          continue;
        }

        const aliasParts = splitSkuAliasesRaw(entry.sku);
        if (aliasParts.length <= 1) {
          continue;
        }

        const remainingAliases = aliasParts.filter((alias) => normalizeSkuKey(alias) !== normalizedTargetSku);
        if (remainingAliases.length <= 0) continue;
        mutated.push({ ...entry, sku: remainingAliases.join(", ") });
      }
      nextEntries = mutated;
    } else {
      const targetName = (skuDetail.products[0] || "").trim().toLowerCase();
      nextEntries = hppEntries.filter(
        (e) => String(e.productName ?? "").trim().toLowerCase() !== targetName
      );
    }

    setSavingHppMapping(true);
    const ok = await replaceHppEntriesAndSync(nextEntries);
    setSavingHppMapping(false);
    if (!ok) {
      setHppMapperError("Gagal menghapus mapping HPP dari database. Coba lagi.");
      notify("error", "Gagal menghapus mapping HPP dari database.");
      return;
    }

    const persistedEntries = useAppStore.getState().hppEntries;
    const nextReport = generateReportFromSets(uploadSets, persistedEntries, configs);
    setUploadPreviewReport(nextReport);
    const reportSaved = await syncSavedReportIfNeeded(nextReport);
    if (!reportSaved) {
      notify("warning", "HPP berhasil dihapus, tetapi gagal update laporan tersimpan.");
    }

    if (selectedOrder) {
      const refreshed = nextReport.orders.find(
        (order) =>
          order.marketplace === selectedOrder.marketplace &&
          normalizeOrderId(order.orderId) === normalizeOrderId(selectedOrder.orderId)
      );
      if (refreshed) setSelectedOrder(decorateOrderWithHppMeta(refreshed, persistedEntries));
    }
    notify("success", "Mapping HPP berhasil dihapus.");
  };

  if (!uploadPreviewReport || !displayReport) {
    return (
      <AuthAreaLayout contentClassName="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-8 text-center">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-[var(--text-subtle)]" />
            <h1 className="mt-4 text-xl font-bold text-[var(--foreground)]">Belum ada hasil hitung upload</h1>
            <p className="mt-2 text-sm text-[var(--text-subtle)]">Hitung revenue dari halaman upload terlebih dahulu.</p>
            <Link href="/upload" className="mt-5 inline-flex items-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)]">
              Ke Halaman Upload
            </Link>
          </div>
        </div>
      </AuthAreaLayout>
    );
  }

  return (
    <AuthAreaLayout contentClassName="dashboard-theme px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1320px] space-y-6">
        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <Link href="/upload" className="inline-flex items-center gap-1 text-xs text-[var(--text-subtle)] hover:text-[var(--foreground)]">
                <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Upload
              </Link>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--foreground)]">Hasil Perhitungan Upload</h1>
              <p className="mt-1 text-sm text-[var(--text-subtle)]">
                Snapshot audit upload terbaru • {new Date(uploadPreviewReport.generatedAt).toLocaleString("id-ID")}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                {/* Simpan Laporan */}
                {saveSuccess ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-2 text-sm font-medium text-emerald-400">
                    <Check className="h-4 w-4" /> Laporan tersimpan
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setShowSaveForm((v) => !v); setSaveError(null); }}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-hover)] transition-colors"
                  >
                    <Save className="h-4 w-4" />
                    Simpan Laporan
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setReport(uploadPreviewReport, "computed")}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-soft)]"
                >
                  <ExternalLink className="h-4 w-4" />
                  Ke Dashboard
                </button>
              </div>

              {/* Inline save form */}
              {showSaveForm && (
                <div className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Nama toko / label laporan..."
                    value={saveStoreName}
                    onChange={(e) => { setSaveStoreName(e.target.value); setSaveError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleSaveReport(); if (e.key === "Escape") setShowSaveForm(false); }}
                    className="field-input w-56 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveReport()}
                    disabled={savingReport || !saveStoreName.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--brand-hover)]"
                  >
                    {savingReport ? (
                      <div className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Simpan
                  </button>
                  <button type="button" onClick={() => setShowSaveForm(false)} className="text-[var(--text-subtle)] hover:text-[var(--foreground)]">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {saveError && (
                <p className="text-xs text-red-400">{saveError}</p>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="Total Revenue" value={formatRupiah(displayReport.totalRevenue)} sub={`${formatNumber(displayReport.orders.length)} pesanan`} />
          <MetricCard label="Gross Profit" value={formatRupiah(displayReport.totalGrossProfit)} color={displayReport.totalGrossProfit >= 0 ? "text-emerald-400" : "text-red-400"} />
          <MetricCard label="Biaya Platform" value={formatRupiah(displayReport.totalPlatformFees)} color="text-red-400" />
          <MetricCard label="Net Profit" value={formatRupiah(displayReport.totalNetProfit)} color={displayReport.totalNetProfit >= 0 ? "text-emerald-400" : "text-red-400"} sub={`Net Margin ${formatPercent(netMargin)}`} />
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Cash Flow Marketplace</h3>
              <span className="text-xs text-[var(--text-subtle)]">Mode: Upload Snapshot</span>
            </div>
            <RevenueBarChart marketplaces={displayReport.marketplaces} />
          </section>

          <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
            <h3 className="mb-4 text-sm font-semibold text-[var(--foreground)]">Breakdown Biaya Platform</h3>
            <FeePieChart marketplaces={displayReport.marketplaces} />
          </section>
        </div>

        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border-subtle)] px-5 py-4">
            <h3 className="inline-flex items-center gap-2 font-semibold text-[var(--foreground)]">
              <BarChart3 className="h-4 w-4" /> Ringkasan Marketplace
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                  <th className="px-4 py-3 text-left text-xs text-[var(--text-subtle)]">Marketplace</th>
                  <th className="px-4 py-3 text-right text-xs text-[var(--text-subtle)]">Pesanan</th>
                  <th className="px-4 py-3 text-right text-xs text-[var(--text-subtle)]">Revenue</th>
                  <th className="px-4 py-3 text-right text-xs text-[var(--text-subtle)]">Net Profit</th>
                  <th className="px-4 py-3 text-right text-xs text-[var(--text-subtle)]">Net Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {displayReport.marketplaces.map((item) => (
                  <tr key={item.marketplace} className="hover:bg-[var(--surface-soft)]">
                    <td className="px-4 py-3 text-[var(--foreground)]">{MARKETPLACE_LABELS[item.marketplace]}</td>
                    <td className="px-4 py-3 text-right text-[var(--text-subtle)]">{formatNumber(item.totalOrders)}</td>
                    <td className="px-4 py-3 text-right text-[var(--foreground)]">{formatRupiah(item.totalRevenue)}</td>
                    <td className={`px-4 py-3 text-right ${item.totalNetProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatRupiah(item.totalNetProfit)}</td>
                    <td className={`px-4 py-3 text-right ${item.avgNetMargin >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatPercent(item.avgNetMargin)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                  <td className="px-4 py-3 font-semibold text-[var(--foreground)]">Total</td>
                  <td className="px-4 py-3 text-right font-semibold text-[var(--foreground)]">{formatNumber(displayReport.marketplaces.reduce((sum, m) => sum + m.totalOrders, 0))}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[var(--foreground)]">{formatRupiah(displayReport.totalRevenue)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${displayReport.totalNetProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatRupiah(displayReport.totalNetProfit)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${netMargin >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatPercent(netMargin)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface)]">
          <div className="border-b border-[var(--border-subtle)] px-5 py-4">
            <h3 className="font-semibold text-[var(--foreground)]">Detail Per Pesanan (Audit Manual + Pencocokan HPP)</h3>
            <p className="mt-1 text-xs text-[var(--text-subtle)]">
              Tidak match HPP: {formatNumber(unmatchedCount)} order dari {formatNumber(sortedOrders.length)} order terfilter.
            </p>
          </div>

          <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 px-5 py-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_180px_160px_140px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari order ID, produk, SKU"
                  className="field-input pl-9"
                />
              </div>
              <select value={marketplaceFilter} onChange={(e) => setMarketplaceFilter(e.target.value as "all" | MarketplaceId)} className="field-input">
                <option value="all">Semua marketplace</option>
                {Object.entries(MARKETPLACE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <select value={profitFilter} onChange={(e) => setProfitFilter(e.target.value as "all" | "profit" | "loss")} className="field-input">
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
                className="field-input"
              >
                <option value="5">5 rows</option>
                <option value="10">10 rows</option>
                <option value="20">20 rows</option>
                <option value="50">50 rows</option>
                <option value="100">100 rows</option>
                <option value="all">All rows</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1720px] text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                  <SortHeader label="No" onClick={() => toggleSort("no")} />
                  <SortHeader label="Order ID" onClick={() => toggleSort("orderId")} />
                  <SortHeader label="Tanggal" onClick={() => toggleSort("orderDate")} />
                  <SortHeader label="Produk" onClick={() => toggleSort("productName")} />
                  <SortHeader label="SKU" onClick={() => toggleSort("sku")} />
                  <SortHeader label="Master SKU" onClick={() => toggleSort("masterSku")} />
                  <SortHeader label="HPP Match" onClick={() => toggleSort("hppMatch")} />
                  <SortHeader label="Marketplace" onClick={() => toggleSort("marketplace")} />
                  <SortHeader label="Qty" onClick={() => toggleSort("qty")} align="right" />
                  <SortHeader label="Revenue" onClick={() => toggleSort("revenue")} align="right" />
                  <SortHeader label="HPP" onClick={() => toggleSort("hpp")} align="right" />
                  <SortHeader label="Biaya Platform" onClick={() => toggleSort("platformFee")} align="right" />
                  <SortHeader label="Net Profit" onClick={() => toggleSort("netProfit")} align="right" />
                  <SortHeader label="Margin" onClick={() => toggleSort("margin")} align="right" />
                  <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {pagedOrders.map((order, idx) => {
                  const sequence = rowsPerPage === "all" ? idx + 1 : (page - 1) * Number(rowsPerPage) + idx + 1;
                  const unmatched = order.hpp <= 0;
                  const skuCount =
                    orderSkuCountMap.get(`${order.marketplace}:${normalizeOrderId(order.orderId)}`) ?? 1;
                  const returnQty =
                    returnQtyBadgeMap.get(`${order.marketplace}:${normalizeOrderId(order.orderId)}`) ?? 0;
                  const isMultiSku = skuCount > 1;
                  return (
                    <tr key={`${order.marketplace}:${order.orderId}:${idx}`} className="hover:bg-[var(--surface-soft)]">
                      <td className="px-3 py-2 text-[var(--text-subtle)]">{sequence}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[var(--foreground)]">{order.orderId}</span>
                          <button
                            type="button"
                            onClick={() => void handleCopyOrderId(order.orderId)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-subtle)] hover:bg-[var(--surface-soft)] hover:text-[var(--foreground)]"
                            title="Copy order ID"
                          >
                            {copiedOrderId === order.orderId ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                          {isMultiSku && (
                            <span className="inline-flex rounded-full border border-cyan-300/40 bg-cyan-300/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-200">
                              {skuCount} SKU
                            </span>
                          )}
                          {returnQty > 0 && (
                            <span className="inline-flex rounded-full border border-orange-300/40 bg-orange-300/15 px-2 py-0.5 text-[10px] font-semibold text-orange-200">
                              Retur {formatNumber(returnQty)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[var(--text-subtle)]">{order.orderDate}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-[var(--foreground)]">{order.productName}</td>
                      <td className="px-3 py-2 font-mono text-[var(--text-subtle)]">{order.sku || "-"}</td>
                      <td className="px-3 py-2 font-mono text-[var(--text-subtle)]">{order.matchedMasterSku}</td>
                      <td className="px-3 py-2">
                        {unmatched ? (
                          <span className="inline-flex rounded-full border border-rose-400/40 bg-rose-400/15 px-2 py-0.5 text-[10px] font-semibold text-rose-300">Unmatched</span>
                        ) : (
                          <span className="inline-flex rounded-full border border-emerald-400/40 bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">Matched</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-subtle)]">{MARKETPLACE_LABELS[order.marketplace]}</td>
                      <td className="px-3 py-2 text-right text-[var(--foreground)]">{formatNumber(order.qty)}</td>
                      <td className="px-3 py-2 text-right text-[var(--foreground)]">{formatRupiah(order.revenue)}</td>
                      <td className="px-3 py-2 text-right text-cyan-300">{formatRupiah(order.hpp)}</td>
                      <td className="px-3 py-2 text-right text-red-400">-{formatRupiah(order.fees.totalPlatformFee)}</td>
                      <td className={`px-3 py-2 text-right font-medium ${order.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatRupiah(order.netProfit)}</td>
                      <td className={`px-3 py-2 text-right ${order.netMargin >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatPercent(order.netMargin)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className="rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-semibold text-[var(--foreground)] hover:bg-[var(--surface-soft)]"
                          >
                            Detail
                          </button>
                          {unmatched && (
                            <button
                              type="button"
                              onClick={() => {
                                if (isMultiSku) {
                                  setSelectedOrder(order);
                                  return;
                                }
                                openHppMapper(order);
                              }}
                              className="rounded-md border border-amber-300/40 bg-amber-300/15 px-2 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-300/25"
                            >
                              {isMultiSku ? "Pilih per SKU" : "Pilih HPP"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteOrder(order)}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                            title="Hapus pesanan ini dari laporan"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {pagedOrders.length === 0 && (
                  <tr>
                    <td colSpan={15} className="px-3 py-6 text-center text-sm text-[var(--text-subtle)]">Tidak ada order yang cocok dengan filter.</td>
                  </tr>
                )}
              </tbody>
              {sortedOrders.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                    <td className="px-3 py-3 text-[var(--text-subtle)]">-</td>
                    <td className="px-3 py-3 font-semibold text-[var(--foreground)]" colSpan={7}>Total (Filtered)</td>
                    <td className="px-3 py-3 text-right font-semibold text-[var(--foreground)]">{formatNumber(totals.qty)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-[var(--foreground)]">{formatRupiah(totals.revenue)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-cyan-300">{formatRupiah(totals.hpp)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-red-400">-{formatRupiah(totals.platformFee)}</td>
                    <td className={`px-3 py-3 text-right font-semibold ${totals.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatRupiah(totals.netProfit)}</td>
                    <td className={`px-3 py-3 text-right font-semibold ${(totals.revenue > 0 ? (totals.netProfit / totals.revenue) * 100 : 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {formatPercent(totals.revenue > 0 ? (totals.netProfit / totals.revenue) * 100 : 0)}
                    </td>
                    <td className="px-3 py-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {sortedOrders.length > 0 && (
            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 py-3">
              <p className="text-xs text-[var(--text-subtle)]">
                {sortedOrders.length} order terfilter • halaman {page}/{totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page <= 1 || rowsPerPage === "all"}
                  className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs hover:bg-[var(--surface-soft)] disabled:opacity-40"
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages || rowsPerPage === "all"}
                  className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs hover:bg-[var(--surface-soft)] disabled:opacity-40"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </section>

        {unmatchedCount > 0 && (
          <section className="rounded-3xl border border-rose-500/30 bg-rose-500/10 px-5 py-4">
            <p className="text-sm font-semibold text-rose-300">Perlu pengecekan HPP</p>
            <p className="mt-1 text-xs text-rose-200">
              Ditemukan {formatNumber(unmatchedCount)} order yang HPP-nya belum match. Anda bisa assign langsung dari tombol
              <span className="font-semibold"> Pilih HPP</span> pada detail per pesanan.
            </p>
            <Link href="/hpp" className="mt-3 inline-flex rounded-lg border border-rose-300/40 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/15">
              Buka Halaman HPP
            </Link>
          </section>
        )}
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm" onClick={() => setSelectedOrder(null)}>
          <div className="w-full max-w-4xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="rounded-t-2xl border-b border-[var(--border-subtle)] bg-[var(--surface-soft)] px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-[var(--text)]">Detail Pesanan</h3>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="font-mono text-xs text-[var(--text-subtle)]">{selectedOrder.orderId}</p>
                    <button
                      type="button"
                      onClick={() => void handleCopyOrderId(selectedOrder.orderId)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-subtle)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
                      title="Copy order ID"
                    >
                      {copiedOrderId === selectedOrder.orderId ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    {selectedOrderSkuBreakdowns.length > 1 && (
                      <span className="inline-flex rounded-full border border-cyan-300/40 bg-cyan-300/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-200">
                        Multi SKU ({selectedOrderSkuBreakdowns.length})
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-subtle)] hover:bg-[var(--surface)]"
                >
                  <X size={13} /> Tutup
                </button>
              </div>
            </div>

            <div className="max-h-[72vh] space-y-4 overflow-y-auto px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">Ringkasan Global Order</p>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div><span className="text-[var(--text-subtle)]">Produk:</span> <span className="text-[var(--text)]">{selectedOrderLines.length} produk</span></div>
                <div><span className="text-[var(--text-subtle)]">SKU:</span> <span className="font-mono text-[var(--text)]">{selectedOrderLines.length > 1 ? "Multi SKU" : selectedOrder.sku || "-"}</span></div>
                <div><span className="text-[var(--text-subtle)]">Qty:</span> <span className="text-[var(--text)]">{modalSummary.totalQty}</span></div>
                <div><span className="text-[var(--text-subtle)]">Marketplace:</span> <span className="text-[var(--text)]">{MARKETPLACE_LABELS[selectedOrder.marketplace]}</span></div>
                <div><span className="text-[var(--text-subtle)]">Revenue:</span> <span className="text-[var(--text)]">{formatRupiah(modalSummary.totalRevenue)}</span></div>
                <div><span className="text-[var(--text-subtle)]">HPP:</span> <span className="font-medium text-cyan-300">{formatRupiah(modalSummary.totalHpp)}</span></div>
                <div><span className="text-[var(--text-subtle)]">Gross Profit:</span> <span className={modalSummary.totalGrossProfit >= 0 ? "text-emerald-400" : "text-red-400"}>{formatRupiah(modalSummary.totalGrossProfit)}</span></div>
                <div><span className="text-[var(--text-subtle)]">Biaya Platform:</span> <span className="text-red-400">-{formatRupiah(modalSummary.totalPlatformFee)}</span></div>
                {Math.abs(modalSummary.settlementAdjustment) > 0.0001 && (
                  <div>
                    <span className="text-[var(--text-subtle)]">Adjustment Settlement:</span>{" "}
                    <span className={modalSummary.settlementAdjustment >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {modalSummary.settlementAdjustment >= 0 ? "+" : "-"}
                      {formatRupiah(Math.abs(modalSummary.settlementAdjustment))}
                    </span>
                  </div>
                )}
                <div><span className="text-[var(--text-subtle)]">Net Profit:</span> <span className={modalSummary.totalNetProfit >= 0 ? "text-emerald-400" : "text-red-400"}>{formatRupiah(modalSummary.totalNetProfit)}</span></div>
              </div>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2 text-xs">
                <p className="font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">Rincian Perhitungan</p>
                <p className="mt-1 text-[var(--text)]">
                  Laba Kotor: <span className="font-semibold">{formatRupiah(modalSummary.totalRevenue)}</span> -{" "}
                  <span className="font-semibold">{formatRupiah(modalSummary.totalHpp)}</span> ={" "}
                  <span className={modalSummary.totalGrossProfit >= 0 ? "font-semibold text-emerald-400" : "font-semibold text-red-400"}>
                    {formatRupiah(modalSummary.totalGrossProfit)}
                  </span>
                </p>
                <p className="mt-0.5 text-[var(--text)]">
                  Laba Bersih: <span className="font-semibold">{formatRupiah(modalSummary.totalGrossProfit)}</span> -{" "}
                  <span className="font-semibold">{formatRupiah(modalSummary.totalPlatformFee)}</span>
                  {Math.abs(modalSummary.settlementAdjustment) > 0.0001 && (
                    <>
                      {" "}
                      {modalSummary.settlementAdjustment >= 0 ? "+" : "-"}{" "}
                      <span className="font-semibold">{formatRupiah(Math.abs(modalSummary.settlementAdjustment))}</span>
                    </>
                  )}{" "}
                  ={" "}
                  <span className={modalSummary.totalNetProfit >= 0 ? "font-semibold text-emerald-400" : "font-semibold text-red-400"}>
                    {formatRupiah(modalSummary.totalNetProfit)}
                  </span>
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-[var(--text-subtle)]">Detail Profit Per SKU (Revenue, HPP, Fee, Net)</p>
                <div className="space-y-2">
                  {selectedOrderSkuBreakdowns.map((skuDetail, index) => {
                    const notMapped = skuDetail.hpp <= 0;
                    return (
                      <details
                        key={`${selectedOrder.orderId}-${skuDetail.sku}-${index}`}
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-soft)]"
                        open
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm">
                          <span className="font-medium text-[var(--text)]">SKU {index + 1}: {skuDetail.sku || "-"}</span>
                          <span className="text-xs text-[var(--text-subtle)]">{skuDetail.products.length} produk</span>
                        </summary>
                        <div className="grid grid-cols-1 gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-3 text-xs sm:grid-cols-2">
                          <div><span className="text-[var(--text-subtle)]">Qty:</span> <span className="text-[var(--text)]">{skuDetail.qty}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Revenue:</span> <span className="text-[var(--text)]">{formatRupiah(skuDetail.allocatedRevenue)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">HPP / unit:</span> <span className="text-cyan-300">{formatRupiah(skuDetail.hppUnitAvg)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Total HPP:</span> <span className="text-cyan-300">{formatRupiah(skuDetail.hpp)}</span></div>
                          <div className="sm:col-span-2">
                            <span className="text-[var(--text-subtle)]">HPP x Qty:</span>{" "}
                            <span className="text-cyan-300">
                              {formatRupiah(skuDetail.hppUnitAvg)} x {formatNumber(skuDetail.qty)} = {formatRupiah(skuDetail.hpp)}
                            </span>
                          </div>
                          <div><span className="text-[var(--text-subtle)]">Alokasi Biaya Platform:</span> <span className="text-red-400">-{formatRupiah(skuDetail.allocatedFee)}</span></div>
                          {Math.abs(skuDetail.allocatedAdjustment) > 0.0001 && (
                            <div>
                              <span className="text-[var(--text-subtle)]">Alokasi Adjustment:</span>{" "}
                              <span className={skuDetail.allocatedAdjustment >= 0 ? "text-emerald-400" : "text-red-400"}>
                                {skuDetail.allocatedAdjustment >= 0 ? "+" : "-"}
                                {formatRupiah(Math.abs(skuDetail.allocatedAdjustment))}
                              </span>
                            </div>
                          )}
                          <div><span className="text-[var(--text-subtle)]">Gross Profit:</span> <span className={skuDetail.grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}>{formatRupiah(skuDetail.grossProfit)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Net Profit:</span> <span className={skuDetail.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}>{formatRupiah(skuDetail.netProfit)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Net Margin:</span> <span className={skuDetail.netMargin >= 0 ? "text-emerald-400" : "text-red-400"}>{formatPercent(skuDetail.netMargin)}</span></div>
                          <div><span className="text-[var(--text-subtle)]">Gross Margin:</span> <span className={skuDetail.grossMargin >= 0 ? "text-emerald-400" : "text-red-400"}>{formatPercent(skuDetail.grossMargin)}</span></div>
                          <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                            <span className="text-[var(--text-subtle)]">Master SKU:</span>
                            <span className="font-mono text-[var(--text)]">{skuDetail.masterSkus.length > 0 ? skuDetail.masterSkus.join(", ") : "-"}</span>
                            {notMapped && (
                              <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                Belum termapping
                              </span>
                            )}
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
                              {notMapped ? "Pilih HPP" : "Ubah HPP"}
                            </button>
                            {!notMapped && (
                              <button
                                type="button"
                                onClick={() => handleRemoveHppForSku(skuDetail)}
                                className="rounded-md border border-red-200/60 bg-red-50/80 px-2 py-0.5 text-[10px] font-semibold text-red-700 hover:bg-red-100"
                              >
                                Hapus HPP
                              </button>
                            )}
                          </div>
                          <div className="sm:col-span-2"><span className="text-[var(--text-subtle)]">Produk:</span> <span className="text-[var(--text)]">{skuDetail.products.join(", ")}</span></div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {hppMapTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm" onClick={() => setHppMapTarget(null)}>
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between rounded-t-2xl border-b border-[var(--border-subtle)] bg-[var(--surface-soft)] px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-[var(--text)]">Pilih Master HPP</h3>
                <p className="mt-0.5 text-xs text-[var(--text-subtle)]">
                  Order {hppMapTarget.orderId} • {hppMapTarget.sku || "SKU kosong"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadHpp()}
                  disabled={hppLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-subtle)] hover:bg-[var(--surface)] disabled:opacity-50"
                  title="Refresh daftar HPP dari server"
                >
                  {hppLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setHppMapTarget(null)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-subtle)] hover:bg-[var(--surface)]"
                >
                  <X size={13} /> Tutup
                </button>
              </div>
            </div>

            <div className="space-y-3 px-5 py-4">
              <p className="text-xs text-[var(--text-subtle)]">
                Produk: <span className="font-medium text-[var(--text)]">{hppMapTarget.productName || "-"}</span>
              </p>
              {hppLoading && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-subtle)] py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  Memuat HPP...
                </div>
              )}
              {hppEntries.length === 0 && !hppLoading && (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-[var(--text-subtle)]">Data HPP belum dimuat.</span>
                  <button
                    type="button"
                    onClick={() => loadHpp()}
                    className="text-xs text-cyan-400 hover:text-cyan-300 underline ml-3 shrink-0"
                  >
                    Muat HPP
                  </button>
                </div>
              )}
              <input
                value={hppOptionQuery}
                onChange={(e) => setHppOptionQuery(e.target.value)}
                placeholder="Cari master product / master SKU"
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
              />
              <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border-subtle)]">
                {hppEntries.length === 0 && hppLoading ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-[var(--text-subtle)]">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    Memuat data HPP...
                  </div>
                ) : filteredMasterHppOptions.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-[var(--text-subtle)]">Tidak ada master HPP yang cocok.</p>
                ) : (
                  filteredMasterHppOptions.map((option) => (
                    <label key={option.key} className="flex cursor-pointer items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-3 py-2.5 last:border-b-0 hover:bg-[var(--surface-soft)]">
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
              {hppMapperError && (
                <p className="rounded-md border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-300">
                  {hppMapperError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-5 py-3">
              <button
                type="button"
                onClick={() => setHppMapTarget(null)}
                className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-subtle)] hover:bg-[var(--surface-soft)]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={applyHppMapping}
                disabled={!selectedHppOptionKey || savingHppMapping}
                className="rounded-lg bg-amber-500 px-3 py-2 text-xs text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {savingHppMapping ? "Menyimpan..." : "Gunakan HPP Ini"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthAreaLayout>
  );
}

function SortHeader({
  label,
  onClick,
  align = "left",
}: {
  label: string;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)] ${align === "right" ? "text-right" : "text-left"}`}>
      <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-[var(--foreground)] ${align === "right" ? "justify-end" : ""}`}>
        {label}
        <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );
}

function MetricCard({
  label,
  value,
  sub,
  color = "text-[var(--foreground)]",
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)]/95 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--text-subtle)]">{sub}</p>}
    </div>
  );
}
