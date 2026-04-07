/**
 * Reconciliation engine: join Pesanan Selesai + Transaksi Pendapatan by Order ID.
 *
 * Logika:
 * 1. Transaksi Pendapatan (bulan ini) → sumber kebenaran untuk settlement & potongan aktual
 * 2. Pesanan Selesai (bulan lalu + bulan ini) → sumber kebenaran untuk detail produk (SKU, nama, qty)
 * 3. Join by Order ID → satu record lengkap per order
 * 4. Untuk order yang ada di Income tapi tidak ada di Pesanan → tetap masuk dengan info minimal
 */

import type {
  RawOrder,
  IncomeTransaction,
  MarketplaceUploadSet,
  HppEntry,
  CalculatedOrder,
  OrderFeeBreakdown,
  MarketplaceSummary,
  RevenueReport,
  MarketplaceId,
} from "./types";
import {
  DEFAULT_SHOPEE_CONFIG,
  DEFAULT_TOKOPEDIA_CONFIG,
  DEFAULT_LAZADA_CONFIG,
} from "./defaults";
import type {
  ShopeeConfig,
  TokopediaConfig,
  LazadaConfig,
} from "./types";

type Configs = {
  shopee?: ShopeeConfig;
  tokopedia?: TokopediaConfig;
  lazada?: LazadaConfig;
};

function normalizeOrderId(orderId: string): string {
  return String(orderId ?? "")
    .trim()
    .replace(/^'+/, "")
    .replace(/\.0+$/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

// ──────────────────────────────────────────────────────────────
// HPP lookup
// ──────────────────────────────────────────────────────────────

function lookupHpp(sku: string, productName: string, hppEntries: HppEntry[]): number {
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
    const bySkuExact = hppEntries.find((e) => normalizeSku(e.sku) === normalizedSku && e.cost > 0);
    if (bySkuExact) return bySkuExact.cost;
  }

  if (!normalizedProductName) return 0;

  const scored = hppEntries
    .map((entry) => {
      const entryName = normalizeName(entry.productName);
      if (!entryName) return { entry, score: 0 };
      if (entryName === normalizedProductName) return { entry, score: 100 };
      if (normalizedProductName.includes(entryName) || entryName.includes(normalizedProductName)) {
        return { entry, score: 80 };
      }

      const a = new Set(normalizedProductName.split(" ").filter(Boolean));
      const b = new Set(entryName.split(" ").filter(Boolean));
      const overlap = [...a].filter((token) => b.has(token)).length;
      const score = overlap >= 2 ? overlap * 10 : 0;
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((x, y) => y.score - x.score);

  const withCost = scored.find((item) => item.entry.cost > 0);
  if (!withCost) return scored[0]?.entry.cost ?? 0;

  // Jika SKU ada tapi tidak ketemu exact, fallback nama hanya dipakai bila tidak ambigu.
  // Ini mencegah kasus product name sama dengan HPP berbeda antar SKU (contoh pack vs pcs).
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

// ──────────────────────────────────────────────────────────────
// Build fee breakdown dari IncomeTransaction (mode: aktual dari file)
// ──────────────────────────────────────────────────────────────

function feesFromIncome(income: IncomeTransaction): OrderFeeBreakdown {
  return {
    commissionFee: income.commissionFee,
    transactionFee: income.serviceFee,
    freeShippingFee: income.shippingFee,
    orderProcessingFee: 0, // biasanya sudah include di service fee
    voucherBySeller: income.voucherBySeller,
    affiliateCommission: 0,
    otherFees: income.otherFees,
    totalPlatformFee: income.totalDeductions,
  };
}

// ──────────────────────────────────────────────────────────────
// Build fee breakdown dari kalkulasi (mode: estimasi dari config)
// ──────────────────────────────────────────────────────────────

function feesFromConfig(order: RawOrder, configs: Configs): OrderFeeBreakdown {
  const mp = order.marketplace;
  const base = order.actualPrice * order.qty;

  if (mp === "shopee") {
    const c = configs.shopee ?? DEFAULT_SHOPEE_CONFIG;
    const commissionFee = base * c.commissionRate;
    const transactionFee = base * c.transactionFee;
    const freeShippingFee = c.freeShippingXtra ? base * c.freeShippingRate : 0;
    const otherFees =
      (c.coinsCashback ? base * c.coinsCashbackRate : 0) +
      (c.promoXtra ? base * c.promoXtraRate : 0);
    const voucherBySeller = order.voucherBySeller ?? 0;
    const affiliateCommission = c.affiliateRate > 0 ? base * c.affiliateRate : (order.affiliateCommission ?? 0);
    const total = commissionFee + transactionFee + freeShippingFee + c.orderProcessingFee + otherFees + voucherBySeller + affiliateCommission;
    return { commissionFee, transactionFee, freeShippingFee, orderProcessingFee: c.orderProcessingFee, voucherBySeller, affiliateCommission, otherFees, totalPlatformFee: total };
  }

  if (mp === "tokopedia") {
    const c = configs.tokopedia ?? DEFAULT_TOKOPEDIA_CONFIG;
    const commissionFee = base * c.commissionRate;
    const dynamic = Math.min(base * c.dynamicCommissionRate, c.dynamicCommissionMax * order.qty);
    const mallFee = c.isMall ? Math.min(base * c.mallServiceFeeRate, c.mallServiceFeeMax) : 0;
    const voucherBySeller = order.voucherBySeller ?? 0;
    const affiliateCommission = c.affiliateRate > 0 ? base * c.affiliateRate : (order.affiliateCommission ?? 0);
    const total = commissionFee + dynamic + mallFee + c.orderProcessingFee + voucherBySeller + affiliateCommission;
    return { commissionFee, transactionFee: 0, freeShippingFee: 0, orderProcessingFee: c.orderProcessingFee, voucherBySeller, affiliateCommission, otherFees: dynamic + mallFee, totalPlatformFee: total };
  }

  // lazada
  const c = configs.lazada ?? DEFAULT_LAZADA_CONFIG;
  const commissionFee = base * c.commissionRate;
  const adminFee = base * c.adminFee;
  const transactionFee = base * c.paymentProcessingRate;
  const freeShippingFee = c.freeShippingMax ? base * c.freeShippingMaxRate : 0;
  const voucherBySeller = order.voucherBySeller ?? 0;
  const affiliateCommission = c.affiliateRate > 0 ? base * c.affiliateRate : (order.affiliateCommission ?? 0);
  const total = commissionFee + adminFee + transactionFee + freeShippingFee + voucherBySeller + affiliateCommission;
  return { commissionFee, transactionFee, freeShippingFee, orderProcessingFee: 0, voucherBySeller, affiliateCommission, otherFees: adminFee, totalPlatformFee: total };
}

// ──────────────────────────────────────────────────────────────
// Reconcile satu marketplace
// ──────────────────────────────────────────────────────────────

function reconcileMarketplace(
  uploadSet: MarketplaceUploadSet,
  hppEntries: HppEntry[],
  configs: Configs
): CalculatedOrder[] {
  const mp = uploadSet.marketplace;

  // Optional: blacklist order dari file Pesanan Cancel + Failed Delivery
  const excludedOrderIds = new Set(
    [
      ...(uploadSet.canceledOrderFile?.rawOrders ?? []),
      ...(uploadSet.failedDeliveryFile?.rawOrders ?? []),
    ]
      .map((order) => normalizeOrderId(order.orderId))
      .filter(Boolean)
  );

  // Semua order dari file pesanan selesai, diindex by orderId (kecuali yang cancel)
  const orderMap = new Map<string, RawOrder>();
  for (const of_ of uploadSet.orderFiles) {
    for (const order of of_.rawOrders) {
      const orderId = normalizeOrderId(order.orderId);
      if (!orderId || excludedOrderIds.has(orderId)) continue;
      orderMap.set(orderId, order);
    }
  }

  // Jika ada file Transaksi Pendapatan → pakai sebagai sumber kebenaran
  if (uploadSet.incomeFile && uploadSet.incomeFile.transactions.length > 0) {
    return uploadSet.incomeFile.transactions
      .filter((income) => {
        const normalizedOrderId = normalizeOrderId(income.orderId);
        if (excludedOrderIds.has(normalizedOrderId)) return false;

        // Khusus Tokopedia/TikTok:
        // jika order hanya ada di transaksi pendapatan tapi tidak ada di file pesanan,
        // anggap sebagai order batal agar tidak mempengaruhi total.
        if (mp === "tokopedia" && !orderMap.has(normalizedOrderId)) {
          return false;
        }

        return true;
      })
      .map((income): CalculatedOrder => {
        const order = orderMap.get(normalizeOrderId(income.orderId));

        // Pakai detail dari Pesanan jika ada, atau buat minimal dari Income
        const rawOrder: RawOrder = order ?? {
          orderId: income.orderId,
          orderDate: income.releaseDate,
          productName: "(tidak ada di file pesanan)",
          sku: "",
          qty: 1,
          sellingPrice: income.grossAmount,
          actualPrice: income.grossAmount,
          status: "Selesai",
          marketplace: mp,
        };

        const revenue = income.grossAmount || rawOrder.actualPrice * rawOrder.qty;
        const hpp = lookupHpp(rawOrder.sku, rawOrder.productName, hppEntries) * rawOrder.qty;

        // Gunakan fee aktual dari Transaksi Pendapatan
        const fees = feesFromIncome(income);

        // Override settlement amount jika tersedia
        rawOrder.settlementAmount = income.settlementAmount;

        const grossProfit = revenue - hpp;
        const netProfit = income.settlementAmount !== 0
          ? income.settlementAmount - hpp
          : grossProfit - fees.totalPlatformFee;

        const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
        const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

        return {
          ...rawOrder,
          hpp,
          fees,
          revenue,
          grossProfit,
          netProfit,
          grossMargin,
          netMargin,
        };
      });
  }

  // Tidak ada file Income → hitung fee dari config (estimasi)
  const allOrders = [...orderMap.values()].filter(
    (order) => !excludedOrderIds.has(normalizeOrderId(order.orderId))
  );
  return allOrders.map((order): CalculatedOrder => {
    const revenue = order.actualPrice * order.qty;
    const hpp = lookupHpp(order.sku, order.productName, hppEntries) * order.qty;
    const fees = feesFromConfig(order, configs);
    const grossProfit = revenue - hpp;
    const netProfit = grossProfit - fees.totalPlatformFee;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    return { ...order, hpp, fees, revenue, grossProfit, netProfit, grossMargin, netMargin };
  });
}

// ──────────────────────────────────────────────────────────────
// Build MarketplaceSummary dari CalculatedOrder[]
// ──────────────────────────────────────────────────────────────

function buildSummary(mp: MarketplaceId, orders: CalculatedOrder[]): MarketplaceSummary {
  const totalRevenue = orders.reduce((s, o) => s + o.revenue, 0);
  const totalHpp = orders.reduce((s, o) => s + o.hpp, 0);
  const totalGrossProfit = orders.reduce((s, o) => s + o.grossProfit, 0);
  const totalPlatformFees = orders.reduce((s, o) => s + o.fees.totalPlatformFee, 0);
  const totalNetProfit = orders.reduce((s, o) => s + o.netProfit, 0);

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
    marketplace: mp,
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

// ──────────────────────────────────────────────────────────────
// Main: generate report dari semua upload sets
// ──────────────────────────────────────────────────────────────

export function generateReportFromSets(
  uploadSets: Partial<Record<MarketplaceId, MarketplaceUploadSet>>,
  hppEntries: HppEntry[],
  configs: Configs
): RevenueReport {
  const allOrders: CalculatedOrder[] = [];
  const marketplaces: MarketplaceSummary[] = [];

  for (const set of Object.values(uploadSets)) {
    if (!set) continue;
    const hasOrders = set.orderFiles.some((f) => f.rawOrders.length > 0);
    const hasIncome = (set.incomeFile?.transactions.length ?? 0) > 0;
    if (!hasOrders && !hasIncome) continue;

    const orders = reconcileMarketplace(set, hppEntries, configs);
    allOrders.push(...orders);
    marketplaces.push(buildSummary(set.marketplace, orders));
  }

  return {
    generatedAt: new Date().toISOString(),
    marketplaces,
    totalRevenue: marketplaces.reduce((s, m) => s + m.totalRevenue, 0),
    totalHpp: marketplaces.reduce((s, m) => s + m.totalHpp, 0),
    totalGrossProfit: marketplaces.reduce((s, m) => s + m.totalGrossProfit, 0),
    totalPlatformFees: marketplaces.reduce((s, m) => s + m.totalPlatformFees, 0),
    totalNetProfit: marketplaces.reduce((s, m) => s + m.totalNetProfit, 0),
    orders: allOrders,
  };
}
