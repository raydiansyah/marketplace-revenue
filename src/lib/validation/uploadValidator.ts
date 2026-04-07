import * as XLSX from "xlsx";
import Papa from "papaparse";
import type { MarketplaceId } from "@/lib/types";

export type UploadFileRole =
  | "orders"
  | "canceled-orders"
  | "failed-delivery"
  | "income";

type ValidationResult =
  | { ok: true }
  | { ok: false; message: string };

interface ValidateUploadFileInput {
  marketplace: MarketplaceId;
  role: UploadFileRole;
  fileName: string;
  content: string | ArrayBuffer;
}

interface SheetTemplate {
  names: string[];
  headers?: string[];
  optional?: boolean;
}

interface FileTemplate {
  allowCsv: boolean;
  sheets: SheetTemplate[];
}

const SHOPEE_ORDER_HEADERS = [
  "No. Pesanan",
  "Status Pesanan",
  "Shipped by Advance Fulfilment",
  "Status Pembatalan/ Pengembalian",
  "No. Resi",
  "Opsi Pengiriman",
  "Antar ke counter/ pick-up",
  "Pesanan Harus Dikirimkan Sebelum (Menghindari keterlambatan)",
  "Waktu Pengiriman Diatur",
  "Waktu Pesanan Dibuat",
  "Waktu Pembayaran Dilakukan",
  "Metode Pembayaran",
  "SKU Induk",
  "Nama Produk",
  "Nomor Referensi SKU",
  "Nama Variasi",
  "Harga Awal",
  "Harga Setelah Diskon",
  "Jumlah",
  "Returned quantity",
  "Total Harga Produk",
  "Total Diskon",
  "Diskon Dari Penjual",
  "Diskon Dari Shopee",
  "Berat Produk",
  "Jumlah Produk di Pesan",
  "Total Berat",
  "Voucher Ditanggung Penjual",
  "Cashback Koin",
  "Voucher Ditanggung Shopee",
  "Paket Diskon",
  "Paket Diskon (Diskon dari Shopee)",
  "Paket Diskon (Diskon dari Penjual)",
  "Potongan Koin Shopee",
  "Diskon Kartu Kredit",
  "Ongkos Kirim Dibayar oleh Pembeli",
  "Estimasi Potongan Biaya Pengiriman",
  "Ongkos Kirim Pengembalian Barang",
  "Total Pembayaran",
  "Perkiraan Ongkos Kirim",
  "Catatan dari Pembeli",
  "Catatan",
  "Username (Pembeli)",
  "Nama Penerima",
  "No. Telepon",
  "Alamat Pengiriman",
  "Kota/Kabupaten",
  "Provinsi",
  "Waktu Pesanan Selesai",
];

const SHOPEE_CANCEL_HEADERS = [
  "No. Pesanan",
  "Status Pesanan",
  "Alasan Pembatalan",
  "Status Pembatalan/ Pengembalian",
  "No. Resi",
  "Opsi Pengiriman",
  "Antar ke counter/ pick-up",
  "Pesanan Harus Dikirimkan Sebelum (Menghindari keterlambatan)",
  "Waktu Pengiriman Diatur",
  "Waktu Pesanan Dibuat",
  "Waktu Pembayaran Dilakukan",
  "Metode Pembayaran",
  "SKU Induk",
  "Nama Produk",
  "Nomor Referensi SKU",
  "Nama Variasi",
  "Harga Awal",
  "Harga Setelah Diskon",
  "Jumlah",
  "Returned quantity",
  "Dibayar Pembeli",
  "Total Diskon",
  "Diskon Dari Penjual",
  "Diskon Dari Shopee",
  "Berat Produk",
  "Jumlah Produk di Pesan",
  "Total Berat",
  "Voucher Ditanggung Penjual",
  "Cashback Koin",
  "Voucher Ditanggung Shopee",
  "Paket Diskon",
  "Paket Diskon (Diskon dari Shopee)",
  "Paket Diskon (Diskon dari Penjual)",
  "Potongan Koin Shopee",
  "Diskon Kartu Kredit",
  "Ongkos Kirim Dibayar oleh Pembeli",
  "Estimasi Potongan Biaya Pengiriman",
  "Ongkos Kirim Pengembalian Barang",
  "Total Pembayaran",
  "Perkiraan Ongkos Kirim",
  "Catatan dari Pembeli",
  "Catatan",
  "Username (Pembeli)",
  "Nama Penerima",
  "No. Telepon",
  "Alamat Pengiriman",
  "Kota/Kabupaten",
  "Provinsi",
  "Waktu Pesanan Selesai",
];

const SHOPEE_FAILED_DELIVERY_HEADERS = [
  "No. Pesanan",
  "Status Pesanan",
  "Status Pembatalan/ Pengembalian",
  "Status pengiriman gagal",
  "No. Resi",
  "Opsi Pengiriman",
  "Antar ke counter/ pick-up",
  "Pesanan Harus Dikirimkan Sebelum (Menghindari keterlambatan)",
  "Waktu Pengiriman Diatur",
  "Waktu Pesanan Dibuat",
  "Waktu Pembayaran Dilakukan",
  "Metode Pembayaran",
  "SKU Induk",
  "Nama Produk",
  "Nomor Referensi SKU",
  "Nama Variasi",
  "Harga Awal",
  "Harga Setelah Diskon",
  "Jumlah",
  "Returned quantity",
  "Dibayar Pembeli",
  "Total Diskon",
  "Diskon Dari Penjual",
  "Diskon Dari Shopee",
  "Berat Produk",
  "Jumlah Produk di Pesan",
  "Total Berat",
  "Voucher Ditanggung Penjual",
  "Cashback Koin",
  "Voucher Ditanggung Shopee",
  "Paket Diskon",
  "Paket Diskon (Diskon dari Shopee)",
  "Paket Diskon (Diskon dari Penjual)",
  "Potongan Koin Shopee",
  "Diskon Kartu Kredit",
  "Ongkos Kirim Dibayar oleh Pembeli",
  "Estimasi Potongan Biaya Pengiriman",
  "Ongkos Kirim Pengembalian Barang",
  "Total Pembayaran",
  "Perkiraan Ongkos Kirim",
  "Catatan dari Pembeli",
  "Catatan",
  "Username (Pembeli)",
  "Nama Penerima",
  "No. Telepon",
  "Alamat Pengiriman",
  "Kota/Kabupaten",
  "Provinsi",
  "Waktu Pesanan Selesai",
];

const SHOPEE_INCOME_HEADERS = [
  "No.",
  "No. Pesanan",
  "No. Pengajuan",
  "Username (Pembeli)",
  "Waktu Pesanan Dibuat",
  "Metode pembayaran pembeli",
  "Tanggal Dana Dilepaskan",
  "Harga Asli Produk",
  "Total Diskon Produk",
  "Jumlah Pengembalian Dana ke Pembeli",
  "Diskon Produk dari Shopee",
  "Voucher disponsor oleh Penjual",
  "Cashback Koin disponsori Penjual",
  "Ongkir Dibayar Pembeli",
  "Diskon Ongkir Ditanggung Jasa Kirim",
  "Gratis Ongkir dari Shopee",
  "Ongkir yang Diteruskan oleh Shopee ke Jasa Kirim",
  "Ongkos Kirim Pengembalian Barang",
  "Kembali ke Biaya Pengiriman Pengirim",
  "Pengembalian Biaya Kirim",
  "Biaya Komisi AMS",
  "Biaya Administrasi",
  "Biaya Layanan",
  "Biaya Proses Pesanan",
  "Premi",
  "Biaya Program Hemat Biaya Kirim",
  "Biaya Transaksi",
  "Biaya Kampanye",
  "Bea Masuk, PPN & PPh",
  "Total Penghasilan",
  "Kode Voucher",
  "Kompensasi",
  "Promo Gratis Ongkir dari Penjual",
  "Jasa Kirim",
  "Nama Kurir",
  "Pengembalian Dana ke Pembeli",
  "Pro-rata Koin yang Ditukarkan untuk Pengembalian Barang",
  "Pro-rata Voucher Shopee untuk Pengembalian Barang",
  "Pro-rated Bank Payment Channel Promotion  for return refund Items",
  "Pro-rated Shopee Payment Channel Promotion  for return refund Items",
];

const SHOPEE_SERVICE_FEE_HEADERS = [
  "No.",
  "No. Pesanan",
  "Biaya Layanan Gratis Ongkir XTRA",
];

const SHOPEE_ADJUSTMENT_HEADERS = [
  "No.",
  "Tanggal Penyesuaian Dibuat",
  "Tipe Penyesuaian | Deskripsi",
  "Alasan Penyesuaian",
  "Biaya Penyesuaian",
  "No. Pesanan Terhubung",
  "Tanggal Dana Dilepaskan",
];

const SHOPEE_ORDER_PROCESSING_FEE_HEADERS = [
  "No.",
  "View By",
  "No. Pesanan",
  "ID Produk",
  "Nama Produk",
  "Biaya Proses Pesanan",
  "Biaya Proses Pesanan per Produk (Prorata harga produk tiap pesanan)",
];

const TIKTOK_ORDER_HEADERS = [
  "Order ID",
  "Order Status",
  "Order Substatus",
  "Cancelation/Return Type",
  "Normal or Pre-order",
  "SKU ID",
  "Seller SKU",
  "Product Name",
  "Variation",
  "Quantity",
  "Sku Quantity of return",
  "SKU Unit Original Price",
  "SKU Subtotal Before Discount",
  "SKU Platform Discount",
  "SKU Seller Discount",
  "SKU Subtotal After Discount",
  "Shipping Fee After Discount",
  "Original Shipping Fee",
  "Shipping Fee Seller Discount",
  "Shipping Fee Platform Discount",
  "Distance Shipping Fee",
  "Distance Fee",
  "Order Refund Amount",
  "Payment platform discount",
  "Buyer Service Fee",
  "Handling Fee",
  "Shipping Insurance",
  "Item Insurance",
  "Order Amount",
  "Created Time",
  "Paid Time",
  "RTS Time",
  "Shipped Time",
  "Delivered Time",
  "Cancelled Time",
  "Cancel By",
  "Cancel Reason",
  "Fulfillment Type",
  "Warehouse Name",
  "Tracking ID",
  "Delivery Option",
  "Shipping Provider Name",
  "Buyer Message",
  "Buyer Username",
  "Recipient",
  "Phone #",
  "Zipcode",
  "Country",
  "Province",
  "Regency and City",
  "Districts",
  "Villages",
  "Detail Address",
  "Additional address information",
  "Payment Method",
  "Weight(kg)",
  "Product Category",
  "Package ID",
  "Purchase Channel",
  "Seller Note",
  "Checked Status",
  "Checked Marked by",
  "Tokopedia Invoice Number",
];

const TIKTOK_INCOME_ORDER_DETAIL_HEADERS = [
  "Order/adjustment ID",
  "Type",
  "Order created time",
  "Order settled time",
  "Currency",
  "Total settlement amount",
  "Total Revenue",
  "Subtotal after seller discounts",
  "Subtotal before discounts",
  "Seller discounts",
  "Distance item fee from Horizon+ Program",
  "Refund subtotal after seller discounts",
  "Refund subtotal before seller discounts",
  "Refund of seller discounts",
  "Total Fees",
  "Platform commission fee",
  "Pre-order service fee",
  "Mall service fee",
  "Payment Fee",
  "Shipping cost",
  "Shipping costs passed on to the logistics provider",
  "Replacement shipping fee (passed on to the customer)",
  "Exchange shipping fee (passed on to the customer)",
  "Shipping cost borne by the platform",
  "Shipping cost paid by the customer",
  "Refunded shipping cost paid by the customer",
  "Return shipping costs (passed on to the customer)",
  "Shipping cost subsidy",
  "Distance shipping fee from Horizon+ Program",
  "Affiliate Commission",
  "Affiliate partner commission",
  "Affiliate Shop Ads commission",
  "Affiliate Partner shop ads commission",
  "Shipping Fee Program service fee",
  "Dynamic commission",
  "Bonus cashback service fee",
  "LIVE Specials service fee",
  "Voucher Xtra service fee",
  "Order processing fee",
  "EAMS Program service fee",
  "Brands Crazy Deals/Flash Sale service fee",
  "Dilayani Tokopedia fee",
  "Dilayani Tokopedia handling fee",
  "PayLater program fee",
  "Campaign resource fee",
  "Installation service fee",
  "Article 22 Income Tax withheld",
  "Platform special service fee",
  "GMV Max ad fee",
  "GMV Max Coupon",
  "Ajustment amount",
  "Related order ID",
  "Customer payment",
  "Customer refund",
  "Seller co-funded voucher discount",
  "Refund of seller co-funded voucher discount",
  "Platform discounts",
  "Refund of platform discounts",
  "Platform co-funded voucher discounts",
  "Refund of platform co-funded voucher discounts",
  "Seller shipping cost discount",
  "Estimated package weight (g)",
  "Actual package weight (g)",
  "Shopping center items",
  "Order Source",
];

const TIKTOK_WITHDRAWAL_HEADERS = [
  "Type",
  "Reference ID",
  "Request time",
  "Amount",
  "Status",
  "Success time",
  "Bank account",
];

const LAZADA_INCOME_HEADERS = [
  "Periode Laporan",
  "Nomor Laporan",
  "Tanggal Transaksi",
  "Nama Biaya",
  "Jumlah (Termasuk Pajak)",
  "VAT Amount",
  "Status Pelepasan Dana",
  "Tanggal Dilepas",
  "Komentar",
  "Tanggal Pesanan Dibuat",
  "Nomor Pesanan",
  "ID Pesanan",
  "SKU Penjual",
  "Lazada SKU",
  "WHT Amount",
  "WHT termasuk dalam jumlah",
  "Status Pesanan",
  "Nama Produk",
  "Short Code",
];

const LAZADA_ORDER_HEADERS = [
  "orderItemId",
  "orderType",
  "Guarantee",
  "deliveryType",
  "lazadaId",
  "sellerSku",
  "lazadaSku",
  "wareHouse",
  "createTime",
  "updateTime",
  "rtsSla",
  "ttsSla",
  "orderNumber",
  "invoiceRequired",
  "invoiceNumber",
  "deliveredDate",
  "customerName",
  "customerEmail",
  "nationalRegistrationNumber",
  "shippingName",
  "shippingAddress",
  "shippingAddress2",
  "shippingAddress3",
  "shippingAddress4",
  "shippingAddress5",
  "shippingPhone",
  "shippingPhone2",
  "shippingCity",
  "shippingPostCode",
  "shippingCountry",
  "shippingRegion",
  "billingName",
  "billingAddr",
  "billingAddr2",
  "billingAddr3",
  "billingAddr4",
  "billingAddr5",
  "billingPhone",
  "billingPhone2",
  "billingCity",
  "billingPostCode",
  "billingCountry",
  "taxCode",
  "branchNumber",
  "taxInvoiceRequested",
  "payMethod",
  "paidPrice",
  "unitPrice",
  "sellerDiscountTotal",
  "shippingFee",
  "walletCredit",
  "itemName",
  "variation",
  "cdShippingProvider",
  "shippingProvider",
  "shipmentTypeName",
  "shippingProviderType",
  "cdTrackingCode",
  "trackingCode",
  "trackingUrl",
  "shippingProviderFM",
  "trackingCodeFM",
  "trackingUrlFM",
  "promisedShippingTime",
  "premium",
  "status",
  "buyerFailedDeliveryReturnInitiator",
  "buyerFailedDeliveryReason",
  "buyerFailedDeliveryDetail",
  "buyerFailedDeliveryUserName",
  "bundleId",
  "semiManaged",
  "flexibleDeliveryTime",
  "bundleDiscount",
  "refundAmount",
  "sellerNote",
];

const TEMPLATE_MAP: Record<
  MarketplaceId,
  Partial<Record<UploadFileRole, FileTemplate>>
> = {
  shopee: {
    orders: {
      allowCsv: true,
      sheets: [{ names: ["orders"], headers: SHOPEE_ORDER_HEADERS }],
    },
    "canceled-orders": {
      allowCsv: true,
      sheets: [{ names: ["orders"], headers: SHOPEE_CANCEL_HEADERS }],
    },
    "failed-delivery": {
      allowCsv: true,
      sheets: [{ names: ["orders"], headers: SHOPEE_FAILED_DELIVERY_HEADERS }],
    },
    income: {
      allowCsv: false,
      sheets: [
        { names: ["summary"] },
        { names: ["income"], headers: SHOPEE_INCOME_HEADERS },
        { names: ["service fee details"], headers: SHOPEE_SERVICE_FEE_HEADERS, optional: true },
        { names: ["adjustment"], headers: SHOPEE_ADJUSTMENT_HEADERS, optional: true },
        { names: ["order processing fee"], headers: SHOPEE_ORDER_PROCESSING_FEE_HEADERS },
      ],
    },
  },
  tokopedia: {
    orders: {
      allowCsv: true,
      sheets: [{ names: ["orderskulist"], headers: TIKTOK_ORDER_HEADERS }],
    },
    "canceled-orders": {
      allowCsv: true,
      sheets: [{ names: ["orderskulist"], headers: TIKTOK_ORDER_HEADERS }],
    },
    income: {
      allowCsv: false,
      sheets: [
        { names: ["order details"], headers: TIKTOK_INCOME_ORDER_DETAIL_HEADERS },
        { names: ["reports"] },
        { names: ["withdrawal records", "withdrawal report"], headers: TIKTOK_WITHDRAWAL_HEADERS },
        { names: ["fees explanation"] },
      ],
    },
  },
  lazada: {
    orders: {
      allowCsv: true,
      sheets: [{ names: ["sheet1"], headers: LAZADA_ORDER_HEADERS }],
    },
    "canceled-orders": {
      allowCsv: true,
      sheets: [{ names: ["sheet1"], headers: LAZADA_ORDER_HEADERS }],
    },
    income: {
      allowCsv: true,
      sheets: [{ names: ["income overview"], headers: LAZADA_INCOME_HEADERS }],
    },
  },
};

function normalizeText(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRowHeaders(row: unknown[]): string[] {
  return (row ?? [])
    .map((cell) => String(cell ?? "").trim())
    .filter((cell) => cell !== "");
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function buildHeaderMismatchMessage(
  expectedHeaders: string[],
  foundHeaders: string[],
  sheetName: string
): string {
  const expectedNorm = expectedHeaders.map(normalizeText);
  const foundNorm = foundHeaders.map(normalizeText);
  const max = Math.max(expectedNorm.length, foundNorm.length);

  let mismatchAt = -1;
  for (let i = 0; i < max; i++) {
    if ((expectedNorm[i] ?? "") !== (foundNorm[i] ?? "")) {
      mismatchAt = i;
      break;
    }
  }

  if (mismatchAt >= 0) {
    const pos = mismatchAt + 1;
    const expected = expectedHeaders[mismatchAt] ?? "(tidak ada)";
    const found = foundHeaders[mismatchAt] ?? "(kosong)";
    return `Header sheet "${sheetName}" tidak sesuai di kolom ke-${pos}. Diharapkan "${expected}", ditemukan "${found}".`;
  }

  return `Header sheet "${sheetName}" tidak sesuai template.`;
}

function findHeaderRow(
  rows: unknown[][],
  expectedHeaders: string[]
): { exact?: string[]; best?: string[] } {
  const expectedNorm = expectedHeaders.map(normalizeText);
  let bestCandidate: string[] | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < Math.min(rows.length, 200); i++) {
    const candidate = normalizeRowHeaders(rows[i] ?? []);
    const nonEmpty = candidate.filter((cell) => cell !== "");
    if (nonEmpty.length < 3) continue;

    const candidateNorm = candidate.map(normalizeText);
    if (arraysEqual(candidateNorm, expectedNorm)) {
      return { exact: candidate };
    }

    const minLength = Math.min(candidateNorm.length, expectedNorm.length);
    let positionalMatches = 0;
    for (let col = 0; col < minLength; col++) {
      if (candidateNorm[col] === expectedNorm[col]) positionalMatches++;
    }
    const score = positionalMatches * 10 - Math.abs(candidateNorm.length - expectedNorm.length);

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  return { best: bestCandidate };
}

function validateSheetHeaders(
  sheetName: string,
  rows: unknown[][],
  expectedHeaders: string[]
): ValidationResult {
  const found = findHeaderRow(rows, expectedHeaders);
  if (found.exact) return { ok: true };

  if (found.best) {
    return {
      ok: false,
      message: buildHeaderMismatchMessage(expectedHeaders, found.best, sheetName),
    };
  }

  return {
    ok: false,
    message: `Header sheet "${sheetName}" tidak ditemukan. Pastikan urutan kolom sesuai template.`,
  };
}

function matchesSheetName(actualName: string, acceptedNames: string[]): boolean {
  const normalized = normalizeText(actualName);
  return acceptedNames.some((name) => normalizeText(name) === normalized);
}

function sheetToRawRowsAllCells(sheet: XLSX.WorkSheet): unknown[][] {
  const cellAddresses = Object.keys(sheet).filter((key) => /^[A-Z]+\d+$/i.test(key));
  if (cellAddresses.length === 0) return [];

  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = Number.NEGATIVE_INFINITY;
  let minCol = Number.POSITIVE_INFINITY;
  let maxCol = Number.NEGATIVE_INFINITY;

  for (const address of cellAddresses) {
    const cell = XLSX.utils.decode_cell(address);
    if (cell.r < minRow) minRow = cell.r;
    if (cell.r > maxRow) maxRow = cell.r;
    if (cell.c < minCol) minCol = cell.c;
    if (cell.c > maxCol) maxCol = cell.c;
  }

  const rawRows: unknown[][] = [];
  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex++) {
    const row: string[] = [];
    for (let colIndex = minCol; colIndex <= maxCol; colIndex++) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      const cell = sheet[address] as XLSX.CellObject | undefined;
      row.push(String(cell?.w ?? cell?.v ?? ""));
    }
    rawRows.push(row);
  }

  return rawRows;
}

function validateWorkbook(
  template: FileTemplate,
  workbookBuffer: ArrayBuffer
): ValidationResult {
  const wb = XLSX.read(workbookBuffer, { type: "array", cellText: true, cellDates: true });
  const sheetNames = wb.SheetNames ?? [];

  const hasOptionalSheet = template.sheets.some((sheet) => sheet.optional);

  if (hasOptionalSheet) {
    const requiredSheets = template.sheets.filter((sheet) => !sheet.optional);

    if (sheetNames.length < requiredSheets.length) {
      return {
        ok: false,
        message: `Jumlah sheet kurang. Minimal ${requiredSheets.length} sheet wajib (${requiredSheets
          .map((s) => s.names[0])
          .join(" → ")}), ditemukan ${sheetNames.length} sheet (${sheetNames.join(" → ")}).`,
      };
    }

    for (const expectedSheet of template.sheets) {
      const actualName = sheetNames.find((name) => matchesSheetName(name, expectedSheet.names));

      if (!actualName) {
        if (expectedSheet.optional) continue;
        return {
          ok: false,
          message: `Sheet wajib "${expectedSheet.names[0]}" tidak ditemukan. Sheet tersedia: ${sheetNames.join(" → ")}.`,
        };
      }

      if (!expectedSheet.headers) continue;

      const sheet = wb.Sheets[actualName];
      if (!sheet) {
        return { ok: false, message: `Sheet "${actualName}" tidak dapat dibaca.` };
      }

      const rows = sheetToRawRowsAllCells(sheet);
      const headersValid = validateSheetHeaders(actualName, rows, expectedSheet.headers);
      if (!headersValid.ok) return headersValid;
    }

    return { ok: true };
  }

  if (sheetNames.length !== template.sheets.length) {
    return {
      ok: false,
      message: `Jumlah sheet tidak sesuai. Diharapkan ${template.sheets.length} sheet (${template.sheets
        .map((s) => s.names[0])
        .join(" → ")}), ditemukan ${sheetNames.length} sheet (${sheetNames.join(" → ")}).`,
    };
  }

  for (let i = 0; i < template.sheets.length; i++) {
    const expectedSheet = template.sheets[i];
    const actualName = sheetNames[i] ?? "";

    if (!matchesSheetName(actualName, expectedSheet.names)) {
      return {
        ok: false,
        message: `Urutan sheet tidak sesuai di posisi ke-${i + 1}. Diharapkan "${expectedSheet.names[0]}", ditemukan "${actualName || "(kosong)"}".`,
      };
    }

    if (!expectedSheet.headers) continue;

    const sheet = wb.Sheets[actualName];
    if (!sheet) {
      return { ok: false, message: `Sheet "${actualName}" tidak dapat dibaca.` };
    }

    const rows = sheetToRawRowsAllCells(sheet);
    const headersValid = validateSheetHeaders(actualName, rows, expectedSheet.headers);
    if (!headersValid.ok) return headersValid;
  }

  return { ok: true };
}

function validateCsv(template: FileTemplate, csvContent: string): ValidationResult {
  if (!template.allowCsv) {
    return {
      ok: false,
      message: "Format CSV tidak didukung untuk jenis file ini. Gunakan file Excel (.xlsx) agar urutan sheet bisa divalidasi.",
    };
  }

  if (template.sheets.length !== 1) {
    return {
      ok: false,
      message: "CSV tidak didukung untuk file dengan banyak sheet. Gunakan file Excel (.xlsx).",
    };
  }

  const expectedHeaders = template.sheets[0].headers;
  if (!expectedHeaders) return { ok: true };

  const parsed = Papa.parse<string[]>(csvContent, {
    header: false,
    skipEmptyLines: true,
  });
  const rows = (parsed.data ?? []) as unknown[][];
  return validateSheetHeaders("CSV", rows, expectedHeaders);
}

export function validateUploadFile(
  input: ValidateUploadFileInput
): ValidationResult {
  const template = TEMPLATE_MAP[input.marketplace][input.role];
  if (!template) {
    return {
      ok: false,
      message: `Template validasi belum tersedia untuk ${input.marketplace} (${input.role}).`,
    };
  }

  if (input.content instanceof ArrayBuffer) {
    return validateWorkbook(template, input.content);
  }

  return validateCsv(template, input.content);
}

export function validateUploadFileOrThrow(input: ValidateUploadFileInput): void {
  const result = validateUploadFile(input);
  if (!result.ok) {
    throw new Error(`[${input.fileName}] ${result.message}`);
  }
}
