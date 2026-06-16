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
  ReturnOrderTransaction,
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
import { lookupHpp } from "./calculators/hpp-lookup";

type Configs = {
  shopee?: ShopeeConfig;
  tokopedia?: TokopediaConfig;
  lazada?: LazadaConfig;
};

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

function formatDateYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

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

function dedupeSignature(line: RawOrder): string {
  const lineId = getRawValueByKey(line.rawData, [
    "id pesanan baris",
    "order item id",
    "order line id",
    "line id",
    "orderitemid",
  ]);
  if (lineId) return `line:${lineId.toLowerCase()}`;

  return [
    normalizeOrderId(line.orderId),
    resolveLineSku(line).trim().toLowerCase(),
    String(line.productName ?? "").trim().toLowerCase(),
    String(line.qty ?? 0),
    String(line.actualPrice ?? 0),
    String(line.orderDate ?? "").trim().toLowerCase(),
  ].join("|");
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

type ReturnAggregation = {
  byOrder: Map<string, ReturnAggregate>;
  qtyByOrderSku: Map<string, Map<string, number>>;
};

function normalizeSkuToken(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/^'+/, "")
    .replace(/\.0+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function aggregateReturns(transactions: ReturnOrderTransaction[]): ReturnAggregation {
  const byOrder = new Map<string, ReturnAggregate>();
  const qtyByOrderSku = new Map<string, Map<string, number>>();

  for (const tx of transactions) {
    const orderId = normalizeOrderId(tx.orderId);
    if (!orderId) continue;

    const current = byOrder.get(orderId) ?? { qty: 0, amount: 0 };
    const qty = Math.max(0, tx.returnQuantity || 0);
    const amount = Math.max(0, (tx.returnUnitPrice || 0) * qty);
    current.qty += qty;
    current.amount += amount;
    byOrder.set(orderId, current);

    const skuKey = normalizeSkuToken(tx.sellerSku || tx.skuId || tx.skuName || tx.productName || "");
    if (!skuKey) continue;
    const skuMap = qtyByOrderSku.get(orderId) ?? new Map<string, number>();
    skuMap.set(skuKey, (skuMap.get(skuKey) ?? 0) + qty);
    qtyByOrderSku.set(orderId, skuMap);
  }

  return { byOrder, qtyByOrderSku };
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

function detectEmbeddedReturnedQty(lines: RawOrder[]): number {
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

function applyReturnAdjustment(params: {
  revenue: number;
  hpp: number;
  fees: OrderFeeBreakdown;
  baseQty: number;
  returnAggregate?: ReturnAggregate;
  hasEmbeddedReturn: boolean;
}): { revenue: number; hpp: number; fees: OrderFeeBreakdown; ratio: number; adjustedQty: number } {
  const {
    revenue,
    hpp,
    fees,
    baseQty,
    returnAggregate,
    hasEmbeddedReturn,
  } = params;

  if (!returnAggregate || hasEmbeddedReturn) {
    return { revenue, hpp, fees, ratio: 0, adjustedQty: baseQty };
  }

  const adjustedQty = Math.max(0, baseQty - Math.max(0, returnAggregate.qty || 0));

  const ratioByQty =
    baseQty > 0 && returnAggregate.qty > 0
      ? clamp01(returnAggregate.qty / baseQty)
      : 0;
  const ratioByAmount =
    revenue > 0 && returnAggregate.amount > 0
      ? clamp01(returnAggregate.amount / revenue)
      : 0;
  const ratio = clamp01(Math.max(ratioByQty, ratioByAmount));
  if (ratio <= 0) return { revenue, hpp, fees, ratio: 0, adjustedQty: baseQty };

  const scale = 1 - ratio;
  return {
    revenue: revenue * scale,
    hpp: hpp * scale,
    fees: scaleFees(fees, scale),
    ratio,
    adjustedQty,
  };
}

function scaleFees(fees: OrderFeeBreakdown, ratio: number): OrderFeeBreakdown {
  return {
    commissionFee: fees.commissionFee * ratio,
    transactionFee: fees.transactionFee * ratio,
    freeShippingFee: fees.freeShippingFee * ratio,
    orderProcessingFee: fees.orderProcessingFee * ratio,
    voucherBySeller: fees.voucherBySeller * ratio,
    affiliateCommission: fees.affiliateCommission * ratio,
    otherFees: fees.otherFees * ratio,
    totalPlatformFee: fees.totalPlatformFee * ratio,
  };
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
  const returnAggregation = aggregateReturns(uploadSet.returnOrderFile?.transactions ?? []);

  // Optional: blacklist order dari file Pesanan Cancel + Failed Delivery
  const excludedOrderIds = new Set(
    [
      ...(uploadSet.canceledOrderFile?.rawOrders ?? []),
      ...(uploadSet.failedDeliveryFile?.rawOrders ?? []),
    ]
      .map((order) => normalizeOrderId(order.orderId))
      .filter(Boolean)
  );

  // Semua order dari file pesanan selesai, diindex by orderId -> kumpulan line item (kecuali cancel)
  const orderMap = new Map<string, RawOrder[]>();
  const seenByOrder = new Map<string, Set<string>>();
  for (const of_ of uploadSet.orderFiles) {
    for (const order of of_.rawOrders) {
      const orderId = normalizeOrderId(order.orderId);
      if (!orderId || excludedOrderIds.has(orderId)) continue;

      const signature = dedupeSignature(order);
      const seen = seenByOrder.get(orderId) ?? new Set<string>();
      if (seen.has(signature)) continue;
      seen.add(signature);
      seenByOrder.set(orderId, seen);

      const existing = orderMap.get(orderId) ?? [];
      existing.push(order);
      orderMap.set(orderId, existing);
    }
  }

  const aggregateOrderLines = (lines: RawOrder[], marketplace: MarketplaceId): RawOrder => {
    if (lines.length === 0) {
      return {
        orderId: "",
        orderDate: "",
        productName: "",
        sku: "",
        qty: 0,
        sellingPrice: 0,
        actualPrice: 0,
        status: "Selesai",
        marketplace,
      };
    }

    const first = lines[0];
    const totalQty = lines.reduce((sum, line) => sum + Math.max(0, line.qty || 0), 0);
    const totalSelling = lines.reduce((sum, line) => sum + Math.max(0, (line.sellingPrice || 0) * (line.qty || 0)), 0);
    const totalActual = lines.reduce((sum, line) => sum + Math.max(0, (line.actualPrice || 0) * (line.qty || 0)), 0);
    const skuSet = new Set(lines.map((line) => String(resolveLineSku(line) || "").trim()).filter(Boolean));
    const firstResolvedSku = lines.map((line) => String(resolveLineSku(line) || "").trim()).find(Boolean) || "";

    const mergedRawData = lines.reduce<Record<string, string>>((acc, line) => {
      if (!line.rawData) return acc;
      for (const [k, v] of Object.entries(line.rawData)) {
        if (!(k in acc)) acc[k] = v;
      }
      return acc;
    }, {});

    return {
      ...first,
      qty: totalQty > 0 ? totalQty : first.qty,
      sellingPrice: totalQty > 0 ? totalSelling / totalQty : first.sellingPrice,
      actualPrice: totalQty > 0 ? totalActual / totalQty : first.actualPrice,
      productName:
        lines.length > 1
          ? `${first.productName} +${lines.length - 1} produk`
          : first.productName,
      sku: skuSet.size > 1 ? "Multi SKU" : (firstResolvedSku || first.sku || ""),
      marketplace,
      rawData: Object.keys(mergedRawData).length > 0 ? mergedRawData : first.rawData,
    };
  };

  // Jika ada file Transaksi Pendapatan → pakai sebagai sumber kebenaran
  if (uploadSet.incomeFile && uploadSet.incomeFile.transactions.length > 0) {
    return uploadSet.incomeFile.transactions
      .filter((income) => {
        const normalizedOrderId = normalizeOrderId(income.orderId);
        if (excludedOrderIds.has(normalizedOrderId)) return false;

        // Jika order tidak ada di file Pesanan Selesai, jangan dihitung.
        // Tanpa data produk (SKU, nama, qty), HPP tidak bisa dihitung → margin palsu tinggi.
        // Ini berlaku untuk SEMUA marketplace (Tokopedia, Shopee, Lazada).
        if (!orderMap.has(normalizedOrderId)) {
          console.warn(
            `[reconcile] Order ${normalizedOrderId} (${mp}) ada di income file tapi tidak ditemukan di file pesanan. Dilewati dari laporan.`
          );
          return false;
        }

        // Khusus Shopee:
        // Jika settlementAmount=0 dan totalDeductions=0, ini adalah order retur/refund
        // yang dana-nya sudah dikembalikan ke pembeli. Meskipun order muncul di file
        // Pesanan Selesai dengan harga produk, tidak ada uang yang masuk ke seller.
        // Mengikutsertakannya akan menggelembungkan revenue dan profit secara palsu.
        if (mp === "shopee" && income.settlementAmount === 0 && income.totalDeductions === 0) {
          return false;
        }

        return true;
      })
      .map((income): CalculatedOrder => {
        const normalizedOrderId = normalizeOrderId(income.orderId);
        const orderLines = orderMap.get(normalizedOrderId) ?? [];
        const hasEmbeddedReturn = detectEmbeddedReturnedQty(orderLines) > 0;
        const adjustedOrderLines = adjustLinesWithReturnQty(
          orderLines,
          new Map(returnAggregation.qtyByOrderSku.get(normalizedOrderId) ?? []),
          returnAggregation.byOrder.get(normalizedOrderId)?.qty ?? 0,
          hasEmbeddedReturn
        );
        const order = adjustedOrderLines.length > 0
          ? aggregateOrderLines(adjustedOrderLines, mp)
          : (orderLines.length > 0 ? aggregateOrderLines(orderLines, mp) : undefined);

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

        const originalLineRevenue = orderLines.reduce(
          (sum, line) => sum + Math.max(0, (line.actualPrice || 0) * (line.qty || 0)),
          0
        );
        const adjustedLineRevenue = adjustedOrderLines.reduce(
          (sum, line) => sum + Math.max(0, (line.actualPrice || 0) * (line.qty || 0)),
          0
        );
        const totalBaseQty = adjustedOrderLines.length > 0
          ? adjustedOrderLines.reduce((sum, line) => sum + Math.max(0, line.qty || 0), 0)
          : (orderLines.length > 0
              ? orderLines.reduce((sum, line) => sum + Math.max(0, line.qty || 0), 0)
              : Math.max(0, rawOrder.qty || 0));

        // Fallback chain: order lines revenue → income grossAmount → settlement + fees estimate → actualPrice * qty
        const baseRevenue =
          (adjustedOrderLines.length > 0 ? adjustedLineRevenue : 0) ||
          income.grossAmount ||
          (income.settlementAmount > 0 ? income.settlementAmount + income.totalDeductions : 0) ||
          rawOrder.actualPrice * rawOrder.qty;
        const baseHpp = adjustedOrderLines.length > 0
          ? adjustedOrderLines.reduce((sum, line) => {
              const resolvedSku = resolveLineSku(line);
              return sum + lookupHpp(resolvedSku, line.productName, hppEntries) * line.qty;
            }, 0)
          : orderLines.length > 0
            ? orderLines.reduce((sum, line) => {
              const resolvedSku = resolveLineSku(line);
              return sum + lookupHpp(resolvedSku, line.productName, hppEntries) * line.qty;
            }, 0)
            : lookupHpp(rawOrder.sku, rawOrder.productName, hppEntries) * rawOrder.qty;

        // Gunakan fee aktual dari Transaksi Pendapatan.
        // PENTING: fee dari income TIDAK di-scale berdasarkan return qty ratio karena
        // platform sudah menghitung settlement aktual setelah return. Men-scale-nya
        // lagi akan menghasilkan fee terlalu kecil dan net profit terlalu besar.
        const baseFees = feesFromIncome(income);
        const adjusted =
          adjustedOrderLines.length > 0
            ? {
                revenue: baseRevenue,
                hpp: baseHpp,
                fees: baseFees,
                ratio:
                  originalLineRevenue > 0
                    ? clamp01(adjustedLineRevenue / originalLineRevenue)
                    : 1,
                adjustedQty: totalBaseQty,
              }
            : applyReturnAdjustment({
                revenue: baseRevenue,
                hpp: baseHpp,
                fees: baseFees,
                baseQty: totalBaseQty,
                returnAggregate: returnAggregation.byOrder.get(normalizedOrderId),
                hasEmbeddedReturn,
              });
        const revenue = adjusted.revenue;
        const hpp = adjusted.hpp;
        const fees = adjusted.fees;

        // Override settlement amount jika tersedia
        rawOrder.settlementAmount = income.settlementAmount;

        // Hitung return metrics untuk audit trail
        // Kasus 1: embedded return qty (ada di file pesanan, kolom "Sku Quantity of return")
        const embeddedReturnQty = orderLines.reduce((sum, line) => {
          const returned = getRawValueByKey(line.rawData, [
            "sku quantity of return",
            "qty return",
            "jumlah retur",
            "returned quantity",
          ]);
          return sum + parseQtyLoose(returned);
        }, 0);

        // Kasus 2: return dari file return terpisah (setelah adjust lines)
        const externalReturnQty = !hasEmbeddedReturn
          ? (returnAggregation.byOrder.get(normalizedOrderId)?.qty ?? 0)
          : 0;

        const totalReturnQty = embeddedReturnQty + externalReturnQty;
        const hppPerUnit = totalReturnQty > 0 && orderLines.length > 0
          ? (() => {
              // Estimasi HPP per unit dari line terkena return (SKU pertama yang ada HPP-nya)
              for (const line of orderLines) {
                const resolvedSku = resolveLineSku(line);
                const unitHpp = lookupHpp(resolvedSku, line.productName, hppEntries);
                if (unitHpp > 0) return unitHpp;
              }
              return 0;
            })()
          : 0;

        const returnQty = totalReturnQty > 0 ? totalReturnQty : undefined;
        // actualPrice di rawOrder sudah menggunakan qtyForPriceCalc (harga per unit sebelum return)
        const returnRevenue = returnQty !== undefined
          ? returnQty * (rawOrder.actualPrice || 0)
          : undefined;
        const returnHpp = returnQty !== undefined && hppPerUnit > 0
          ? returnQty * hppPerUnit
          : undefined;

        const grossProfit = revenue - hpp;
        const netProfit = income.settlementAmount !== 0
          ? income.settlementAmount - hpp
          : grossProfit - fees.totalPlatformFee;

        const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
        const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

        const lineItems = adjustedOrderLines.length > 0
          ? (() => {
              const totalLineRevenueBase = adjustedOrderLines.reduce(
                (sum, line) => sum + Math.max(0, (line.actualPrice || 0) * (line.qty || 0)),
                0
              );

              return adjustedOrderLines.map((line) => {
                const lineBaseRevenue = Math.max(0, (line.actualPrice || 0) * (line.qty || 0));
                const ratio =
                  totalLineRevenueBase > 0
                    ? lineBaseRevenue / totalLineRevenueBase
                    : 1 / Math.max(1, adjustedOrderLines.length);

                const lineRevenue = revenue * ratio;
                const resolvedSku = resolveLineSku(line);
                const rawLineHpp = lookupHpp(resolvedSku, line.productName, hppEntries) * line.qty;
                const lineHpp = rawLineHpp;
                const lineFees = scaleFees(fees, ratio);
                const lineGrossProfit = lineRevenue - lineHpp;
                const lineNetProfit =
                  income.settlementAmount !== 0
                    ? income.settlementAmount * ratio - lineHpp
                    : lineGrossProfit - lineFees.totalPlatformFee;
                const lineGrossMargin = lineRevenue > 0 ? (lineGrossProfit / lineRevenue) * 100 : 0;
                const lineNetMargin = lineRevenue > 0 ? (lineNetProfit / lineRevenue) * 100 : 0;

                return {
                  sku: resolvedSku || "",
                  productName: line.productName || "",
                  qty: Math.max(0, line.qty || 0),
                  revenue: lineRevenue,
                  hpp: lineHpp,
                  platformFee: lineFees.totalPlatformFee,
                  grossProfit: lineGrossProfit,
                  netProfit: lineNetProfit,
                  grossMargin: lineGrossMargin,
                  netMargin: lineNetMargin,
                };
              });
            })()
          : undefined;

        return {
          ...rawOrder,
          qty: Math.max(0, adjusted.adjustedQty),
          hpp,
          fees,
          revenue,
          grossProfit,
          netProfit,
          grossMargin,
          netMargin,
          returnQty,
          returnRevenue,
          returnHpp,
          lineItems,
        };
      });
  }

  // Tidak ada file Income → hitung fee dari config (estimasi)
  const allOrders = [...orderMap.entries()].filter(
    ([orderId]) => !excludedOrderIds.has(orderId)
  );
  return allOrders.map(([normalizedOrderId, lines]): CalculatedOrder => {
    const hasEmbeddedReturn = detectEmbeddedReturnedQty(lines) > 0;
    const returnedQty = returnAggregation.byOrder.get(normalizedOrderId)?.qty ?? 0;
    const adjustedLines = adjustLinesWithReturnQty(
      lines,
      new Map(returnAggregation.qtyByOrderSku.get(normalizedOrderId) ?? []),
      returnedQty,
      hasEmbeddedReturn
    );

    const fullyReturnedByReturnFile = !hasEmbeddedReturn && returnedQty > 0 && adjustedLines.length === 0;
    const sourceLines = fullyReturnedByReturnFile ? [] : (adjustedLines.length > 0 ? adjustedLines : lines);
    const order = sourceLines.length > 0 ? aggregateOrderLines(sourceLines, mp) : aggregateOrderLines(lines, mp);
    const baseRevenue = sourceLines.reduce((sum, line) => sum + Math.max(0, (line.actualPrice || 0) * (line.qty || 0)), 0);
    const baseHpp = sourceLines.reduce((sum, line) => {
      const resolvedSku = resolveLineSku(line);
      return sum + lookupHpp(resolvedSku, line.productName, hppEntries) * line.qty;
    }, 0);
    const baseFees = fullyReturnedByReturnFile ? scaleFees(feesFromConfig(order, configs), 0) : feesFromConfig(order, configs);
    const totalBaseQty = sourceLines.reduce((sum, line) => sum + Math.max(0, line.qty || 0), 0);
    const revenue = baseRevenue;
    const hpp = baseHpp;
    const fees = baseFees;
    const grossProfit = revenue - hpp;
    const netProfit = grossProfit - fees.totalPlatformFee;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    // Return metrics untuk audit trail (path estimasi / tanpa income file)
    const embeddedReturnQtyNoIncome = lines.reduce((sum, line) => {
      const returned = getRawValueByKey(line.rawData, [
        "sku quantity of return",
        "qty return",
        "jumlah retur",
        "returned quantity",
      ]);
      return sum + parseQtyLoose(returned);
    }, 0);
    const externalReturnQtyNoIncome = !hasEmbeddedReturn ? returnedQty : 0;
    const totalReturnQtyNoIncome = embeddedReturnQtyNoIncome + externalReturnQtyNoIncome;

    const hppPerUnitNoIncome = totalReturnQtyNoIncome > 0
      ? (() => {
          for (const line of lines) {
            const resolvedSku = resolveLineSku(line);
            const unitHpp = lookupHpp(resolvedSku, line.productName, hppEntries);
            if (unitHpp > 0) return unitHpp;
          }
          return 0;
        })()
      : 0;

    const noIncomeReturnQty = totalReturnQtyNoIncome > 0 ? totalReturnQtyNoIncome : undefined;
    const noIncomeReturnRevenue = noIncomeReturnQty !== undefined
      ? noIncomeReturnQty * (order.actualPrice || 0)
      : undefined;
    const noIncomeReturnHpp = noIncomeReturnQty !== undefined && hppPerUnitNoIncome > 0
      ? noIncomeReturnQty * hppPerUnitNoIncome
      : undefined;

    return {
      ...order,
      qty: Math.max(0, totalBaseQty),
      hpp,
      fees,
      revenue,
      grossProfit,
      netProfit,
      grossMargin,
      netMargin,
      returnQty: noIncomeReturnQty,
      returnRevenue: noIncomeReturnRevenue,
      returnHpp: noIncomeReturnHpp,
    };
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
  const incomeDates: Date[] = [];
  const orderDates: Date[] = [];

  for (const set of Object.values(uploadSets)) {
    if (!set) continue;
    const hasOrders = set.orderFiles.some((f) => f.rawOrders.length > 0);
    const hasIncome = (set.incomeFile?.transactions.length ?? 0) > 0;
    if (!hasOrders && !hasIncome) continue;

    const orders = reconcileMarketplace(set, hppEntries, configs);
    allOrders.push(...orders);
    marketplaces.push(buildSummary(set.marketplace, orders));

    if (set.incomeFile?.transactions?.length) {
      for (const tx of set.incomeFile.transactions) {
        const parsed = parseDateLoose(tx.releaseDate);
        if (parsed) incomeDates.push(parsed);
      }
    }
    for (const order of orders) {
      const parsed = parseDateLoose(order.orderDate);
      if (parsed) orderDates.push(parsed);
    }
  }

  const periodCandidates = incomeDates.length > 0 ? incomeDates : orderDates;
  const period =
    periodCandidates.length > 0
      ? {
          from: formatDateYmd(
            periodCandidates.reduce((min, curr) => (curr.getTime() < min.getTime() ? curr : min))
          ),
          to: formatDateYmd(
            periodCandidates.reduce((max, curr) => (curr.getTime() > max.getTime() ? curr : max))
          ),
        }
      : undefined;

  return {
    generatedAt: new Date().toISOString(),
    period,
    marketplaces,
    totalRevenue: marketplaces.reduce((s, m) => s + m.totalRevenue, 0),
    totalHpp: marketplaces.reduce((s, m) => s + m.totalHpp, 0),
    totalGrossProfit: marketplaces.reduce((s, m) => s + m.totalGrossProfit, 0),
    totalPlatformFees: marketplaces.reduce((s, m) => s + m.totalPlatformFees, 0),
    totalNetProfit: marketplaces.reduce((s, m) => s + m.totalNetProfit, 0),
    orders: allOrders,
    hppSnapshot: hppEntries.length > 0 ? [...hppEntries] : undefined,
  };
}
