/**
 * Module: Dashboard Snapshot Laporan Tersimpan
 * Purpose: Tampilkan charts, KPI, dan tabel detail per pesanan dari saved report (DB)
 * Used by: /reports/[id]/dashboard route (linked dari detail report)
 * Dependencies: /api/reports/[id], RevenueBarChart, FeePieChart, lucide-react
 * Public functions: SavedReportDashboardPage (default export), SortHeader, SummaryCard
 * Side effects: GET /api/reports/[id] (TiDB read); clipboard write saat copy order ID
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpDown,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Search,
  X,
} from "lucide-react";
import AuthAreaLayout from "@/components/AuthAreaLayout";
import RevenueBarChart from "@/components/charts/RevenueBarChart";
import FeePieChart from "@/components/charts/FeePieChart";
import { MARKETPLACE_LABELS } from "@/lib/types";
import { formatNumber, formatPercent, formatRupiah } from "@/lib/utils";
import type { CalculatedOrder, MarketplaceId, RevenueReport } from "@/lib/types";

interface SavedReportApiRow {
  id: string;
  storeName: string;
  marketplace: MarketplaceId;
  label: string;
  createdAt: string;
  reportJson: RevenueReport;
}

type OrderSortKey =
  | "orderId"
  | "orderDate"
  | "productName"
  | "sku"
  | "marketplace"
  | "qty"
  | "revenue"
  | "hpp"
  | "platformFee"
  | "netProfit"
  | "margin";

type GroupedOrder = {
  key: string;
  orderId: string;
  orderDate: string;
  productName: string;
  sku: string;
  marketplace: MarketplaceId;
  qty: number;
  revenue: number;
  hpp: number;
  platformFee: number;
  netProfit: number;
  netMargin: number;
  lines: CalculatedOrder[];
  skuCount: number;
};

function expandOrderLines(order: CalculatedOrder): CalculatedOrder[] {
  if (!order.lineItems || order.lineItems.length === 0) return [order];

  return order.lineItems.map((line) => ({
    ...order,
    sku: line.sku,
    productName: line.productName,
    qty: line.qty,
    revenue: line.revenue,
    hpp: line.hpp,
    grossProfit: line.grossProfit,
    netProfit: line.netProfit,
    grossMargin: line.grossMargin,
    netMargin: line.netMargin,
    fees: {
      ...order.fees,
      commissionFee: 0,
      transactionFee: 0,
      freeShippingFee: 0,
      orderProcessingFee: 0,
      voucherBySeller: 0,
      affiliateCommission: 0,
      otherFees: 0,
      totalPlatformFee: line.platformFee,
    },
    lineItems: undefined,
  }));
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

export default function SavedReportDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const [reportRow, setReportRow] = useState<SavedReportApiRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState<"all" | MarketplaceId>("all");
  const [profitFilter, setProfitFilter] = useState<"all" | "profit" | "loss">("all");
  const [rowsPerPage, setRowsPerPage] = useState<number | "all">(20);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<OrderSortKey>("orderDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedOrder, setSelectedOrder] = useState<GroupedOrder | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { id } = await params;
        const res = await fetch(`/api/reports/${id}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!active) return;
          setError(data?.error ?? "Gagal memuat dashboard laporan.");
          return;
        }
        if (!active) return;
        setReportRow(data.report as SavedReportApiRow);
      } catch {
        if (!active) return;
        setError("Gagal memuat dashboard laporan.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [params]);

  const report = reportRow?.reportJson ?? null;

  const netMargin = useMemo(() => {
    if (!report || report.totalRevenue <= 0) return 0;
    return (report.totalNetProfit / report.totalRevenue) * 100;
  }, [report]);

  const periodLabel = useMemo(() => {
    if (!report?.period?.from || !report?.period?.to) return "Periode sesuai report tersimpan";
    return `${report.period.from} - ${report.period.to}`;
  }, [report]);

  const groupedOrders = useMemo(() => {
    if (!report) return [] as GroupedOrder[];

    const map = new Map<string, GroupedOrder>();

    for (const order of report.orders) {
      const key = `${order.marketplace}:${normalizeOrderId(order.orderId)}`;
      const expandedLines = expandOrderLines(order);
      const existing = map.get(key);
      if (!existing) {
        const totals = expandedLines.reduce(
          (acc, line) => {
            acc.qty += line.qty;
            acc.revenue += line.revenue;
            acc.hpp += line.hpp;
            acc.platformFee += line.fees.totalPlatformFee;
            acc.netProfit += line.netProfit;
            return acc;
          },
          { qty: 0, revenue: 0, hpp: 0, platformFee: 0, netProfit: 0 }
        );
        const skuSet = new Set(expandedLines.map((x) => String(x.sku || "").trim() || "-"));

        map.set(key, {
          key,
          orderId: order.orderId,
          orderDate: order.orderDate,
          productName:
            expandedLines.length > 1
              ? `${expandedLines[0]?.productName || "-"} +${expandedLines.length - 1} produk`
              : expandedLines[0]?.productName || order.productName,
          sku: skuSet.size > 1 ? "Multi SKU" : (expandedLines[0]?.sku || order.sku || "-"),
          marketplace: order.marketplace,
          qty: totals.qty,
          revenue: totals.revenue,
          hpp: totals.hpp,
          platformFee: totals.platformFee,
          netProfit: totals.netProfit,
          netMargin: totals.revenue > 0 ? (totals.netProfit / totals.revenue) * 100 : 0,
          lines: expandedLines,
          skuCount: skuSet.size,
        });
        continue;
      }

      for (const line of expandedLines) {
        existing.qty += line.qty;
        existing.revenue += line.revenue;
        existing.hpp += line.hpp;
        existing.platformFee += line.fees.totalPlatformFee;
        existing.netProfit += line.netProfit;
        existing.lines.push(line);
      }
      existing.netMargin = existing.revenue > 0 ? (existing.netProfit / existing.revenue) * 100 : 0;

      const skuSet = new Set(existing.lines.map((x) => String(x.sku || "").trim() || "-"));
      existing.skuCount = skuSet.size;
      existing.sku = existing.skuCount > 1 ? "Multi SKU" : existing.lines[0]?.sku || "-";

      if (existing.lines.length > 1) {
        existing.productName = `${existing.lines[0]?.productName || "-"} +${existing.lines.length - 1} produk`;
      }
    }

    return Array.from(map.values());
  }, [report]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groupedOrders.filter((order) => {
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
  }, [groupedOrders, marketplaceFilter, profitFilter, query]);

  const sortedOrders = useMemo(() => {
    const list = [...filteredOrders];
    list.sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;
      if (sortKey === "orderDate") {
        const aTs = parseDateLoose(a.orderDate)?.getTime() ?? 0;
        const bTs = parseDateLoose(b.orderDate)?.getTime() ?? 0;
        return (aTs - bTs) * dir;
      }
      if (sortKey === "qty") return (a.qty - b.qty) * dir;
      if (sortKey === "revenue") return (a.revenue - b.revenue) * dir;
      if (sortKey === "hpp") return (a.hpp - b.hpp) * dir;
      if (sortKey === "platformFee") return (a.platformFee - b.platformFee) * dir;
      if (sortKey === "netProfit") return (a.netProfit - b.netProfit) * dir;
      if (sortKey === "margin") return (a.netMargin - b.netMargin) * dir;
      if (sortKey === "marketplace") {
        return MARKETPLACE_LABELS[a.marketplace].localeCompare(MARKETPLACE_LABELS[b.marketplace], "id", {
          sensitivity: "base",
        }) * dir;
      }
      return String(a[sortKey]).localeCompare(String(b[sortKey]), "id", { sensitivity: "base" }) * dir;
    });
    return list;
  }, [filteredOrders, sortDirection, sortKey]);

  const totals = useMemo(() => {
    return sortedOrders.reduce(
      (acc, order) => {
        acc.qty += order.qty;
        acc.revenue += order.revenue;
        acc.hpp += order.hpp;
        acc.platformFee += order.platformFee;
        acc.netProfit += order.netProfit;
        return acc;
      },
      { qty: 0, revenue: 0, hpp: 0, platformFee: 0, netProfit: 0 }
    );
  }, [sortedOrders]);

  const totalPages = useMemo(() => {
    if (rowsPerPage === "all") return 1;
    return Math.max(1, Math.ceil(sortedOrders.length / rowsPerPage));
  }, [rowsPerPage, sortedOrders.length]);

  useEffect(() => {
    setPage(1);
  }, [query, marketplaceFilter, profitFilter, sortKey, sortDirection, rowsPerPage]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pagedOrders = useMemo(() => {
    if (rowsPerPage === "all") return sortedOrders;
    const start = (page - 1) * rowsPerPage;
    return sortedOrders.slice(start, start + rowsPerPage);
  }, [sortedOrders, page, rowsPerPage]);

  const toggleSort = (key: OrderSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "orderId" || key === "productName" || key === "sku" || key === "marketplace" ? "asc" : "desc");
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

  return (
    <AuthAreaLayout contentClassName="dashboard-theme px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1320px] space-y-6">

        {/* Header — standalone, no outer card wrapper */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href={reportRow ? `/reports/${reportRow.id}` : "/reports"} className="inline-flex items-center gap-1 text-xs text-[var(--text-subtle)] hover:text-[var(--foreground)]">
              <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke detail laporan
            </Link>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--foreground)]">Dashboard Report Snapshot</h1>
            <p className="mt-1 text-sm text-[var(--text-subtle)]">
              {reportRow ? `${reportRow.label} • ${new Date(reportRow.createdAt).toLocaleString("id-ID")}` : "Memuat data report"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-subtle)] sm:inline-flex">
              <CalendarDays className="h-4 w-4" /> {periodLabel}
            </div>
            {reportRow && (
              <Link
                href={`/reports/${reportRow.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
              >
                <ExternalLink className="h-4 w-4" /> Detail Report
              </Link>
            )}
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 py-8 text-center">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[var(--text-subtle)]" />
            <p className="text-sm text-[var(--text-subtle)]">Memuat dashboard report...</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        ) : !report ? (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-5 py-4">
            <p className="text-sm text-[var(--text-subtle)]">Data report tidak tersedia.</p>
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <SummaryCard label="Total Revenue" value={formatRupiah(report.totalRevenue)} />
              <SummaryCard
                label="Gross Profit"
                value={formatRupiah(report.totalGrossProfit)}
                color={report.totalGrossProfit >= 0 ? "text-emerald-400" : "text-red-400"}
              />
              <SummaryCard
                label="Biaya Platform"
                value={formatRupiah(report.totalPlatformFees)}
                color="text-red-400"
              />
              <SummaryCard
                label="Net Profit"
                value={formatRupiah(report.totalNetProfit)}
                color={report.totalNetProfit >= 0 ? "text-emerald-400" : "text-red-400"}
                sub={`Margin ${formatPercent(netMargin)}`}
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">Cash Flow Marketplace</h3>
                  <span className="text-xs text-[var(--text-subtle)]">Mode: Report Snapshot</span>
                </div>
                <RevenueBarChart marketplaces={report.marketplaces} />
              </section>

              <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
                <h3 className="mb-4 text-sm font-semibold text-[var(--foreground)]">Breakdown Biaya Platform</h3>
                <FeePieChart marketplaces={report.marketplaces} />
              </section>
            </div>

            {/* Orders table */}
            <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)]">
              <div className="border-b border-[var(--border-subtle)] px-5 py-4">
                <h3 className="font-semibold text-[var(--foreground)]">Detail Per Pesanan</h3>
                <p className="mt-1 text-xs text-[var(--text-subtle)]">
                  Tabel audit report tersimpan dengan filter, sortir, dan pagination.
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
                  <select
                    value={marketplaceFilter}
                    onChange={(e) => setMarketplaceFilter(e.target.value as "all" | MarketplaceId)}
                    className="field-input"
                  >
                    <option value="all">Semua marketplace</option>
                    {Object.entries(MARKETPLACE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={profitFilter}
                    onChange={(e) => setProfitFilter(e.target.value as "all" | "profit" | "loss")}
                    className="field-input"
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
                {/* SKU column removed — info already shown in Order ID cell via badge */}
                <table className="w-full min-w-[900px] text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                      <SortHeader label="Order ID" onClick={() => toggleSort("orderId")} />
                      <SortHeader label="Tanggal" onClick={() => toggleSort("orderDate")} />
                      <SortHeader label="Produk" onClick={() => toggleSort("productName")} />
                      <SortHeader label="Marketplace" onClick={() => toggleSort("marketplace")} />
                      <SortHeader label="Qty" align="right" onClick={() => toggleSort("qty")} />
                      <SortHeader label="Revenue" align="right" onClick={() => toggleSort("revenue")} />
                      <SortHeader label="HPP" align="right" onClick={() => toggleSort("hpp")} />
                      <SortHeader label="Biaya Platform" align="right" onClick={() => toggleSort("platformFee")} />
                      <SortHeader label="Net Profit" align="right" onClick={() => toggleSort("netProfit")} />
                      <SortHeader label="Margin" align="right" onClick={() => toggleSort("margin")} />
                      <th className="px-2 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {pagedOrders.map((order) => (
                      <tr key={order.key} className="hover:bg-[var(--surface-soft)]">
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[var(--foreground)]">{order.orderId}</span>
                            <button
                              type="button"
                              onClick={() => void handleCopyOrderId(order.orderId)}
                              className="inline-flex h-5 w-5 items-center justify-center rounded border border-[var(--border-subtle)] text-[var(--text-subtle)] hover:bg-[var(--surface-soft)] hover:text-[var(--foreground)]"
                              title="Copy order ID"
                            >
                              {copiedOrderId === order.orderId ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                            {order.skuCount > 1 && (
                              <span className="inline-flex rounded-full border border-cyan-300/40 bg-cyan-300/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200">
                                {order.skuCount} SKU
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-[var(--text-subtle)] whitespace-nowrap">{order.orderDate}</td>
                        <td className="max-w-[200px] truncate px-2 py-1.5 text-[var(--foreground)]">{order.productName}</td>
                        <td className="px-2 py-1.5 text-[var(--text-subtle)]">{MARKETPLACE_LABELS[order.marketplace]}</td>
                        <td className="px-2 py-1.5 text-right text-[var(--foreground)]">{formatNumber(order.qty)}</td>
                        <td className="px-2 py-1.5 text-right text-[var(--foreground)]">{formatRupiah(order.revenue)}</td>
                        <td className="px-2 py-1.5 text-right text-cyan-300">{formatRupiah(order.hpp)}</td>
                        <td className="px-2 py-1.5 text-right text-red-400">-{formatRupiah(order.platformFee)}</td>
                        <td className={`px-2 py-1.5 text-right font-medium ${order.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatRupiah(order.netProfit)}</td>
                        <td className={`px-2 py-1.5 text-right ${order.netMargin >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatPercent(order.netMargin)}</td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className="rounded border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-semibold text-[var(--foreground)] hover:bg-[var(--surface-soft)]"
                          >
                            Detail
                          </button>
                        </td>
                      </tr>
                    ))}
                    {pagedOrders.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-3 py-6 text-center text-sm text-[var(--text-subtle)]">
                          Tidak ada order yang cocok dengan filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {sortedOrders.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                        <td className="px-2 py-2.5 font-semibold text-[var(--foreground)]" colSpan={4}>Total (Filtered)</td>
                        <td className="px-2 py-2.5 text-right font-semibold text-[var(--foreground)]">{formatNumber(totals.qty)}</td>
                        <td className="px-2 py-2.5 text-right font-semibold text-[var(--foreground)]">{formatRupiah(totals.revenue)}</td>
                        <td className="px-2 py-2.5 text-right font-semibold text-cyan-300">{formatRupiah(totals.hpp)}</td>
                        <td className="px-2 py-2.5 text-right font-semibold text-red-400">-{formatRupiah(totals.platformFee)}</td>
                        <td className={`px-2 py-2.5 text-right font-semibold ${totals.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatRupiah(totals.netProfit)}</td>
                        <td className={`px-2 py-2.5 text-right font-semibold ${(totals.revenue > 0 ? (totals.netProfit / totals.revenue) * 100 : 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatPercent(totals.revenue > 0 ? (totals.netProfit / totals.revenue) * 100 : 0)}
                        </td>
                        <td className="px-2 py-2.5" />
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
          </>
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
                      {copiedOrderId === selectedOrder.orderId ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
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
                <div><span className="text-[var(--text-subtle)]">Qty:</span> <span className="text-[var(--text)]">{selectedOrder.qty}</span></div>
                <div>
                  <span className="text-[var(--text-subtle)]">Marketplace:</span>{" "}
                  <span className="text-[var(--text)]">{MARKETPLACE_LABELS[selectedOrder.marketplace]}</span>
                  {selectedOrder.skuCount > 1 && (
                    <span className="ml-2 inline-flex rounded-full border border-cyan-300/40 bg-cyan-300/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-200">
                      Multi SKU ({selectedOrder.skuCount})
                    </span>
                  )}
                </div>
                <div><span className="text-[var(--text-subtle)]">Revenue:</span> <span className="text-[var(--text)]">{formatRupiah(selectedOrder.revenue)}</span></div>
                <div><span className="text-[var(--text-subtle)]">HPP:</span> <span className="font-medium text-cyan-300">{formatRupiah(selectedOrder.hpp)}</span></div>
                <div><span className="text-[var(--text-subtle)]">Biaya Platform:</span> <span className="text-red-400">-{formatRupiah(selectedOrder.platformFee)}</span></div>
                <div><span className="text-[var(--text-subtle)]">Net Profit:</span> <span className={selectedOrder.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}>{formatRupiah(selectedOrder.netProfit)}</span></div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-[var(--text-subtle)]">Detail Per SKU (HPP x Qty per SKU)</p>
                <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                  <table className="w-full min-w-[760px] text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                        <th className="px-3 py-2 text-left text-[var(--text-subtle)]">SKU</th>
                        <th className="px-3 py-2 text-left text-[var(--text-subtle)]">Produk</th>
                        <th className="px-3 py-2 text-right text-[var(--text-subtle)]">Qty</th>
                        <th className="px-3 py-2 text-right text-[var(--text-subtle)]">HPP / Unit</th>
                        <th className="px-3 py-2 text-right text-[var(--text-subtle)]">HPP x Qty</th>
                        <th className="px-3 py-2 text-right text-[var(--text-subtle)]">Revenue</th>
                        <th className="px-3 py-2 text-right text-[var(--text-subtle)]">HPP</th>
                        <th className="px-3 py-2 text-right text-[var(--text-subtle)]">Biaya Platform</th>
                        <th className="px-3 py-2 text-right text-[var(--text-subtle)]">Net Profit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {selectedOrder.lines.map((line, index) => (
                        <tr key={`${selectedOrder.key}-${line.sku}-${index}`} className="hover:bg-[var(--surface-soft)]">
                          <td className="px-3 py-2 font-mono text-[var(--text)]">{line.sku || "-"}</td>
                          <td className="px-3 py-2 text-[var(--text-subtle)]">{line.productName}</td>
                          <td className="px-3 py-2 text-right text-[var(--text)]">{formatNumber(line.qty)}</td>
                          <td className="px-3 py-2 text-right text-cyan-300">{formatRupiah(line.qty > 0 ? line.hpp / line.qty : 0)}</td>
                          <td className="px-3 py-2 text-right text-cyan-300">
                            {formatRupiah(line.qty > 0 ? line.hpp / line.qty : 0)} x {formatNumber(line.qty)}
                          </td>
                          <td className="px-3 py-2 text-right text-[var(--text)]">{formatRupiah(line.revenue)}</td>
                          <td className="px-3 py-2 text-right text-cyan-300">{formatRupiah(line.hpp)}</td>
                          <td className="px-3 py-2 text-right text-red-400">-{formatRupiah(line.fees.totalPlatformFee)}</td>
                          <td className={`px-3 py-2 text-right font-medium ${line.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatRupiah(line.netProfit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
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

function SummaryCard({
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
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)]/95 p-4 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--text-subtle)]">{sub}</p>}
    </div>
  );
}
