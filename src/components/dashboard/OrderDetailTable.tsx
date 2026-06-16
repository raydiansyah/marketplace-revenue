"use client";

import React, { memo, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Copy, Search, Trash2, X } from "lucide-react";
import { MARKETPLACE_COLORS, MARKETPLACE_LABELS } from "@/lib/types";
import { useAppStore } from "@/store/app-store";
import { formatNumber, formatPercent, formatRupiah } from "@/lib/utils";
import {
  adjustLinesWithReturnQty,
  dedupeOrderLines,
  getReturnedQtyFromOrderLines,
  lookupHppForLine,
  lookupHppMatchForLine,
  normalizeOrderId,
  normalizeSkuToken,
  resolveLineSku,
  shouldUseAggregatedOrderView,
  toOrderKey,
} from "@/lib/dashboard/order-detail-utils";
import type { CalculatedOrder, HppEntry, MarketplaceId, MarketplaceUploadSet, RawOrder } from "@/lib/types";

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
export default OrderDetailTable;
