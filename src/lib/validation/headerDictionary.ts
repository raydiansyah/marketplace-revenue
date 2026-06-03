/**
 * Module: Header Dictionary
 * Purpose: Centralized bilingual (Indonesian/English) column synonyms per marketplace file template
 * Used by: templateDetector.ts, uploadValidator.ts, shopee.ts, productMaster.ts
 * Dependencies: none
 * Public functions: getTemplateSpecs, normalizeHeader, resolveCanonical, findColumnIndex
 * Side effects: none (pure lookup)
 */

export type MarketplaceId = "shopee" | "tokopedia" | "lazada";
export type FileRole =
  | "orders"
  | "income"
  | "return"
  | "cancel"
  | "failed"
  | "productMaster"
  | "ads"
  | "cashflow";

export interface HeaderSynonym {
  canonical: string; // machine-readable key used in parsers
  synonyms: string[]; // all accepted headers (normalized: lowercase, trimmed, non-alphanum removed)
}

export interface TemplateSpec {
  id: string; // e.g. 'shopee:orders'
  marketplace: MarketplaceId;
  role: FileRole;
  must: HeaderSynonym[]; // required — if < requiredMin match, reject
  optional: HeaderSynonym[]; // bonus scoring
  requiredMin: number; // min must-hits to accept template
  discriminator?: string; // canonical key that uniquely identifies this template vs similar ones
}

// ─────────────────────────────────────────────────────────────────────────────
// Template Specs
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATE_SPECS: TemplateSpec[] = [
  // ── Shopee ────────────────────────────────────────────────────────────────
  {
    id: "shopee:orders",
    marketplace: "shopee",
    role: "orders",
    requiredMin: 4,
    must: [
      {
        canonical: "order_id",
        synonyms: ["no pesanan", "order id", "nomor pesanan", "order_id"],
      },
      {
        canonical: "product_name",
        synonyms: ["nama produk", "product name", "nama barang"],
      },
      {
        canonical: "sku",
        synonyms: [
          "nomor referensi sku",
          "sku reference no",
          "seller sku",
          "sku",
          "variasi sku",
          "sku induk",
        ],
      },
      {
        canonical: "qty",
        synonyms: ["jumlah", "quantity", "qty"],
      },
      {
        canonical: "price_after_discount",
        synonyms: [
          "harga setelah diskon",
          "deal price",
          "harga deal",
          "price after discount",
          "harga asli",
          "harga awal",
        ],
      },
      {
        canonical: "status",
        synonyms: ["status pesanan", "order status"],
      },
    ],
    optional: [
      {
        canonical: "tracking_no",
        synonyms: ["no resi", "nomor resi", "tracking number", "no. resi"],
      },
      {
        canonical: "shipping_fee",
        synonyms: [
          "ongkos kirim dibayar oleh pembeli",
          "ongkir dibayar pembeli",
          "shipping fee",
        ],
      },
      {
        canonical: "settlement",
        synonyms: ["total pembayaran", "total payment"],
      },
      {
        canonical: "voucher",
        synonyms: ["voucher ditanggung penjual", "voucher seller"],
      },
      {
        canonical: "commission",
        synonyms: ["biaya komisi", "commission fee"],
      },
      {
        canonical: "affiliate",
        synonyms: ["afiliasi", "affiliate"],
      },
    ],
  },

  {
    id: "shopee:income",
    marketplace: "shopee",
    role: "income",
    requiredMin: 3,
    discriminator: "release_date",
    must: [
      {
        canonical: "order_id",
        synonyms: ["no pesanan", "order id", "nomor pesanan", "no. pesanan"],
      },
      {
        canonical: "release_date",
        synonyms: [
          "tanggal dana dilepaskan",
          "release date",
          "settlement date",
          "waktu release",
          "tanggal release",
        ],
      },
      {
        canonical: "total_income",
        synonyms: [
          "total penghasilan",
          "jumlah pelepasan",
          "total income",
          "seller income",
          "dana yang dilepas",
        ],
      },
    ],
    optional: [
      {
        canonical: "gross_amount",
        synonyms: ["harga asli produk", "buyer payment", "gross amount"],
      },
      {
        canonical: "commission_fee",
        synonyms: ["biaya komisi ams", "biaya komisi", "commission fee"],
      },
    ],
  },

  {
    id: "shopee:cancel",
    marketplace: "shopee",
    role: "cancel",
    requiredMin: 3,
    discriminator: "cancel_reason",
    must: [
      {
        canonical: "order_id",
        synonyms: ["no pesanan", "order id", "nomor pesanan", "no. pesanan"],
      },
      {
        canonical: "cancel_reason",
        synonyms: [
          "alasan pembatalan",
          "cancellation reason",
          "cancel reason",
        ],
      },
      {
        canonical: "cancel_date",
        synonyms: [
          "tanggal dibatalkan",
          "cancellation date",
          "waktu pesanan dibuat",
        ],
      },
    ],
    optional: [
      {
        canonical: "status",
        synonyms: ["status pesanan", "order status"],
      },
    ],
  },

  // ── Tokopedia ─────────────────────────────────────────────────────────────
  {
    id: "tokopedia:orders",
    marketplace: "tokopedia",
    role: "orders",
    requiredMin: 4,
    must: [
      {
        canonical: "order_id",
        synonyms: [
          "order id",
          "tokopedia invoice number",
          "invoice",
          "nomor invoice",
        ],
      },
      {
        canonical: "product_name",
        synonyms: ["nama produk", "product name"],
      },
      {
        canonical: "sku",
        synonyms: [
          "nomor sku",
          "sku",
          "seller sku",
          "sku number",
          "seller_sku",
        ],
      },
      {
        canonical: "qty",
        synonyms: ["jumlah", "quantity", "qty"],
      },
      {
        canonical: "price",
        synonyms: [
          "harga satuan",
          "unit price",
          "harga per item",
          "sku unit original price",
        ],
      },
      {
        canonical: "status",
        synonyms: ["status", "order status", "order substatus"],
      },
    ],
    optional: [
      {
        canonical: "variation",
        synonyms: ["variation", "variasi", "nama variasi"],
      },
      {
        canonical: "return_qty",
        synonyms: [
          "sku quantity of return",
          "qty return",
          "jumlah retur",
        ],
      },
      {
        canonical: "buyer_service_fee",
        synonyms: ["buyer service fee", "handling fee"],
      },
    ],
  },

  {
    id: "tokopedia:income",
    marketplace: "tokopedia",
    role: "income",
    requiredMin: 3,
    discriminator: "type",
    must: [
      {
        canonical: "order_id",
        synonyms: [
          "order adjustment id",
          "order/adjustment id",
          "order id",
          "id order",
        ],
      },
      {
        canonical: "settlement_amount",
        synonyms: [
          "total settlement amount",
          "total jumlah settlement",
          "jumlah settlement",
          "total settlement",
        ],
      },
      {
        canonical: "type",
        synonyms: ["type", "tipe", "jenis"],
      },
    ],
    optional: [
      {
        canonical: "commission_fee",
        synonyms: ["platform commission fee", "commission fee"],
      },
      {
        canonical: "shipping_cost",
        synonyms: ["shipping cost", "biaya pengiriman"],
      },
    ],
  },

  {
    id: "tokopedia:return",
    marketplace: "tokopedia",
    role: "return",
    requiredMin: 3,
    discriminator: "return_qty",
    must: [
      {
        canonical: "order_id",
        synonyms: ["order id", "nomor pesanan"],
      },
      {
        canonical: "return_qty",
        synonyms: [
          "return quantity",
          "jumlah retur",
          "qty retur",
          "sku quantity of return",
        ],
      },
      {
        canonical: "return_reason",
        synonyms: ["return reason", "alasan retur", "cancel reason"],
      },
    ],
    optional: [
      {
        canonical: "return_status",
        synonyms: ["return status", "status retur"],
      },
      {
        canonical: "product_name",
        synonyms: ["product name", "nama produk"],
      },
    ],
  },

  // ── Lazada ────────────────────────────────────────────────────────────────
  {
    id: "lazada:orders",
    marketplace: "lazada",
    role: "orders",
    requiredMin: 4,
    must: [
      {
        canonical: "order_id",
        synonyms: [
          "ordernumber",
          "order number",
          "nomor pesanan",
          "order id",
          "id pesanan baris",
          "item id",
          "orderitemid",
        ],
      },
      {
        canonical: "product_name",
        synonyms: [
          "itemname",
          "item name",
          "nama produk",
          "nama barang",
        ],
      },
      {
        canonical: "sku",
        synonyms: [
          "sellersku",
          "seller sku",
          "sku penjual",
          "sku",
        ],
      },
      {
        canonical: "paid_price",
        synonyms: [
          "paidprice",
          "paid price",
          "harga dibayar",
          "unit price",
          "unitprice",
          "harga satuan",
        ],
      },
      {
        canonical: "status",
        synonyms: ["status", "order status", "status pesanan"],
      },
    ],
    optional: [
      {
        canonical: "tracking",
        synonyms: ["trackingcode", "tracking code", "no resi", "cdtrackingcode"],
      },
      {
        canonical: "admin_fee",
        synonyms: ["walletcredit", "wallet credit", "admin fee"],
      },
      {
        canonical: "settlement",
        synonyms: ["refundamount", "refund amount", "settlement"],
      },
    ],
  },

  {
    id: "lazada:income",
    marketplace: "lazada",
    role: "income",
    requiredMin: 3,
    must: [
      {
        canonical: "order_id",
        synonyms: [
          "nomor pesanan",
          "order number",
          "order id",
          "id pesanan",
          "nomor order",
        ],
      },
      {
        canonical: "settlement_amount",
        synonyms: [
          "jumlah yang diterima",
          "amount received",
          "net amount",
          "total settlement",
          "total keseluruhan",
          "jumlah termasuk pajak",
          "amount",
          "jumlah",
        ],
      },
      {
        canonical: "transaction_date",
        synonyms: [
          "tanggal transaksi",
          "transaction date",
          "tanggal dilepas",
          "release date",
          "date",
        ],
      },
    ],
    optional: [
      {
        canonical: "fee_name",
        synonyms: ["nama biaya", "fee name", "jenis biaya"],
      },
      {
        canonical: "sku",
        synonyms: ["sku penjual", "seller sku", "lazada sku"],
      },
    ],
  },

  // ── Product Master ────────────────────────────────────────────────────────
  {
    id: "productMaster:hpp",
    marketplace: "shopee", // doesn't matter — productMaster is cross-marketplace
    role: "productMaster",
    requiredMin: 2,
    must: [
      {
        canonical: "product_name",
        synonyms: [
          "master product name",
          "nama produk master",
          "product name",
          "nama produk",
        ],
      },
      {
        canonical: "cost",
        synonyms: [
          "hpp new",
          "hpp baru",
          "hpp",
          "cost",
          "harga pokok",
          "hpp lama",
          "hpp old",
        ],
      },
    ],
    optional: [
      {
        canonical: "sku",
        synonyms: ["sku", "master sku", "nomor sku", "seller sku"],
      },
      {
        canonical: "variant_name",
        synonyms: ["varian name", "variant name", "nama varian", "variant"],
      },
      {
        canonical: "master_sku",
        synonyms: ["master sku", "parent sku", "sku master"],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a raw header string for comparison.
 * Lowercases, trims, strips non-alphanumeric (except spaces), collapses spaces.
 */
export function normalizeHeader(h: string): string {
  return String(h ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if rawHeader matches any synonym in the HeaderSynonym group.
 * Uses exact then substring matching in both directions.
 */
export function resolveCanonical(rawHeader: string, group: HeaderSynonym): boolean {
  const norm = normalizeHeader(rawHeader);
  return group.synonyms.some(
    (s) => norm === s || norm.includes(s) || s.includes(norm)
  );
}

/**
 * Find the index of a canonical key in a headers array, using all template synonyms.
 * Returns -1 if not found.
 */
export function findColumnIndex(
  headers: string[],
  canonical: string,
  specs: TemplateSpec[] = TEMPLATE_SPECS
): number {
  // Collect all synonym groups across all specs for this canonical key
  const groups: HeaderSynonym[] = [];
  for (const spec of specs) {
    for (const h of [...spec.must, ...spec.optional]) {
      if (h.canonical === canonical) groups.push(h);
    }
  }
  if (groups.length === 0) return -1;

  const normHeaders = headers.map(normalizeHeader);

  // 1) Exact match against any synonym
  for (let i = 0; i < normHeaders.length; i++) {
    const norm = normHeaders[i];
    for (const group of groups) {
      if (group.synonyms.some((s) => norm === s)) return i;
    }
  }

  // 2) Substring match
  for (let i = 0; i < normHeaders.length; i++) {
    const norm = normHeaders[i];
    for (const group of groups) {
      if (group.synonyms.some((s) => norm.includes(s) || s.includes(norm))) return i;
    }
  }

  return -1;
}

/**
 * Returns the full list of template specs (read-only copy).
 */
export function getTemplateSpecs(): readonly TemplateSpec[] {
  return TEMPLATE_SPECS;
}
