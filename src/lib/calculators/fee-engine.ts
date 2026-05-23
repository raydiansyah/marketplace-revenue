import type {
  RawOrder,
  CalculatedOrder,
  OrderFeeBreakdown,
  ShopeeConfig,
  TokopediaConfig,
  LazadaConfig,
  HppEntry,
  MarketplaceSummary,
  RevenueReport,
  MarketplaceId,
} from "../types";
import {
  DEFAULT_SHOPEE_CONFIG,
  DEFAULT_TOKOPEDIA_CONFIG,
  DEFAULT_LAZADA_CONFIG,
} from "../defaults";
import { lookupHpp } from "./hpp-lookup";

// ============================================================
// SHOPEE CALCULATOR
// ============================================================

function calcShopeeFees(order: RawOrder, config: ShopeeConfig): OrderFeeBreakdown {
  const baseAmount = order.actualPrice * order.qty;

  const commissionFee = baseAmount * config.commissionRate;
  const transactionFee = baseAmount * config.transactionFee;
  const freeShippingFee = config.freeShippingXtra ? baseAmount * config.freeShippingRate : 0;
  const coinsFee = config.coinsCashback ? baseAmount * config.coinsCashbackRate : 0;
  const promoFee = config.promoXtra ? baseAmount * config.promoXtraRate : 0;
  const orderProcessingFee = config.orderProcessingFee;
  const voucherBySeller = order.voucherBySeller ?? 0;
  const affiliateCommission =
    config.affiliateRate > 0
      ? baseAmount * config.affiliateRate
      : (order.affiliateCommission ?? 0);

  const otherFees = coinsFee + promoFee;

  const totalPlatformFee =
    commissionFee +
    transactionFee +
    freeShippingFee +
    orderProcessingFee +
    otherFees +
    voucherBySeller +
    affiliateCommission;

  return {
    commissionFee,
    transactionFee,
    freeShippingFee,
    orderProcessingFee,
    voucherBySeller,
    affiliateCommission,
    otherFees,
    totalPlatformFee,
  };
}

// ============================================================
// TOKOPEDIA CALCULATOR
// ============================================================

function calcTokopediaFees(order: RawOrder, config: TokopediaConfig): OrderFeeBreakdown {
  const baseAmount = order.actualPrice * order.qty;

  const commissionFee = baseAmount * config.commissionRate;

  // Dynamic commission: persentase dari baseAmount, maksimum Rp40.000 per item × qty
  const dynamicRaw = baseAmount * config.dynamicCommissionRate;
  const dynamicMax = config.dynamicCommissionMax * order.qty;
  const dynamicCommission = Math.min(dynamicRaw, dynamicMax);

  const orderProcessingFee = config.orderProcessingFee;

  const mallFee = config.isMall
    ? Math.min(baseAmount * config.mallServiceFeeRate, config.mallServiceFeeMax)
    : 0;

  const voucherBySeller = order.voucherBySeller ?? 0;
  const affiliateCommission =
    config.affiliateRate > 0
      ? baseAmount * config.affiliateRate
      : (order.affiliateCommission ?? 0);

  const otherFees = mallFee + dynamicCommission;

  const totalPlatformFee =
    commissionFee +
    orderProcessingFee +
    otherFees +
    voucherBySeller +
    affiliateCommission;

  return {
    commissionFee,
    transactionFee: 0, // sudah included di commission Tokopedia
    freeShippingFee: 0,
    orderProcessingFee,
    voucherBySeller,
    affiliateCommission,
    otherFees,
    totalPlatformFee,
  };
}

// ============================================================
// LAZADA CALCULATOR
// ============================================================

function calcLazadaFees(order: RawOrder, config: LazadaConfig): OrderFeeBreakdown {
  const baseAmount = order.actualPrice * order.qty;

  const adminFee = baseAmount * config.adminFee;
  const commissionFee = baseAmount * config.commissionRate;
  const transactionFee = baseAmount * config.paymentProcessingRate;
  const freeShippingFee = config.freeShippingMax ? baseAmount * config.freeShippingMaxRate : 0;
  const voucherBySeller = order.voucherBySeller ?? 0;
  const affiliateCommission =
    config.affiliateRate > 0
      ? baseAmount * config.affiliateRate
      : (order.affiliateCommission ?? 0);

  const otherFees = adminFee;

  const totalPlatformFee =
    commissionFee +
    transactionFee +
    freeShippingFee +
    otherFees +
    voucherBySeller +
    affiliateCommission;

  return {
    commissionFee,
    transactionFee,
    freeShippingFee,
    orderProcessingFee: 0,
    voucherBySeller,
    affiliateCommission,
    otherFees,
    totalPlatformFee,
  };
}

// ============================================================
// MAIN CALCULATION
// ============================================================

export function calculateOrder(
  order: RawOrder,
  hppEntries: HppEntry[],
  configs: {
    shopee?: ShopeeConfig;
    tokopedia?: TokopediaConfig;
    lazada?: LazadaConfig;
  }
): CalculatedOrder {
  const hpp = lookupHpp(order.sku, order.productName, hppEntries) * order.qty;
  const revenue = order.actualPrice * order.qty;

  let fees: OrderFeeBreakdown;
  switch (order.marketplace) {
    case "shopee":
      fees = calcShopeeFees(order, configs.shopee ?? DEFAULT_SHOPEE_CONFIG);
      break;
    case "tokopedia":
      fees = calcTokopediaFees(order, configs.tokopedia ?? DEFAULT_TOKOPEDIA_CONFIG);
      break;
    case "lazada":
      fees = calcLazadaFees(order, configs.lazada ?? DEFAULT_LAZADA_CONFIG);
      break;
  }

  const grossProfit = revenue - hpp;
  const netProfit = grossProfit - fees.totalPlatformFee;
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  return {
    ...order,
    hpp,
    fees,
    revenue,
    grossProfit,
    netProfit,
    grossMargin,
    netMargin,
  };
}

// ============================================================
// GENERATE REPORT
// ============================================================

export function generateReport(
  orders: RawOrder[],
  hppEntries: HppEntry[],
  configs: {
    shopee?: ShopeeConfig;
    tokopedia?: TokopediaConfig;
    lazada?: LazadaConfig;
  }
): RevenueReport {
  const calculatedOrders = orders.map((o) => calculateOrder(o, hppEntries, configs));

  const marketplaceIds = [...new Set(orders.map((o) => o.marketplace))];

  const marketplaces: MarketplaceSummary[] = marketplaceIds.map((mp) => {
    const mpOrders = calculatedOrders.filter((o) => o.marketplace === mp);
    const totalRevenue = mpOrders.reduce((s, o) => s + o.revenue, 0);
    const totalHpp = mpOrders.reduce((s, o) => s + o.hpp, 0);
    const totalGrossProfit = mpOrders.reduce((s, o) => s + o.grossProfit, 0);
    const totalPlatformFees = mpOrders.reduce((s, o) => s + o.fees.totalPlatformFee, 0);
    const totalNetProfit = mpOrders.reduce((s, o) => s + o.netProfit, 0);

    const feeBreakdown = mpOrders.reduce(
      (acc, o) => ({
        commission: acc.commission + o.fees.commissionFee,
        transactionFee: acc.transactionFee + o.fees.transactionFee,
        freeShipping: acc.freeShipping + o.fees.freeShippingFee,
        orderProcessing: acc.orderProcessing + o.fees.orderProcessingFee,
        voucher: acc.voucher + o.fees.voucherBySeller,
        affiliate: acc.affiliate + o.fees.affiliateCommission,
        other: acc.other + o.fees.otherFees,
      }),
      {
        commission: 0,
        transactionFee: 0,
        freeShipping: 0,
        orderProcessing: 0,
        voucher: 0,
        affiliate: 0,
        other: 0,
      }
    );

    return {
      marketplace: mp as MarketplaceId,
      totalOrders: mpOrders.length,
      totalRevenue,
      totalHpp,
      totalGrossProfit,
      totalPlatformFees,
      totalNetProfit,
      avgGrossMargin: totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0,
      avgNetMargin: totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0,
      feeBreakdown,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    marketplaces,
    totalRevenue: marketplaces.reduce((s, m) => s + m.totalRevenue, 0),
    totalHpp: marketplaces.reduce((s, m) => s + m.totalHpp, 0),
    totalGrossProfit: marketplaces.reduce((s, m) => s + m.totalGrossProfit, 0),
    totalPlatformFees: marketplaces.reduce((s, m) => s + m.totalPlatformFees, 0),
    totalNetProfit: marketplaces.reduce((s, m) => s + m.totalNetProfit, 0),
    orders: calculatedOrders,
    hppSnapshot: hppEntries.length > 0 ? [...hppEntries] : undefined,
  };
}
