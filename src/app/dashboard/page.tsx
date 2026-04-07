"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/app-store";
import AppSidebar from "@/components/AppSidebar";
import { formatRupiah, formatPercent, formatNumber } from "@/lib/utils";
import { MARKETPLACE_LABELS, MARKETPLACE_COLORS } from "@/lib/types";
import RevenueBarChart from "@/components/charts/RevenueBarChart";
import FeePieChart from "@/components/charts/FeePieChart";
import Link from "next/link";
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

function lookupHppForLine(sku: string, productName: string, hppEntries: HppEntry[]): number {
  if (!hppEntries.length) return 0;

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

  const normalizedSku = normalizeSku(sku);
  const normalizedProductName = normalizeName(productName);

  if (normalizedSku) {
    const bySku = hppEntries.find((entry) => normalizeSku(entry.sku) === normalizedSku && entry.cost > 0);
    if (bySku) return bySku.cost;
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
  if (!withCost) return scored[0]?.entry.cost ?? 0;
  if (normalizedSku) {
    const distinctCosts = new Set(
      scored
        .map((item) => item.entry.cost)
        .filter((cost) => cost > 0)
    );
    return distinctCosts.size === 1 ? withCost.entry.cost : 0;
  }
  return withCost.entry.cost;
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
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function MarketplaceTable({ reportData }: { reportData: RevenueReport }) {
  if (!reportData) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 text-xs text-gray-500 font-medium">Marketplace</th>
            <th className="text-right py-3 px-4 text-xs text-gray-500 font-medium">Pesanan</th>
            <th className="text-right py-3 px-4 text-xs text-gray-500 font-medium">Revenue</th>
            <th className="text-right py-3 px-4 text-xs text-gray-500 font-medium">Biaya Platform</th>
            <th className="text-right py-3 px-4 text-xs text-gray-500 font-medium">Gross Profit</th>
            <th className="text-right py-3 px-4 text-xs text-gray-500 font-medium">Net Profit</th>
            <th className="text-right py-3 px-4 text-xs text-gray-500 font-medium">Net Margin</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {reportData.marketplaces.map((m) => (
            <tr key={m.marketplace} className="hover:bg-gray-50">
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
          <tr className="border-t-2 border-gray-200 bg-gray-50">
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
            <td className="py-3 px-4 text-right font-bold text-slate-600">
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

function OrderDetailTable({
  orders,
  allOrders,
  uploadSets,
  hppEntries,
  marketplaceFilter,
  onMarketplaceFilterChange,
}: {
  orders: CalculatedOrder[];
  allOrders: CalculatedOrder[];
  uploadSets: Partial<Record<MarketplaceId, MarketplaceUploadSet>>;
  hppEntries: HppEntry[];
  marketplaceFilter: "all" | MarketplaceId;
  onMarketplaceFilterChange: (value: "all" | MarketplaceId) => void;
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
      if (entry.cost <= 0) continue;
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

  const orderTotalQtyMap = useMemo(() => {
    const map = new Map<string, number>();

    for (const order of orders) {
      const set = uploadSets[order.marketplace];
      const normalized = normalizeOrderId(order.orderId);
      const lines = (set?.orderFiles ?? [])
        .flatMap((file) => file.rawOrders)
        .filter((row) => normalizeOrderId(row.orderId) === normalized);

      const deduped = dedupeOrderLines(lines);

      const qtyFromLines = deduped.reduce((sum, line) => sum + line.qty, 0);
      const key = `${order.marketplace}:${normalized}`;
      map.set(key, qtyFromLines > 0 ? qtyFromLines : order.qty);
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

      const totalQty = lines.reduce((sum, line) => sum + line.qty, 0);
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
        skuCount: orderSkuCountMap.get(qtyKey) ?? 1,
        displayRevenue: derived?.totalRevenue ?? order.revenue,
        displayHpp: derived?.totalHpp ?? order.hpp,
        displayPlatformFee: derived?.totalPlatformFee ?? order.fees.totalPlatformFee,
        displayNetProfit: derived?.netProfit ?? order.netProfit,
        displayNetMargin: derived?.netMargin ?? order.netMargin,
      };
    });
  }, [filteredOrders, orderDerivedMetricsMap, orderSequenceMap, orderSkuCountMap, orderTotalQtyMap]);

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

    const groups = new Map<string, { sku: string; products: Set<string>; qty: number; baseRevenue: number; hpp: number; hppUnitAvg: number }>();

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
      };

      const lineRevenue = line.actualPrice * line.qty;
      const hppUnit = lookupHppForLine(resolvedSku, line.productName, hppEntries);
      const lineHpp = hppUnit * line.qty;

      existing.products.add(line.productName || "-");
      existing.qty += line.qty;
      existing.baseRevenue += lineRevenue;
      existing.hpp += lineHpp;
      existing.hppUnitAvg = existing.qty > 0 ? existing.hpp / existing.qty : 0;

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
      <div className="px-4 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50/60 flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari order ID, produk, atau SKU"
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-white border border-slate-200 px-3 py-1 text-xs text-slate-600">
              {filteredOrders.length} order ditemukan
            </span>
            <span className="inline-flex items-center rounded-full bg-white border border-slate-200 px-3 py-1 text-xs text-slate-600">
              Klik baris untuk detail
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={marketplaceFilter}
            onChange={(e) => onMarketplaceFilterChange(e.target.value as "all" | MarketplaceId)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
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
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
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
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
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

      <div className="overflow-x-auto rounded-b-xl border-t border-slate-100">
        <table className="w-full min-w-[1200px] text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-gray-200 bg-slate-50/95 backdrop-blur">
              <th className="text-left py-3 px-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                <button type="button" onClick={() => toggleSort("no")} className="inline-flex items-center gap-1 hover:text-slate-700">
                  No <SortIcon column="no" />
                </button>
              </th>
              <th className="text-left py-3 px-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                <button type="button" onClick={() => toggleSort("orderId")} className="inline-flex items-center gap-1 hover:text-slate-700">
                  Order ID <SortIcon column="orderId" />
                </button>
              </th>
              <th className="text-left py-3 px-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                <button type="button" onClick={() => toggleSort("productName")} className="inline-flex items-center gap-1 hover:text-slate-700">
                  Produk <SortIcon column="productName" />
                </button>
              </th>
              <th className="text-left py-3 px-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                <button type="button" onClick={() => toggleSort("sku")} className="inline-flex items-center gap-1 hover:text-slate-700">
                  SKU <SortIcon column="sku" />
                </button>
              </th>
              <th className="text-left py-3 px-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                <button type="button" onClick={() => toggleSort("marketplace")} className="inline-flex items-center gap-1 hover:text-slate-700">
                  Marketplace <SortIcon column="marketplace" />
                </button>
              </th>
              <th className="text-right py-3 px-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                <button type="button" onClick={() => toggleSort("qty")} className="inline-flex items-center gap-1 hover:text-slate-700">
                  Qty <SortIcon column="qty" />
                </button>
              </th>
              <th className="text-right py-3 px-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                <button type="button" onClick={() => toggleSort("revenue")} className="inline-flex items-center gap-1 hover:text-slate-700">
                  Revenue <SortIcon column="revenue" />
                </button>
              </th>
              <th className="text-right py-3 px-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                <button type="button" onClick={() => toggleSort("hpp")} className="inline-flex items-center gap-1 hover:text-slate-700">
                  HPP <SortIcon column="hpp" />
                </button>
              </th>
              <th className="text-right py-3 px-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                <button type="button" onClick={() => toggleSort("platformFee")} className="inline-flex items-center gap-1 hover:text-slate-700">
                  Biaya Platform <SortIcon column="platformFee" />
                </button>
              </th>
              <th className="text-right py-3 px-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                <button type="button" onClick={() => toggleSort("netProfit")} className="inline-flex items-center gap-1 hover:text-slate-700">
                  Net Profit <SortIcon column="netProfit" />
                </button>
              </th>
              <th className="text-right py-3 px-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                <button type="button" onClick={() => toggleSort("margin")} className="inline-flex items-center gap-1 hover:text-slate-700">
                  Margin <SortIcon column="margin" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paged.map((row, index) => (
              <tr
                key={`${row.order.marketplace}-${row.order.orderId}`}
                className={`cursor-pointer transition-colors ${index % 2 === 0 ? "bg-white" : "bg-slate-50/40"} hover:bg-blue-50/60`}
                onClick={() => setSelectedOrder(row.order)}
              >
                <td className="py-2 px-3 text-slate-500">{row.rowNumber}</td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-gray-600 whitespace-nowrap">{row.order.orderId}</span>
                    {row.skuCount > 1 && (
                      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        {row.skuCount} SKU
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCopyOrderId(row.order.orderId);
                      }}
                      className="inline-flex items-center justify-center rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-white hover:text-slate-700 transition"
                      title="Copy Order ID"
                    >
                      {copiedOrderId === row.order.orderId ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </td>
                <td className="py-2 px-3 text-gray-800 max-w-[200px] truncate">{row.order.productName}</td>
                <td className="py-2 px-3 font-mono text-gray-500 max-w-[180px] truncate">{row.order.sku || "-"}</td>
                <td className="py-2 px-3">
                  <span
                    className="px-1.5 py-0.5 rounded text-white text-xs font-medium"
                    style={{ backgroundColor: MARKETPLACE_COLORS[row.order.marketplace] }}
                  >
                    {MARKETPLACE_LABELS[row.order.marketplace]}
                  </span>
                </td>
                <td className="py-2 px-3 text-right text-gray-600">{formatNumber(row.displayQty)}</td>
                <td className="py-2 px-3 text-right text-gray-800">{formatRupiah(row.displayRevenue)}</td>
                <td className="py-2 px-3 text-right text-gray-500">
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
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={11} className="py-6 px-3 text-center text-sm text-slate-500">
                  Tidak ada data yang cocok dengan filter.
                </td>
              </tr>
            )}
          </tbody>
          {sortedOrderRows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50/80">
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
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {filteredOrders.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-slate-50/40">
          <p className="text-xs text-gray-500">
            {filteredOrders.length} pesanan{filteredOrders.length !== orders.length ? ` dari ${orders.length}` : ""} &bull; halaman {page}/{totalPages} &bull; {rowsPerPage === "all" ? "all" : rowsPerPage} rows
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white"
            >
              &larr; Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white"
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" onClick={() => setSelectedOrder(null)}>
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-gradient-to-r from-slate-50 to-blue-50/60 rounded-t-2xl">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Detail Pesanan</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedOrder.orderId}</p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-white"
              >
                <X size={13} /> Tutup
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Produk:</span> <span className="text-slate-800">{selectedOrderLines.length} produk</span></div>
                <div><span className="text-slate-500">SKU:</span> <span className="font-mono text-slate-800">{selectedOrderLines.length > 1 ? "Multi SKU" : selectedOrder.sku || "-"}</span></div>
                <div><span className="text-slate-500">Qty:</span> <span className="text-slate-800">{modalSummary.totalQty}</span></div>
                <div><span className="text-slate-500">Marketplace:</span> <span className="text-slate-800">{MARKETPLACE_LABELS[selectedOrder.marketplace]}</span></div>
                <div><span className="text-slate-500">Revenue:</span> <span className="text-slate-800">{formatRupiah(modalSummary.totalRevenue)}</span></div>
                <div><span className="text-slate-500">HPP:</span> <span className="text-slate-800">{formatRupiah(modalSummary.totalHpp)}</span></div>
                <div><span className="text-slate-500">Biaya Platform:</span> <span className="text-red-500">-{formatRupiah(modalSummary.totalPlatformFee)}</span></div>
                <div><span className="text-slate-500">Net Profit:</span> <span className={modalSummary.totalNetProfit >= 0 ? "text-emerald-600" : "text-red-500"}>{formatRupiah(modalSummary.totalNetProfit)}</span></div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Detail Produk per Order</p>
                <div className="space-y-2">
                  {selectedOrderSkuBreakdowns.map((skuDetail, index) => {
                    return (
                      <details
                        key={`${selectedOrder.orderId}-${skuDetail.sku}-${index}`}
                        className="rounded-lg border border-slate-200 bg-slate-50/40"
                        open={index === 0}
                      >
                        <summary className="cursor-pointer list-none px-3 py-2.5 flex items-center justify-between text-sm">
                          <span className="text-slate-800 font-medium">SKU {index + 1}: {skuDetail.sku || "-"}</span>
                          <span className="text-slate-500 text-xs">{skuDetail.products.length} produk</span>
                        </summary>
                        <div className="border-t border-slate-200 bg-white px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div><span className="text-slate-500">Qty:</span> <span className="text-slate-800">{skuDetail.qty}</span></div>
                          <div><span className="text-slate-500">Revenue:</span> <span className="text-slate-800">{formatRupiah(skuDetail.allocatedRevenue)}</span></div>
                          <div><span className="text-slate-500">HPP / unit:</span> <span className="text-slate-800">{formatRupiah(skuDetail.hppUnitAvg)}</span></div>
                          <div><span className="text-slate-500">Total HPP:</span> <span className="text-slate-800">{formatRupiah(skuDetail.hpp)}</span></div>
                          <div><span className="text-slate-500">Alokasi Biaya Platform:</span> <span className="text-red-500">-{formatRupiah(skuDetail.allocatedFee)}</span></div>
                          <div><span className="text-slate-500">Gross Profit:</span> <span className={skuDetail.grossProfit >= 0 ? "text-emerald-600" : "text-red-500"}>{formatRupiah(skuDetail.grossProfit)}</span></div>
                          <div><span className="text-slate-500">Net Profit:</span> <span className={skuDetail.netProfit >= 0 ? "text-emerald-600" : "text-red-500"}>{formatRupiah(skuDetail.netProfit)}</span></div>
                          <div><span className="text-slate-500">Net Margin:</span> <span className={skuDetail.netMargin >= 0 ? "text-emerald-600" : "text-red-500"}>{formatPercent(skuDetail.netMargin)}</span></div>
                          <div><span className="text-slate-500">Gross Margin:</span> <span className={skuDetail.grossMargin >= 0 ? "text-emerald-600" : "text-red-500"}>{formatPercent(skuDetail.grossMargin)}</span></div>
                          <div className="sm:col-span-2"><span className="text-slate-500">Produk:</span> <span className="text-slate-800">{skuDetail.products.join(", ")}</span></div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Data Mentah</p>
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(selectedOrder.rawData ?? {}).length > 0 ? (
                        Object.entries(selectedOrder.rawData ?? {}).map(([key, value]) => (
                          <tr key={key}>
                            <td className="w-1/3 bg-slate-50 px-3 py-2 text-slate-600">{key}</td>
                            <td className="px-3 py-2 text-slate-800 break-all">{String(value ?? "-")}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-3 py-3 text-slate-500">Data mentah tidak tersedia untuk pesanan ini.</td>
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
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-gradient-to-r from-amber-50 to-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Pilih Master HPP</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Order {hppMapTarget.orderId} • {hppMapTarget.sku || "SKU kosong"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHppMapTarget(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-white"
              >
                <X size={13} /> Tutup
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-slate-600">
                Produk: <span className="font-medium text-slate-800">{hppMapTarget.productName || "-"}</span>
              </p>
              <input
                value={hppOptionQuery}
                onChange={(e) => setHppOptionQuery(e.target.value)}
                placeholder="Cari master product / master SKU"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-200"
              />
              <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {filteredMasterHppOptions.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-slate-500">Tidak ada master HPP yang cocok.</p>
                ) : (
                  filteredMasterHppOptions.map((option) => (
                    <label key={option.key} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{option.masterProductName}</p>
                        <p className="text-xs text-slate-500">Master SKU: {option.masterSku}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-emerald-700">{formatRupiah(option.cost)}</span>
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

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={() => setHppMapTarget(null)}
                className="px-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
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
}

export default function DashboardPage() {
  const {
    report,
    uploadSets,
    hppEntries,
    savedReports,
    saveStoreReport,
    renameSavedReport,
    deleteSavedReport,
    setReport,
  } = useAppStore();
  const [storeName, setStoreName] = useState("");
  const [selectedMarketplace, setSelectedMarketplace] = useState<MarketplaceId | "">("");
  const [dashboardMarketplaceFilter, setDashboardMarketplaceFilter] = useState<"all" | MarketplaceId>("all");
  const [saveInfo, setSaveInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!report || report.marketplaces.length === 0) {
      setSelectedMarketplace("");
      return;
    }
    if (!selectedMarketplace) {
      setSelectedMarketplace(report.marketplaces[0].marketplace);
      return;
    }
    const stillExists = report.marketplaces.some((item) => item.marketplace === selectedMarketplace);
    if (!stillExists) {
      setSelectedMarketplace(report.marketplaces[0].marketplace);
    }
  }, [report, selectedMarketplace]);

  const handleSaveByStore = () => {
    if (!report || !selectedMarketplace) return;
    const trimmedStoreName = storeName.trim();
    if (!trimmedStoreName) {
      setSaveInfo("Nama toko wajib diisi.");
      return;
    }

    const saved = createMarketplaceOnlyReport(report, selectedMarketplace);
    if (saved.marketplaces.length === 0) {
      setSaveInfo("Marketplace yang dipilih tidak ada di hasil hitung.");
      return;
    }

    saveStoreReport({
      marketplace: selectedMarketplace,
      storeName: trimmedStoreName,
      report: saved,
    });

    setSaveInfo(`Tersimpan: ${MARKETPLACE_LABELS[selectedMarketplace]} - ${trimmedStoreName}`);
    setStoreName("");
  };

  if (!report) {
    return (
      <div className="min-h-screen bg-slate-50 flex">
        <AppSidebar />
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-10 space-y-6 sm:px-6 lg:px-8">
          {savedReports.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-slate-700">Laporan Tersimpan</h3>
                <p className="text-xs text-slate-500 mt-1">Buka kembali laporan per toko tanpa upload ulang.</p>
              </div>
              <div className="divide-y divide-gray-100">
                {savedReports.slice(0, 8).map((item) => (
                  <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{item.label}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(item.createdAt).toLocaleString("id-ID")} • Net {formatRupiah(item.report.totalNetProfit)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const nextName = window.prompt("Ubah nama toko", item.storeName)?.trim();
                          if (nextName) renameSavedReport(item.id, nextName);
                        }}
                        className="px-3 py-1.5 text-xs border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50 inline-flex items-center gap-1"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Rename
                      </button>
                      <button
                        onClick={() => setReport(item.report)}
                        className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
                      >
                        Buka
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="max-w-2xl mx-auto text-center">
          <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-700 mb-2">Belum ada laporan</h2>
          <p className="text-slate-400 mb-6">Upload data transaksi terlebih dahulu untuk melihat dashboard revenue.</p>
          <Link
            href="/upload"
            className="bg-slate-900 text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-slate-700 transition-colors"
          >
            Upload Data
          </Link>
          </div>
        </main>
      </div>
    );
  }

  const visibleReport =
    dashboardMarketplaceFilter === "all"
      ? report
      : createMarketplaceOnlyReport(report, dashboardMarketplaceFilter);

  const reactiveVisibleReport = useMemo<RevenueReport>(() => {
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

    for (const order of visibleReport.orders) {
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
          const grossProfit = totalRevenue - totalHpp;
          const netProfit = (order.settlementAmount ?? 0) !== 0
            ? (order.settlementAmount ?? 0) - totalHpp
            : grossProfit - totalPlatformFee;

          derived = {
            revenue: totalRevenue,
            hpp: totalHpp,
            platformFee: totalPlatformFee,
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

    const marketplaces = visibleReport.marketplaces.map((summary) => {
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
      ...visibleReport,
      marketplaces,
      totalRevenue: marketplaces.reduce((sum, item) => sum + item.totalRevenue, 0),
      totalHpp: marketplaces.reduce((sum, item) => sum + item.totalHpp, 0),
      totalGrossProfit: marketplaces.reduce((sum, item) => sum + item.totalGrossProfit, 0),
      totalPlatformFees: marketplaces.reduce((sum, item) => sum + item.totalPlatformFees, 0),
      totalNetProfit: marketplaces.reduce((sum, item) => sum + item.totalNetProfit, 0),
    };
  }, [visibleReport, uploadSets, hppEntries]);

  const netMargin =
    reactiveVisibleReport.totalRevenue > 0
      ? (reactiveVisibleReport.totalNetProfit / reactiveVisibleReport.totalRevenue) * 100
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

  const topMarketplace = [...reactiveVisibleReport.marketplaces].sort(
    (a, b) => b.totalNetProfit - a.totalNetProfit
  )[0];
  const avgOrderValue =
    reactiveVisibleReport.orders.length > 0
      ? reactiveVisibleReport.totalRevenue / reactiveVisibleReport.orders.length
      : 0;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <AppSidebar />
      <div className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Ringkasan Keuangan</h1>
                <p className="text-slate-500 text-sm mt-0.5">
                  Update terakhir: {new Date(reactiveVisibleReport.generatedAt).toLocaleString("id-ID")}
                </p>
              </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600">
                <CalendarDays className="w-4 h-4" /> Jan 2024 - Des 2024
              </div>
              <ExportButtons />
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <SummaryCard
              label="Total Revenue"
              value={formatRupiah(reactiveVisibleReport.totalRevenue)}
              sub={`${formatNumber(reactiveVisibleReport.orders.length)} pesanan`}
            />
            <SummaryCard
              label="Gross Profit"
              value={formatRupiah(reactiveVisibleReport.totalGrossProfit)}
              color={reactiveVisibleReport.totalGrossProfit >= 0 ? "text-emerald-600" : "text-red-500"}
              sub={`Margin ${formatPercent(reactiveVisibleReport.totalRevenue > 0 ? (reactiveVisibleReport.totalGrossProfit / reactiveVisibleReport.totalRevenue) * 100 : 0)}`}
            />
            <SummaryCard
              label="Total Biaya Platform"
              value={formatRupiah(reactiveVisibleReport.totalPlatformFees)}
              color="text-red-500"
              sub={`${formatPercent(reactiveVisibleReport.totalRevenue > 0 ? (reactiveVisibleReport.totalPlatformFees / reactiveVisibleReport.totalRevenue) * 100 : 0)} dari revenue`}
            />
            <SummaryCard
              label="Net Profit"
              value={formatRupiah(reactiveVisibleReport.totalNetProfit)}
              color={reactiveVisibleReport.totalNetProfit >= 0 ? "text-emerald-600" : "text-red-500"}
              sub={`Net Margin ${formatPercent(netMargin)}`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-slate-700 text-sm mb-4">Analisa Profit Bulanan</h3>
              <RevenueBarChart marketplaces={reactiveVisibleReport.marketplaces} />
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-slate-700 mb-3">Wawasan Cepat</h3>
                <div className="space-y-2 text-sm">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-slate-500 text-xs">Marketplace tertinggi</p>
                    <p className="font-semibold text-slate-800 mt-0.5">
                      {topMarketplace ? MARKETPLACE_LABELS[topMarketplace.marketplace] : "-"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="text-slate-500 text-xs">Rata-rata order value</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{formatRupiah(avgOrderValue)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-blue-50 px-3 py-2">
                    <p className="text-blue-600 text-xs">Performa Net Margin</p>
                    <p className="font-semibold text-blue-700 mt-0.5 inline-flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" /> {formatPercent(netMargin)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-slate-700 text-sm mb-4">Breakdown Biaya Platform</h3>
                <FeePieChart marketplaces={reactiveVisibleReport.marketplaces} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 className="font-semibold text-slate-700">Simpan Laporan per Toko</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Simpan hasil hitung dengan format: Marketplace - Nama Toko.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                <select
                  value={selectedMarketplace}
                  onChange={(e) => setSelectedMarketplace(e.target.value as MarketplaceId)}
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="">Pilih marketplace</option>
                    {reactiveVisibleReport.marketplaces.map((item) => (
                      <option key={item.marketplace} value={item.marketplace}>
                        {MARKETPLACE_LABELS[item.marketplace]}
                      </option>
                  ))}
                </select>
                <input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Nama toko (contoh: Aquadrat)"
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
                <button
                  onClick={handleSaveByStore}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-700"
                >
                  <Save className="w-4 h-4" />
                  Simpan
                </button>
              </div>
            </div>
            {saveInfo && <p className="text-xs text-blue-700 mt-2">{saveInfo}</p>}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 mb-6">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-slate-700">Ringkasan per Marketplace</h3>
            </div>
            <MarketplaceTable reportData={reactiveVisibleReport} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-slate-700">Detail per Pesanan</h3>
              {canceledOrderSummary.total > 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  Order cancel dikecualikan dari perhitungan: {formatNumber(canceledOrderSummary.total)}
                  {canceledOrderSummary.byMarketplace.length > 0
                    ? ` (${canceledOrderSummary.byMarketplace.join(" • ")})`
                    : ""}
                </p>
              )}
            </div>
            <OrderDetailTable
              orders={visibleReport.orders}
              allOrders={report.orders}
              uploadSets={uploadSets}
              hppEntries={hppEntries}
              marketplaceFilter={dashboardMarketplaceFilter}
              onMarketplaceFilterChange={setDashboardMarketplaceFilter}
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 mt-6">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-700">Laporan Tersimpan</h3>
              <Link href="/reports" className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
                Buka Menu Laporan
              </Link>
            </div>
            {savedReports.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Belum ada laporan tersimpan.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {savedReports.map((item) => (
                  <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{item.label}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(item.createdAt).toLocaleString("id-ID")} • Revenue {formatRupiah(item.report.totalRevenue)} • Net {formatRupiah(item.report.totalNetProfit)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const nextName = window.prompt("Ubah nama toko", item.storeName)?.trim();
                          if (nextName) renameSavedReport(item.id, nextName);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Rename
                      </button>
                      <button
                        onClick={() => setReport(item.report)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        Buka
                      </button>
                      <button
                        onClick={() => deleteSavedReport(item.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-8 border-t border-slate-200 pt-5 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between text-xs text-slate-500">
            <p>© {new Date().getFullYear()} FinArchitect. Semua hak dilindungi.</p>
            <div className="flex items-center gap-4">
              <span>Syarat & Ketentuan</span>
              <span>Kebijakan Privasi</span>
              <span>Bantuan</span>
            </div>
          </div>
      </div>
    </div>
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
        className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-slate-600 hover:bg-gray-50 transition-colors"
      >
        <Download className="w-4 h-4" />
        Excel
      </button>
      <button
        onClick={handlePdfExport}
        className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-700 transition-colors"
      >
        <Download className="w-4 h-4" />
        PDF
      </button>
    </>
  );
}
