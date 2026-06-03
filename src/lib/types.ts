// ============================================================
// MARKETPLACE TYPES
// ============================================================

export type MarketplaceId = "shopee" | "tokopedia" | "lazada";

export const MARKETPLACE_LABELS: Record<MarketplaceId, string> = {
  shopee: "Shopee",
  tokopedia: "Tokopedia / TikTok",
  lazada: "Lazada",
};

export const MARKETPLACE_COLORS: Record<MarketplaceId, string> = {
  shopee: "#EE4D2D",
  tokopedia: "#00AA5B",
  lazada: "#0F146D",
};

// ============================================================
// ORDER DATA
// ============================================================

export interface RawOrder {
  orderId: string;
  orderDate: string;
  productName: string;
  sku: string;
  qty: number;
  /** Harga jual ke pembeli (sebelum diskon) */
  sellingPrice: number;
  /** Harga setelah diskon platform & voucher pembeli */
  actualPrice: number;
  /** Total yang diterima seller dari platform (sudah dipotong biaya) */
  settlementAmount?: number;
  /** Biaya admin/komisi yang tertera di laporan marketplace */
  reportedCommission?: number;
  /** Ongkos kirim yang ditanggung seller */
  shippingFeeByseller?: number;
  /** Subsidi ongkir dari platform yang dipotong ke seller */
  shippingSubsidy?: number;
  /** Potongan voucher yang ditanggung seller */
  voucherBySeller?: number;
  /** Potongan voucher dari platform (tidak potong seller) */
  voucherByPlatform?: number;
  /** Komisi affiliate */
  affiliateCommission?: number;
  status: string;
  marketplace: MarketplaceId;
  /** Data tambahan mentah dari file */
  rawData?: Record<string, string>;
}

// ============================================================
// HPP (HARGA POKOK PENJUALAN)
// ============================================================

export interface HppEntry {
  sku: string;
  productName: string;
  /** Nama master product dari file product master */
  masterProductName?: string;
  /** Master SKU dari file product master */
  masterSku?: string;
  /** HPP per unit */
  cost: number;
}

// ============================================================
// FEE CONFIGURATION
// ============================================================

export interface ShopeeConfig {
  /** Commission rate (desimal, misal 0.05 = 5%) */
  commissionRate: number;
  /** Transaction fee: default 2.18% = 0.0218 */
  transactionFee: number;
  /** Aktifkan Free Shipping XTRA */
  freeShippingXtra: boolean;
  /** Free Shipping XTRA rate: 4-4.5% */
  freeShippingRate: number;
  /** Aktifkan Coins Cashback */
  coinsCashback: boolean;
  coinsCashbackRate: number;
  /** Aktifkan Promo XTRA */
  promoXtra: boolean;
  promoXtraRate: number;
  /** Order processing fee per order (Rp) */
  orderProcessingFee: number;
  /** Komisi affiliate (%) */
  affiliateRate: number;
}

export interface TokopediaConfig {
  /** Platform commission rate */
  commissionRate: number;
  /** Dynamic commission rate (4-6%) */
  dynamicCommissionRate: number;
  /** Dynamic commission max per item (Rp) */
  dynamicCommissionMax: number;
  /** Order processing fee (Rp) */
  orderProcessingFee: number;
  /** Apakah seller Mall? */
  isMall: boolean;
  /** Mall service fee: 1.8% */
  mallServiceFeeRate: number;
  /** Max mall service fee (Rp) */
  mallServiceFeeMax: number;
  /** Komisi affiliate (%) */
  affiliateRate: number;
}

export interface LazadaConfig {
  /** Administrative fee: 1.82% */
  adminFee: number;
  /** Commission rate */
  commissionRate: number;
  /** Free Shipping Max program */
  freeShippingMax: boolean;
  freeShippingMaxRate: number;
  /** Payment processing: ~2% */
  paymentProcessingRate: number;
  /** Komisi affiliate */
  affiliateRate: number;
  /** LazMall seller */
  isLazMall: boolean;
}

export type MarketplaceConfig =
  | { marketplace: "shopee"; config: ShopeeConfig }
  | { marketplace: "tokopedia"; config: TokopediaConfig }
  | { marketplace: "lazada"; config: LazadaConfig };

// ============================================================
// CALCULATED ORDER
// ============================================================

export interface OrderFeeBreakdown {
  commissionFee: number;
  transactionFee: number;
  freeShippingFee: number;
  orderProcessingFee: number;
  voucherBySeller: number;
  affiliateCommission: number;
  otherFees: number;
  totalPlatformFee: number;
}

export interface CalculatedOrder extends RawOrder {
  hpp: number;
  fees: OrderFeeBreakdown;
  /** Revenue = actualPrice * qty (qty setelah return dikurangi) */
  revenue: number;
  /** Gross profit = revenue - hpp */
  grossProfit: number;
  /** Net profit = gross profit - platform fees */
  netProfit: number;
  grossMargin: number;
  netMargin: number;
  /**
   * Jumlah unit yang dikembalikan (return/refund).
   * Diisi hanya jika ada data return (dari file return terpisah atau embedded qty di file pesanan).
   */
  returnQty?: number;
  /**
   * Estimasi revenue yang hilang akibat return (returnQty × actualPrice per unit).
   * Berguna untuk analisa dampak retur ke omzet.
   */
  returnRevenue?: number;
  /**
   * HPP yang "keluar sia-sia" akibat barang sudah dikirim tapi dikembalikan.
   * = lookupHpp(sku) × returnQty
   * Ini adalah biaya riil yang ditanggung seller untuk unit yang di-return.
   */
  returnHpp?: number;
  /** Optional breakdown line per SKU untuk order multi-SKU */
  lineItems?: Array<{
    sku: string;
    productName: string;
    qty: number;
    revenue: number;
    hpp: number;
    platformFee: number;
    grossProfit: number;
    netProfit: number;
    grossMargin: number;
    netMargin: number;
  }>;
}

// ============================================================
// REVENUE REPORT
// ============================================================

export interface MarketplaceSummary {
  marketplace: MarketplaceId;
  totalOrders: number;
  totalRevenue: number;
  totalHpp: number;
  totalGrossProfit: number;
  totalPlatformFees: number;
  totalNetProfit: number;
  avgGrossMargin: number;
  avgNetMargin: number;
  feeBreakdown: {
    commission: number;
    transactionFee: number;
    freeShipping: number;
    orderProcessing: number;
    voucher: number;
    affiliate: number;
    other: number;
  };
}

export interface RevenueReport {
  generatedAt: string;
  period?: { from: string; to: string };
  marketplaces: MarketplaceSummary[];
  totalRevenue: number;
  totalHpp: number;
  totalGrossProfit: number;
  totalPlatformFees: number;
  totalNetProfit: number;
  orders: CalculatedOrder[];
  /** Snapshot HPP entries yang digunakan saat report di-generate (audit trail). */
  hppSnapshot?: HppEntry[];
  /** ID toko (stores table) yang menghasilkan report ini. */
  storeId?: string;
  /** Periode bulan laporan — diisi saat report berasal dari monthly_uploads. */
  reportPeriod?: { year: number; month: number };
}

export interface SavedStoreReport {
  id: string;
  storeName: string;
  marketplace: MarketplaceId;
  label: string;
  createdAt: string;
  report: RevenueReport;
  /** FK ke stores.id — diisi untuk report yang berasal dari monthly_uploads. */
  storeId?: string;
  /** Tahun periode laporan. */
  periodYear?: number;
  /** Bulan periode laporan (1-12). */
  periodMonth?: number;
}

// ============================================================
// INCOME TRANSACTION (Transaksi Pendapatan)
// ============================================================

/**
 * Satu baris dari file "Transaksi Pendapatan" marketplace.
 * Berisi settlement aktual yang diterima seller per order.
 */
export interface IncomeTransaction {
  orderId: string;
  releaseDate: string;
  /** Total yang diterima seller setelah semua potongan */
  settlementAmount: number;
  /** Biaya komisi/admin dari platform */
  commissionFee: number;
  /** Biaya layanan/service fee */
  serviceFee: number;
  /** Subsidi ongkir yang dibebankan ke seller */
  shippingFee: number;
  /** Potongan voucher yang ditanggung seller */
  voucherBySeller: number;
  /** Potongan lain-lain */
  otherFees: number;
  /** Total potongan platform */
  totalDeductions: number;
  /** Gross amount sebelum potongan */
  grossAmount: number;
  rawData?: Record<string, string>;
}

// ============================================================
// UPLOAD STATE
// ============================================================

export interface OrderFile {
  fileName: string;
  rawOrders: RawOrder[];
  uploadedAt: string;
  /** Label bulan untuk UI, misal "Februari 2025" */
  label?: string;
}

export interface IncomeFile {
  fileName: string;
  transactions: IncomeTransaction[];
  uploadedAt: string;
  /** Label bulan untuk UI, misal "Maret 2025" */
  label?: string;
}

export interface ReturnOrderTransaction {
  returnOrderId: string;
  orderId: string;
  skuId: string;
  sellerSku: string;
  productName: string;
  skuName: string;
  returnType: string;
  timeRequested: string;
  returnReason: string;
  returnUnitPrice: number;
  returnQuantity: number;
  returnStatus: string;
  returnSubStatus: string;
  refundTime: string;
  compensationAmount: number;
  buyerNote: string;
  rawData?: Record<string, string>;
}

export interface ReturnOrderFile {
  fileName: string;
  transactions: ReturnOrderTransaction[];
  uploadedAt: string;
  /** Label bulan untuk UI, misal "Maret 2025" */
  label?: string;
}

/**
 * Set upload per marketplace:
 * - orderFiles: 1-2 file Pesanan Selesai (bulan sebelumnya + bulan ini)
 * - incomeFile: 1 file Transaksi Pendapatan (bulan yang dihitung)
 * - returnOrderFile: 1 file Pesanan Retur (opsional, TikTok/Tokopedia)
 * - canceledOrderFile: 1 file Pesanan Cancel (opsional)
 * - failedDeliveryFile: 1 file Pesanan Failed Delivery (khusus Shopee, opsional)
 */
export interface MarketplaceUploadSet {
  marketplace: MarketplaceId;
  /** Pesanan Selesai — bisa 2 file (bulan prev + bulan ini) */
  orderFiles: OrderFile[];
  /** Transaksi Pendapatan — 1 file bulan yang dihitung */
  incomeFile: IncomeFile | null;
  /** Pesanan Retur — opsional (khusus TikTok/Tokopedia) */
  returnOrderFile: ReturnOrderFile | null;
  /** Pesanan Cancel — opsional */
  canceledOrderFile: OrderFile | null;
  /** Pesanan Failed Delivery — khusus Shopee, opsional */
  failedDeliveryFile: OrderFile | null;
}

/** @deprecated Gunakan MarketplaceUploadSet */
export interface UploadedFile {
  marketplace: MarketplaceId;
  fileName: string;
  rawOrders: RawOrder[];
  uploadedAt: string;
}

// ============================================================
// APP STORE STATE
// ============================================================

export interface AppState {
  uploadSets: Partial<Record<MarketplaceId, MarketplaceUploadSet>>;
  hppEntries: HppEntry[];
  configs: Partial<Record<MarketplaceId, MarketplaceConfig["config"]>>;
  report: RevenueReport | null;
}

// ============================================================
// STORES & MONTHLY UPLOADS (multi-toko)
// ============================================================

export type FileType =
  | "order"
  | "income"
  | "return"
  | "cancel"
  | "failed"
  | "ads"
  | "cashflow";

export interface StoreSummary {
  id: string;
  userId: string;
  marketplace: MarketplaceId;
  storeName: string;
  externalShopId?: string;
  isActive: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Metadata-only row dari monthly_uploads (tanpa parsedJson). */
export interface MonthlyUploadRecord {
  id: string;
  userId: string;
  storeId: string;
  marketplace: MarketplaceId;
  periodYear: number;
  periodMonth: number;
  fileType: FileType;
  fileName: string;
  rawRowCount: number;
  checksumSha256: string;
  uploadedAt: Date;
}

/** Full row dari monthly_uploads termasuk parsedJson. */
export interface MonthlyUploadDetail extends MonthlyUploadRecord {
  parsedJson: unknown[];
}

/** Shape untuk INSERT ke monthly_uploads. */
export interface MonthlyUploadInsert extends MonthlyUploadRecord {
  parsedJson: unknown[];
}

// ============================================================
// HPP MARKETPLACE
// ============================================================

export interface HppMarketplaceEntry {
  id: string;
  userId: string;
  marketplace: MarketplaceId;
  sku: string;
  productName: string;
  masterSku?: string;
  masterProductName?: string;
  cost: number;
  sourceFileName?: string;
  uploadedAt: string; // ISO string
}

export interface HppConflict {
  sku: string;
  entries: Array<{
    id: string;
    marketplace: MarketplaceId;
    cost: number;
    productName: string;
    uploadedAt: string;
  }>;
}

// ============================================================
// ADS & CASHFLOW
// ============================================================

export interface AdsEntry {
  id: string;
  storeId: string;
  marketplace: MarketplaceId;
  periodYear: number;
  periodMonth: number;
  campaignName: string;
  sku?: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  sourceFileName?: string;
  createdAt: string;
}

export interface AdsSummary {
  totalSpend: number;
  totalRevenue: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  roas: number;
  cpa: number;
}

export type CashflowCategory = "income" | "expense";

export interface CashflowEntry {
  id: string;
  storeId: string;
  periodYear: number;
  periodMonth: number;
  category: CashflowCategory;
  subCategory: string;
  amount: number;
  description: string;
  txnDate: string; // YYYY-MM-DD
  sourceFileName?: string;
  createdAt: string;
}

export interface CashflowSummary {
  totalIncome: number;
  totalExpense: number;
  netCashflow: number;
}

// ============================================================
// AI PROVIDERS
// ============================================================

export type AiProvider = "anthropic" | "openai";
export type AiInsightKind = "revenue" | "ads-roas" | "fee-anomaly" | "hpp-margin";

export interface AiProviderInfo {
  id: string;
  provider: AiProvider;
  label: string;
  baseUrl?: string;
  defaultModel?: string;
  isActive: boolean;
  lastTestAt?: string;
  createdByUserId?: string;
  createdAt: string;
}

export interface AiInsightResult {
  markdown: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
}

// ============================================================
// AI AGENT PERSONAS
// ============================================================

export interface AiAgentPersona {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  tone: "formal" | "casual" | "expert" | "friendly";
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// RAG DOCUMENTS
// ============================================================

export interface RagDocument {
  id: string;
  title: string;
  fileName: string;
  charCount: number;
  chunkCount: number;
  uploadedAt: string;
}
