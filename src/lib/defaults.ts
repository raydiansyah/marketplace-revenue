import type {
  ShopeeConfig,
  TokopediaConfig,
  LazadaConfig,
} from "./types";

export const DEFAULT_SHOPEE_CONFIG: ShopeeConfig = {
  commissionRate: 0.05,
  transactionFee: 0.0218,
  freeShippingXtra: false,
  freeShippingRate: 0.04,
  coinsCashback: false,
  coinsCashbackRate: 0.03,
  promoXtra: false,
  promoXtraRate: 0.014,
  orderProcessingFee: 1250,
  affiliateRate: 0,
};

export const DEFAULT_TOKOPEDIA_CONFIG: TokopediaConfig = {
  commissionRate: 0.05,
  dynamicCommissionRate: 0.05,
  dynamicCommissionMax: 40000,
  orderProcessingFee: 1250,
  isMall: false,
  mallServiceFeeRate: 0.018,
  mallServiceFeeMax: 50000,
  affiliateRate: 0,
};

export const DEFAULT_LAZADA_CONFIG: LazadaConfig = {
  adminFee: 0.0182,
  commissionRate: 0.05,
  freeShippingMax: false,
  freeShippingMaxRate: 0.04,
  paymentProcessingRate: 0.02,
  affiliateRate: 0,
  isLazMall: false,
};
