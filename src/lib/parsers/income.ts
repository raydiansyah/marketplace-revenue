/**
 * Parser untuk file "Transaksi Pendapatan" dari masing-masing marketplace.
 * File ini berisi settlement aktual yang diterima seller, termasuk breakdown biaya.
 */

import type { IncomeTransaction, MarketplaceId } from "../types";
import {
  readFileToRows,
  readWorkbookSheetsRawRows,
  readWorkbookSheetsRawRowsViaTsv,
  readWorkbookSheetsToRows,
} from "./xlsxUtils";

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function findColumn(row: Record<string, string>, candidates: string[]): string {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ");

  const normalizedCandidates = candidates.map(normalize);

  for (const key of Object.keys(row)) {
    const keyLower = normalize(key);
    if (normalizedCandidates.some((c) => keyLower.includes(c))) {
      return row[key] ?? "";
    }
  }
  return "";
}

function parseAmount(val: string | number): number {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const raw = String(val)
    .replace(/\(([^)]+)\)/, "-$1")
    .replace(/\s+/g, "")
    .replace(/[Rp]/gi, "");

  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  let normalized = raw;

  if (comma >= 0 && dot >= 0) {
    if (comma > dot) {
      normalized = raw.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = raw.replace(/,/g, "");
    }
  } else if (comma >= 0) {
    normalized = /,\d{1,2}$/.test(raw) ? raw.replace(",", ".") : raw.replace(/,/g, "");
  } else if (dot >= 0) {
    normalized = /\.\d{1,2}$/.test(raw) ? raw : raw.replace(/\./g, "");
  }

  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}


function sumAbsColumns(row: Record<string, string>, candidates: string[]): number {
  return candidates.reduce((sum, candidate) => {
    const value = parseAmount(findColumn(row, [candidate]));
    return sum + Math.abs(value);
  }, 0);
}

function sumFeeColumns(row: Record<string, string>, candidates: string[]): number {
  let positive = 0;
  let negativeAbs = 0;

  for (const candidate of candidates) {
    const value = parseAmount(findColumn(row, [candidate]));
    if (value > 0) positive += value;
    if (value < 0) negativeAbs += Math.abs(value);
  }

  if (positive > 0 && negativeAbs === 0) return positive;
  if (negativeAbs > 0 && positive === 0) return negativeAbs;
  return Math.max(0, negativeAbs - positive);
}

function parseShopeeIncomeWorkbook(content: ArrayBuffer): IncomeTransaction[] {
  const sheets = readWorkbookSheetsToRows(content);
  if (sheets.length === 0) return [];

  const incomeSheets = sheets.filter((sheet) => {
    const name = normalizeText(sheet.sheetName);
    return (
      (name.includes("income") || name.includes("pendapatan") || name.includes("transaksi")) &&
      !name.includes("service fee") &&
      !name.includes("order processing")
    );
  });
  const serviceFeeSheets = sheets.filter((sheet) => normalizeText(sheet.sheetName).includes("service fee"));
  const processingFeeSheets = sheets.filter((sheet) => normalizeText(sheet.sheetName).includes("order processing"));

  const baseTransactions = parseShopeeIncomeRows(incomeSheets.flatMap((sheet) => sheet.rows));
  const transactionMap = new Map<string, IncomeTransaction>(
    baseTransactions.map((transaction) => [transaction.orderId, transaction])
  );

  const serviceFeeMap = new Map<
    string,
    { commissionFee: number; serviceFee: number; shippingFee: number; voucherBySeller: number; otherFees: number; releaseDate: string }
  >();

  for (const row of serviceFeeSheets.flatMap((sheet) => sheet.rows)) {
    const orderId = findColumn(row, ["no. pesanan", "order id", "nomor pesanan", "no pesanan"]);
    if (!orderId) continue;

    const releaseDate = findColumn(row, ["waktu release", "release time", "tanggal release", "release date"]);
    const amount = sumAbsColumns(row, [
      "biaya layanan gratis ongkir xtra",
      "service fee",
      "biaya layanan",
    ]);
    if (amount === 0) continue;

    const fees = serviceFeeMap.get(orderId) ?? {
      commissionFee: 0,
      serviceFee: 0,
      shippingFee: 0,
      voucherBySeller: 0,
      otherFees: 0,
      releaseDate: "",
    };

    fees.serviceFee += amount;

    if (!fees.releaseDate && releaseDate) fees.releaseDate = releaseDate;
    serviceFeeMap.set(orderId, fees);
  }

  const processingFeeMap = new Map<string, number>();
  for (const row of processingFeeSheets.flatMap((sheet) => sheet.rows)) {
    const orderId = findColumn(row, ["no. pesanan", "order id", "nomor pesanan", "no pesanan"]);
    if (!orderId) continue;
    const amount = sumAbsColumns(row, [
      "biaya proses pesanan",
      "order processing fee",
      "processing fee",
    ]);
    if (amount === 0) continue;
    processingFeeMap.set(orderId, (processingFeeMap.get(orderId) ?? 0) + amount);
  }

  const orderIds = new Set<string>([
    ...transactionMap.keys(),
    ...serviceFeeMap.keys(),
    ...processingFeeMap.keys(),
  ]);

  const merged: IncomeTransaction[] = [];
  for (const orderId of orderIds) {
    const base = transactionMap.get(orderId);
    const service = serviceFeeMap.get(orderId);
    const processingFee = processingFeeMap.get(orderId) ?? 0;

    const commissionFee = (base?.commissionFee ?? 0) + (service?.commissionFee ?? 0);
    const serviceFee = (base?.serviceFee ?? 0) + (service?.serviceFee ?? 0) + processingFee;
    const shippingFee = (base?.shippingFee ?? 0) + (service?.shippingFee ?? 0);
    const voucherBySeller = (base?.voucherBySeller ?? 0) + (service?.voucherBySeller ?? 0);
    const otherFees = (base?.otherFees ?? 0) + (service?.otherFees ?? 0);
    const totalDeductions = commissionFee + serviceFee + shippingFee + voucherBySeller + otherFees;
    const grossAmount = base?.grossAmount ?? 0;
    const settlementAmount = base?.settlementAmount ?? Math.max(0, grossAmount - totalDeductions);

    merged.push({
      orderId,
      releaseDate: base?.releaseDate || service?.releaseDate || "",
      settlementAmount,
      commissionFee,
      serviceFee,
      shippingFee,
      voucherBySeller,
      otherFees,
      totalDeductions,
      grossAmount,
      rawData: base?.rawData,
    });
  }

  return merged;
}


// ──────────────────────────────────────────────────────────────
// SHOPEE — "Transaksi Pendapatan" / "Income Transactions"
// Kolom khas: No. Pesanan, Waktu Release, Jumlah Pelepasan, Biaya Komisi, dll.
// ──────────────────────────────────────────────────────────────

function parseShopeeIncomeRows(rows: Record<string, string>[]): IncomeTransaction[] {
  return rows
    .map((row): IncomeTransaction | null => {
      const orderId = findColumn(row, ["no. pesanan", "order id", "nomor pesanan", "no pesanan"]);
      if (!orderId) return null;

      const releaseDate = findColumn(row, [
        "tanggal dana dilepaskan",
        "waktu release",
        "release time",
        "tanggal release",
        "release date",
      ]);

      const grossAmount = parseAmount(
        findColumn(row, [
          "harga asli produk",
          "harga asli pesanan",
          "buyer payment",
          "gross amount",
          "subtotal",
        ])
      );

      const settlementAmount = parseAmount(
        findColumn(row, [
          "total penghasilan",
          "jumlah pelepasan",
          "seller settlement",
          "settlement amount",
          "estimated income",
          "dana yang dilepas",
        ])
      );

      const commissionFee = sumAbsColumns(row, [
        "biaya komisi ams",
        "biaya komisi",
        "commission fee",
        "biaya administrasi",
        "biaya transaksi",
      ]);

      const serviceFee = sumAbsColumns(row, [
        "biaya layanan",
        "biaya proses pesanan",
        "order processing fee",
        "service fee",
      ]);

      const shippingFee = sumAbsColumns(row, [
        "biaya program hemat biaya kirim",
        "ongkos kirim pengembalian barang",
        "kembali ke biaya pengiriman pengirim",
        "pengembalian biaya kirim",
        "shipping fee",
      ]);

      const voucherBySeller = sumAbsColumns(row, [
        "voucher disponsor oleh penjual",
        "voucher co fund disponsor oleh penjual",
        "cashback koin disponsori penjual",
        "cashback koin co fund disponsori penjual",
        "seller voucher",
      ]);

      const otherFees = sumAbsColumns(row, [
        "biaya kampanye",
        "bea masuk ppn pph",
        "biaya isi saldo otomatis dari penghasilan",
        "premi",
        "kompensasi",
        "other fee",
        "adjustment",
      ]);

      const totalDeductions = commissionFee + serviceFee + shippingFee + voucherBySeller + otherFees;

      return {
        orderId,
        releaseDate,
        settlementAmount,
        commissionFee,
        serviceFee,
        shippingFee,
        voucherBySeller,
        otherFees,
        totalDeductions,
        grossAmount,
        rawData: row,
      };
    })
    .filter((t): t is IncomeTransaction => t !== null);
}

// Parser khusus untuk format pendapatan Tokopedia/TikTok.
function parseUnifiedMarketplaceIncomeRows(rows: Record<string, string>[]): IncomeTransaction[] {
  return rows
    .map((row): IncomeTransaction | null => {
      const orderId = findColumn(row, [
        "order adjustment id",
        "order/adjustment id",
        "order id",
        "no. pesanan",
        "invoice",
      ]);
      if (!orderId) return null;

      const type = normalizeText(findColumn(row, ["type"]));
      if (type.includes("withdraw") || type.includes("top up") || type.includes("balance")) {
        return null;
      }

      const releaseDate = findColumn(row, [
        "order settled time",
        "settled time",
        "settlement time",
        "order completed time",
      ]);

      const grossAmount = parseAmount(findColumn(row, [
        "total revenue",
        "subtotal after seller discounts",
        "subtotal before discounts",
      ]));

      const settlementAmount = parseAmount(
        findColumn(row, ["total settlement amount", "seller income", "settlement amount", "net amount"])
      );

      const commissionFee = sumAbsColumns(row, [
        "platform commission fee",
        "pre order service fee",
        "mall service fee",
        "dynamic commission",
      ]);

      const serviceFee = sumAbsColumns(row, [
        "payment fee",
        "order processing fee",
        "shipping fee program service fee",
        "bonus cashback service fee",
        "live specials service fee",
        "voucher xtra service fee",
        "eams program service fee",
        "brands crazy deals flash sale service fee",
        "dilayani tokopedia fee",
        "dilayani tokopedia handling fee",
        "paylater program fee",
        "campaign resource fee",
        "installation service fee",
        "platform special service fee",
      ]);

      const shippingDebit =
        sumAbsColumns(row, [
          "shipping cost",
          "shipping costs passed on to the logistics provider",
          "replacement shipping fee passed on to the customer",
          "exchange shipping fee passed on to the customer",
          "distance shipping fee from horizon program",
          "distance item fee from horizon program",
        ]);
      const shippingCredit =
        sumAbsColumns(row, [
          "shipping cost borne by the platform",
          "shipping cost paid by the customer",
          "refunded shipping cost paid by the customer",
          "return shipping costs passed on to the customer",
          "shipping cost subsidy",
        ]);
      const shippingFee = Math.max(0, shippingDebit - shippingCredit);

      const sellerDiscount = sumAbsColumns(row, ["seller discounts"]);
      const sellerDiscountRefund = sumAbsColumns(row, ["refund of seller discounts"]);
      const voucherBySeller = Math.max(0, sellerDiscount - sellerDiscountRefund);

      let otherFees = sumAbsColumns(row, [
        "affiliate commission",
        "affiliate partner commission",
        "affiliate shop ads commission",
        "affiliate partner shop ads commission",
        "article 22 income tax withheld",
        "gmv max ad fee",
      ]);

      const totalFees = Math.abs(parseAmount(findColumn(row, ["total fees"])));
      let totalDeductions = commissionFee + serviceFee + shippingFee + voucherBySeller + otherFees;

      // Khusus TikTok/Tokopedia: jadikan "Total Fees" sebagai sumber kebenaran utama.
      if (totalFees > 0) {
        const delta = totalFees - totalDeductions;
        otherFees = Math.max(0, otherFees + delta);
        totalDeductions = commissionFee + serviceFee + shippingFee + voucherBySeller + otherFees;
      }

      const finalSettlementAmount =
        settlementAmount !== 0
          ? settlementAmount
          : Math.max(0, grossAmount - totalDeductions);

      if (grossAmount === 0 && finalSettlementAmount === 0 && totalDeductions === 0) {
        return null;
      }

      return {
        orderId,
        releaseDate,
        settlementAmount: finalSettlementAmount,
        commissionFee,
        serviceFee,
        shippingFee,
        voucherBySeller,
        otherFees,
        totalDeductions,
        grossAmount,
        rawData: row,
      };
    })
    .filter((t): t is IncomeTransaction => t !== null);
}

// ──────────────────────────────────────────────────────────────
// TOKOPEDIA — "Laporan Transaksi" / "Daftar Transaksi"
// Kolom khas: No. Invoice, Tanggal, Total Pendapatan, Biaya Layanan, dll.
// ──────────────────────────────────────────────────────────────

function parseTokopediaIncomeRows(rows: Record<string, string>[]): IncomeTransaction[] {
  const normalized = rows
    .map((row): IncomeTransaction | null => {
      const orderId = findColumn(row, [
        "order adjustment id",
        "order/adjustment id",
        "order id",
        "no invoice",
        "invoice",
      ]);
      if (!orderId) return null;

      const type = normalizeText(findColumn(row, ["type"]));
      if (type && !type.includes("order") && !type.includes("adjustment")) {
        return null;
      }

      const releaseDate = findColumn(row, [
        "order settled time",
        "settled time",
        "settlement time",
        "order completed time",
      ]);

      const grossAmount = parseAmount(
        findColumn(row, [
          "total revenue",
          "subtotal after seller discounts",
          "subtotal before discounts",
        ])
      );

      const settlementAmount = parseAmount(
        findColumn(row, ["total settlement amount", "seller income", "settlement amount", "net amount"])
      );

      const commissionFee = sumAbsColumns(row, [
        "platform commission fee",
        "pre order service fee",
        "mall service fee",
        "dynamic commission",
      ]);

      const serviceFee = sumAbsColumns(row, [
        "payment fee",
        "shipping fee program service fee",
        "bonus cashback service fee",
        "live specials service fee",
        "voucher xtra service fee",
        "order processing fee",
        "eams program service fee",
        "brands crazy deals flash sale service fee",
        "dilayani tokopedia fee",
        "dilayani tokopedia handling fee",
        "paylater program fee",
        "campaign resource fee",
        "installation service fee",
        "platform special service fee",
      ]);

      const shippingRaw = sumAbsColumns(row, [
        "shipping cost",
        "shipping costs passed on to the logistics provider",
        "replacement shipping fee passed on to the customer",
        "exchange shipping fee passed on to the customer",
        "shipping cost borne by the platform",
        "shipping cost paid by the customer",
        "refunded shipping cost paid by the customer",
        "return shipping costs passed on to the customer",
        "shipping cost subsidy",
        "distance shipping fee from horizon program",
        "distance item fee from horizon program",
      ]);

      const voucherBySeller = sumAbsColumns(row, [
        "seller discounts",
        "refund of seller discounts",
      ]);

      let otherFees = sumAbsColumns(row, [
        "affiliate commission",
        "affiliate partner commission",
        "affiliate shop ads commission",
        "affiliate partner shop ads commission",
        "article 22 income tax withheld",
        "gmv max ad fee",
      ]);

      const totalFees = Math.abs(parseAmount(findColumn(row, ["total fees"])));
      const known = commissionFee + serviceFee + shippingRaw + voucherBySeller + otherFees;

      let totalDeductions = known;
      if (totalFees > 0) {
        const diff = totalFees - known;
        if (diff > 0) otherFees += diff;
        totalDeductions = totalFees;
      }

      const shippingFee = Math.max(0, totalDeductions - (commissionFee + serviceFee + voucherBySeller + otherFees));
      const finalSettlement = settlementAmount !== 0 ? settlementAmount : Math.max(0, grossAmount - totalDeductions);

      if (grossAmount === 0 && finalSettlement === 0 && totalDeductions === 0) return null;

      return {
        orderId,
        releaseDate,
        settlementAmount: finalSettlement,
        commissionFee,
        serviceFee,
        shippingFee,
        voucherBySeller,
        otherFees,
        totalDeductions,
        grossAmount,
        rawData: row,
      };
    })
    .filter((t): t is IncomeTransaction => t !== null);

  const byOrder = new Map<string, IncomeTransaction>();
  for (const tx of normalized) {
    const key = String(tx.orderId ?? "").trim();
    if (!key) continue;
    const existing = byOrder.get(key);
    if (!existing) {
      byOrder.set(key, { ...tx });
      continue;
    }

    existing.releaseDate = existing.releaseDate || tx.releaseDate;
    existing.settlementAmount += tx.settlementAmount;
    existing.commissionFee += tx.commissionFee;
    existing.serviceFee += tx.serviceFee;
    existing.shippingFee += tx.shippingFee;
    existing.voucherBySeller += tx.voucherBySeller;
    existing.otherFees += tx.otherFees;
    existing.totalDeductions += tx.totalDeductions;
    existing.grossAmount += tx.grossAmount;
  }

  return [...byOrder.values()];
}

// ──────────────────────────────────────────────────────────────
// LAZADA — "Finance Statement" / "Transaction Report"
// ──────────────────────────────────────────────────────────────

function parseLazadaIncomeRows(rows: Record<string, string>[]): IncomeTransaction[] {
  const aggregated = rows
    .map((row): IncomeTransaction | null => {
      const orderId = findColumn(row, [
        "nomor pesanan",
        "order number",
        "order id",
        "id pesanan",
      ]);
      if (!orderId) return null;

      const releaseDate = findColumn(row, ["tanggal dilepas", "release date", "tanggal transaksi"]);
      const feeName = normalizeText(findColumn(row, ["nama biaya", "fee name", "ringkasan", "summary"]));
      const amount = parseAmount(findColumn(row, ["jumlah termasuk pajak", "amount", "jumlah"]));

      const paidAmount = parseAmount(
        findColumn(row, ["jumlah yang dibayar", "amount paid", "paid amount", "omset penjualan"])
      );
      const receivedAmount = parseAmount(
        findColumn(row, ["jumlah yang diterima", "amount received", "total keseluruhan", "total settlement"])
      );

      if (!feeName && amount === 0 && paidAmount === 0 && receivedAmount === 0) {
        return null;
      }

      const transactionDate = findColumn(row, ["tanggal transaksi", "transaction date"]);

      const base: IncomeTransaction = {
        orderId,
        releaseDate: releaseDate || transactionDate,
        settlementAmount: 0,
        commissionFee: 0,
        serviceFee: 0,
        shippingFee: 0,
        voucherBySeller: 0,
        otherFees: 0,
        totalDeductions: 0,
        grossAmount: 0,
        rawData: row,
      };

      const absAmount = Math.abs(amount);
      if (feeName.includes("total settlement") || feeName.includes("settlement") || feeName.includes("pelepasan dana") || feeName.includes("total keseluruhan")) {
        base.settlementAmount = amount;
      } else if (feeName.includes("item price") || feeName.includes("paid price") || feeName.includes("order amount") || feeName.includes("gross") || feeName.includes("omset penjualan")) {
        base.grossAmount = amount;
      } else if (feeName.includes("commission") || feeName.includes("komisi")) {
        base.commissionFee = absAmount;
      } else if (
        feeName.includes("service") ||
        feeName.includes("fee") ||
        feeName.includes("handling") ||
        feeName.includes("insurance")
      ) {
        base.serviceFee = absAmount;
      } else if (feeName.includes("shipping") || feeName.includes("delivery") || feeName.includes("ongkir")) {
        base.shippingFee = absAmount;
      } else if (feeName.includes("voucher") || feeName.includes("discount") || feeName.includes("diskon")) {
        base.voucherBySeller = absAmount;
      } else {
        if (receivedAmount > 0 || paidAmount > 0) {
          // "Jumlah yang Dibayar" bisa termasuk ongkir dari pembeli, jadi bukan basis revenue produk.
          // Prioritaskan settlement, dan biarkan gross fallback ke file pesanan (harga item) bila tidak ada "Omset Penjualan".
          if (receivedAmount > 0) base.settlementAmount = receivedAmount;
          if (base.grossAmount <= 0 && receivedAmount <= 0 && paidAmount > 0) {
            base.grossAmount = paidAmount;
          }
          if (base.grossAmount > 0 && base.settlementAmount > 0 && base.grossAmount >= base.settlementAmount) {
            base.otherFees = Math.max(base.otherFees, base.grossAmount - base.settlementAmount);
          }
        } else if (amount >= 0) {
          base.grossAmount = amount;
        } else {
          base.otherFees = absAmount;
        }
      }

      base.totalDeductions =
        base.commissionFee + base.serviceFee + base.shippingFee + base.voucherBySeller + base.otherFees;

      return base;
    })
    .filter((t): t is IncomeTransaction => t !== null)
    .reduce((acc, tx) => {
      const existing = acc.get(tx.orderId);
      if (!existing) {
        acc.set(tx.orderId, tx);
        return acc;
      }

      existing.releaseDate = existing.releaseDate || tx.releaseDate;
      existing.settlementAmount += tx.settlementAmount;
      existing.commissionFee += tx.commissionFee;
      existing.serviceFee += tx.serviceFee;
      existing.shippingFee += tx.shippingFee;
      existing.voucherBySeller += tx.voucherBySeller;
      existing.otherFees += tx.otherFees;
      existing.grossAmount += tx.grossAmount;
      existing.totalDeductions =
        existing.commissionFee +
        existing.serviceFee +
        existing.shippingFee +
        existing.voucherBySeller +
        existing.otherFees;

      return acc;
    }, new Map<string, IncomeTransaction>());

  return [...aggregated.values()];
}

function buildRowsFromRaw(rawRows: unknown[][], headerIndex: number): Record<string, string>[] {
  const headers = (rawRows[headerIndex] ?? []).map((header) => String(header ?? "").trim());
  const result: Record<string, string>[] = [];

  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i] ?? [];
    const hasContent = row.some((cell) => String(cell ?? "").trim() !== "");
    if (!hasContent) continue;

    const obj: Record<string, string> = {};
    for (let col = 0; col < headers.length; col++) {
      const key = headers[col];
      if (!key) continue;
      const finalKey = obj[key] !== undefined ? `${key}_${col}` : key;
      obj[finalKey] = String(row[col] ?? "").trim();
    }
    result.push(obj);
  }

  return result;
}

function findHeaderColumnIndex(headers: string[], candidates: string[]): number {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ");

  const normalizedCandidates = candidates.map(normalize);
  const compactCandidates = normalizedCandidates.map((value) => value.replace(/\s+/g, ""));
  for (let i = 0; i < headers.length; i++) {
    const current = normalize(headers[i] ?? "");
    const compactCurrent = current.replace(/\s+/g, "");
    if (!current) continue;
    if (
      normalizedCandidates.some((candidate) => current.includes(candidate)) ||
      compactCandidates.some((candidate) => compactCurrent.includes(candidate))
    ) {
      return i;
    }
  }
  return -1;
}

function parseLazadaRowsByHeaderMap(rawRows: unknown[][], headerIndex: number): IncomeTransaction[] {
  const headers = (rawRows[headerIndex] ?? []).map((h) => String(h ?? ""));

  // Expanded column candidates for Lazada income reports
  const orderNoIndex = findHeaderColumnIndex(headers, [
    "nomor pesanan",
    "order number",
    "order id",
    "nomor order",
    "order no",
    "no pesanan",
    "id pesanan",
    "id pesanan baris",
    "order item id",
  ]);
  const orderIdIndex = findHeaderColumnIndex(headers, [
    "id pesanan",
    "order id",
    "order number id",
  ]);
  const feeNameIndex = findHeaderColumnIndex(headers, [
    "nama biaya",
    "fee name",
    "jenis biaya",
    "type",
    "keterangan",
    "description",
  ]);
  const amountIndex = findHeaderColumnIndex(headers, [
    "jumlah termasuk pajak",
    "amount",
    "jumlah",
    "total amount",
    "nilai",
    "total",
    "jumlah biaya",
  ]);
  const paidAmountIndex = findHeaderColumnIndex(headers, [
    "jumlah yang dibayar",
    "amount paid",
    "omset penjualan",
  ]);
  const receivedAmountIndex = findHeaderColumnIndex(headers, [
    "jumlah yang diterima",
    "amount received",
    "total keseluruhan",
    "total settlement",
  ]);
  const releaseDateIndex = findHeaderColumnIndex(headers, [
    "tanggal dilepas",
    "release date",
    "tanggal release",
    "release time",
  ]);
  const txDateIndex = findHeaderColumnIndex(headers, [
    "tanggal transaksi",
    "transaction date",
    "tanggal",
    "waktu transaksi",
    "date",
    "waktu",
  ]);

  // More lenient check: support both "fee rows" and "paid/received summary" formats
  const hasFeeFormat = feeNameIndex >= 0 && amountIndex >= 0;
  const hasPaymentSummaryFormat = paidAmountIndex >= 0 || receivedAmountIndex >= 0;
  if (!hasFeeFormat && !hasPaymentSummaryFormat) {
    return [];
  }

  const aggregated = new Map<string, IncomeTransaction>();

  for (let r = headerIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r] ?? [];
    const orderId = String(
      (orderNoIndex >= 0 ? row[orderNoIndex] : "") ||
      (orderIdIndex >= 0 ? row[orderIdIndex] : "") ||
      ""
    ).trim();
    if (!orderId) continue;

    const feeName = feeNameIndex >= 0 ? normalizeText(String(row[feeNameIndex] ?? "")) : "";
    const amount = amountIndex >= 0 ? parseAmount(String(row[amountIndex] ?? "")) : 0;
    const paidAmount = paidAmountIndex >= 0 ? parseAmount(String(row[paidAmountIndex] ?? "")) : 0;
    const receivedAmount = receivedAmountIndex >= 0 ? parseAmount(String(row[receivedAmountIndex] ?? "")) : 0;
    if (!feeName && amount === 0 && paidAmount === 0 && receivedAmount === 0) continue;

    const releaseDate = String(
      (releaseDateIndex >= 0 ? row[releaseDateIndex] : "") ||
      (txDateIndex >= 0 ? row[txDateIndex] : "") ||
      ""
    ).trim();

    const tx: IncomeTransaction = {
      orderId,
      releaseDate,
      settlementAmount: 0,
      commissionFee: 0,
      serviceFee: 0,
      shippingFee: 0,
      voucherBySeller: 0,
      otherFees: 0,
      totalDeductions: 0,
      grossAmount: 0,
    };

    const absAmount = Math.abs(amount);
    if (feeName.includes("total settlement") || feeName.includes("settlement") || feeName.includes("pelepasan dana") || feeName.includes("total keseluruhan")) {
      tx.settlementAmount = amount;
    } else if (feeName.includes("item price") || feeName.includes("paid price") || feeName.includes("order amount") || feeName.includes("gross") || feeName.includes("omset penjualan")) {
      tx.grossAmount = amount;
    } else if (feeName.includes("commission") || feeName.includes("komisi")) {
      tx.commissionFee = absAmount;
    } else if (feeName.includes("shipping") || feeName.includes("delivery") || feeName.includes("ongkir")) {
      tx.shippingFee = absAmount;
    } else if (feeName.includes("voucher") || feeName.includes("discount") || feeName.includes("diskon")) {
      tx.voucherBySeller = absAmount;
    } else if (feeName.includes("fee") || feeName.includes("service") || feeName.includes("handling") || feeName.includes("insurance")) {
      tx.serviceFee = absAmount;
    } else {
      if (receivedAmount > 0 || paidAmount > 0) {
        if (receivedAmount > 0) tx.settlementAmount = receivedAmount;
        if (tx.grossAmount <= 0 && receivedAmount <= 0 && paidAmount > 0) {
          tx.grossAmount = paidAmount;
        }
        if (tx.grossAmount > 0 && tx.settlementAmount > 0 && tx.grossAmount >= tx.settlementAmount) {
          tx.otherFees = Math.max(tx.otherFees, tx.grossAmount - tx.settlementAmount);
        }
      } else if (amount >= 0) tx.grossAmount = amount;
      else tx.otherFees = absAmount;
    }

    tx.totalDeductions = tx.commissionFee + tx.serviceFee + tx.shippingFee + tx.voucherBySeller + tx.otherFees;

    const existing = aggregated.get(orderId);
    if (!existing) {
      aggregated.set(orderId, tx);
      continue;
    }

    existing.releaseDate = existing.releaseDate || tx.releaseDate;
    existing.settlementAmount += tx.settlementAmount;
    existing.commissionFee += tx.commissionFee;
    existing.serviceFee += tx.serviceFee;
    existing.shippingFee += tx.shippingFee;
    existing.voucherBySeller += tx.voucherBySeller;
    existing.otherFees += tx.otherFees;
    existing.grossAmount += tx.grossAmount;
    existing.totalDeductions =
      existing.commissionFee + existing.serviceFee + existing.shippingFee + existing.voucherBySeller + existing.otherFees;
  }

  return [...aggregated.values()];
}

function findLazadaIncomeHeaderIndex(rawRows: unknown[][]): number {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ");

  const isDateLike = (value: string): boolean =>
    /\d{1,2}\s+[a-z]{3,}\s+\d{4}/.test(value) ||
    /\d{4}-\d{2}-\d{2}/.test(value) ||
    /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(value);

  // Metadata keywords to skip
  const metadataKeywords = [
    "periode laporan",
    "nomor laporan",
    "report period",
    "report number",
    "tanggal cetak",
    "print date",
    "seller name",
    "nama seller",
    "store name",
    "nama toko",
    "lazada",
    "finance statement",
    "transaction report",
  ];

  const maxScan = Math.min(rawRows.length, 400);
  let bestIndex = -1;
  let bestScore = -1;

  for (let i = 0; i < maxScan; i++) {
    const row = rawRows[i] ?? [];
    const cells = row.map((cell) => String(cell ?? "").trim());
    const normalized = cells.map((cell) => normalize(cell)).filter(Boolean);
    if (normalized.length < 3) continue;

    const hasFeeName = normalized.some(
      (cell) =>
        cell.includes("nama biaya") ||
        cell.includes("fee name") ||
        cell.includes("jenis biaya") ||
        cell.includes("biaya") ||
        cell.includes("fee")
    );
    const hasOrderNumber = normalized.some(
      (cell) =>
        cell.includes("nomor pesanan") ||
        cell.includes("id pesanan") ||
        cell.includes("order number") ||
        cell.includes("order id") ||
        cell.includes("nomor order") ||
        cell.includes("id pesanan baris") ||
        cell.includes("order item id")
    );
    const hasAmount = normalized.some(
      (cell) =>
        cell.includes("jumlah termasuk pajak") ||
        cell.includes("amount") ||
        cell === "jumlah" ||
        cell.includes("total amount") ||
        cell.includes("nilai") ||
        cell.includes("jumlah yang dibayar") ||
        cell.includes("jumlah yang diterima")
    );
    const hasDate = normalized.some(
      (cell) =>
        cell.includes("tanggal transaksi") ||
        cell.includes("tanggal dilepas") ||
        cell.includes("release date") ||
        cell.includes("transaction date") ||
        cell.includes("waktu")
    );
    const hasStrongHeaderSignals = hasFeeName || hasOrderNumber || hasAmount || hasDate;

    // Skip rows that are clearly metadata (contain metadata keywords)
    const isMetadata = normalized.some((cell) =>
      metadataKeywords.some((meta) => cell.includes(meta))
    );
    if (isMetadata && !hasStrongHeaderSignals) continue;

    // Skip rows that look like date ranges (e.g., "31 Jan 2026 - 31 Jan 2026")
    const looksLikeDateRange = normalized.some((cell) => {
      // Match patterns like "31 Jan 2026", "Jan 2026", "2026-01-31", etc.
      return isDateLike(cell);
    });
    if (looksLikeDateRange && !hasStrongHeaderSignals) continue;

    // Skip rows where most cells look like dates
    const dateLikeCells = normalized.filter((cell) => isDateLike(cell));
    if (dateLikeCells.length >= normalized.length * 0.5 && !hasStrongHeaderSignals) continue;

    // Count matching columns for scoring
    const orderHits = normalized.filter(
      (cell) =>
        cell.includes("nomor pesanan") ||
        cell.includes("id pesanan") ||
        cell.includes("order number") ||
        cell.includes("order id") ||
        cell.includes("id pesanan baris")
    ).length;
    const amountHits = normalized.filter(
      (cell) =>
        cell.includes("jumlah termasuk pajak") ||
        cell.includes("amount") ||
        cell.includes("nilai") ||
        cell.includes("jumlah") ||
        cell.includes("jumlah yang dibayar") ||
        cell.includes("jumlah yang diterima")
    ).length;
    const dateHits = normalized.filter(
      (cell) =>
        cell.includes("tanggal transaksi") ||
        cell.includes("tanggal dilepas") ||
        cell.includes("release") ||
        cell.includes("date")
    ).length;

    // Score calculation - prioritize rows with the critical columns
    const hasCriticalColumns = hasFeeName && (hasOrderNumber || hasAmount);
    const score =
      (hasFeeName ? 5 : 0) +
      (hasOrderNumber ? 4 : 0) +
      (hasAmount ? 4 : 0) +
      (hasDate ? 2 : 0) +
      orderHits * 2 +
      amountHits * 2 +
      dateHits;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }

    // If we found a row with all critical columns, return immediately
    if (hasCriticalColumns && score >= 8) {
      return i;
    }
  }

  // Also try to find any row that looks like a header (has multiple column names)
  if (bestIndex < 0) {
    for (let i = 0; i < maxScan; i++) {
      const row = rawRows[i] ?? [];
      const cells = row.map((cell) => String(cell ?? "").trim());
      const normalized = cells.map((cell) => normalize(cell)).filter(Boolean);
      if (normalized.length < 3) continue;

      const hasStrongHeaderSignals = normalized.some(
        (cell) =>
          cell.includes("nama biaya") ||
          cell.includes("fee") ||
          cell.includes("jumlah") ||
          cell.includes("amount") ||
          cell.includes("nomor pesanan") ||
          cell.includes("id pesanan") ||
          cell.includes("tanggal transaksi")
      );

      // Skip metadata rows
      const isMetadata = normalized.some((cell) =>
        metadataKeywords.some((meta) => cell.includes(meta))
      );
      if (isMetadata && !hasStrongHeaderSignals) continue;

      // Skip date-like rows
      const looksLikeDateRange = normalized.some((cell) => isDateLike(cell));
      if (looksLikeDateRange && !hasStrongHeaderSignals) continue;

      // Look for rows with many string cells that could be headers
      if (normalized.length >= 4) {
        const stringCells = normalized.filter((cell) => {
          // Contains letters (not just numbers)
          return /[a-z]/.test(cell);
        });

        if (stringCells.length >= 3) {
          return i;
        }
      }
    }
  }

  return bestScore >= 4 ? bestIndex : -1;
}

function expandDelimitedSingleCellRows(rawRows: unknown[][]): unknown[][] {
  const toText = (value: unknown) => String(value ?? "");
  const sample = rawRows.slice(0, 40).filter((row) => row && row.length > 0);
  if (sample.length === 0) return rawRows;

  const splitters: Array<{ name: string; split: (line: string) => string[] }> = [
    { name: "tab", split: (line) => line.split("\t") },
    { name: "semicolon", split: (line) => line.split(";") },
    { name: "comma", split: (line) => line.split(",") },
    { name: "pipe", split: (line) => line.split("|") },
    { name: "multi-space", split: (line) => line.split(/\s{2,}/) },
  ];

  const headerKeywords = [
    "periode laporan",
    "nomor laporan",
    "tanggal transaksi",
    "nama biaya",
    "jumlah",
    "nomor pesanan",
    "id pesanan",
    "sku penjual",
  ];

  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/\u00a0/g, " ")
      .trim()
      .replace(/\s+/g, " ");

  const normalizeLine = (value: string) =>
    value
      .toLowerCase()
      .replace(/\u00a0/g, " ")
      .trim();

  const firstLines = sample
    .filter((row) => row.length === 1)
    .map((row) => normalizeLine(toText(row[0])))
    .filter(Boolean);
  if (firstLines.length === 0) return rawRows;

  let best: { name: string; score: number } = { name: "", score: 0 };

  for (const splitter of splitters) {
    let score = 0;
    for (const line of firstLines.slice(0, 8)) {
      const cells = splitter
        .split(line)
        .map((cell) => normalize(cell))
        .filter(Boolean);

      if (cells.length >= 6) score += 2;
      const hit = headerKeywords.filter((keyword) => cells.some((cell) => cell.includes(keyword))).length;
      score += hit;
    }

    if (score > best.score) {
      best = { name: splitter.name, score };
    }
  }

  if (!best.name || best.score < 6) return rawRows;
  const active = splitters.find((item) => item.name === best.name);
  if (!active) return rawRows;

  return rawRows.map((row) => {
    if (!row || row.length !== 1) return row;
    const first = normalizeLine(toText(row[0]));
    const parts = active.split(first).map((cell) => String(cell ?? "").trim()).filter(Boolean);
    return parts.length > 1 ? parts : row;
  });
}

function countNonEmptyCells(row: unknown[]): number {
  return (row ?? []).filter((cell) => String(cell ?? "").trim() !== "").length;
}

function scoreRawRows(rawRows: unknown[][]): number {
  if (rawRows.length === 0) return 0;

  const sample = rawRows.slice(0, 20);
  const nonEmptyPerRow = sample.map((row) => countNonEmptyCells(row ?? []));
  const maxCells = Math.max(0, ...nonEmptyPerRow);
  const wideRows = nonEmptyPerRow.filter((count) => count >= 4).length;

  return maxCells * 100 + wideRows * 10 + rawRows.length;
}

function mergeWorkbookRawRows(content: ArrayBuffer): Array<{ sheetName: string; rawRows: unknown[][]; source: string }> {
  const directSheets = readWorkbookSheetsRawRows(content);
  const tsvSheets = readWorkbookSheetsRawRowsViaTsv(content);
  const sheetNames = new Set<string>([
    ...directSheets.map((sheet) => sheet.sheetName),
    ...tsvSheets.map((sheet) => sheet.sheetName),
  ]);

  const merged: Array<{ sheetName: string; rawRows: unknown[][]; source: string }> = [];

  for (const sheetName of sheetNames) {
    const direct = directSheets.find((sheet) => sheet.sheetName === sheetName);
    const viaTsv = tsvSheets.find((sheet) => sheet.sheetName === sheetName);

    if (direct && viaTsv) {
      const directPrepared = expandDelimitedSingleCellRows(direct.rawRows);
      const tsvPrepared = expandDelimitedSingleCellRows(viaTsv.rawRows);
      const directScore = scoreRawRows(directPrepared);
      const tsvScore = scoreRawRows(tsvPrepared);

      if (tsvScore > directScore) {
        merged.push({ sheetName, rawRows: tsvPrepared, source: "tsv" });
      } else {
        merged.push({ sheetName, rawRows: directPrepared, source: "direct" });
      }
      continue;
    }

    if (viaTsv) {
      merged.push({ sheetName, rawRows: expandDelimitedSingleCellRows(viaTsv.rawRows), source: "tsv" });
      continue;
    }

    if (direct) {
      merged.push({ sheetName, rawRows: expandDelimitedSingleCellRows(direct.rawRows), source: "direct" });
    }
  }

  return merged;
}

function parseLazadaIncomeWorkbook(content: ArrayBuffer): IncomeTransaction[] {
  const sheets = mergeWorkbookRawRows(content);
  if (sheets.length === 0) return [];

  const normalize = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ");

  // Prioritize sheets - look for transaction/detail sheets, skip overview/summary
  const sheetPriority = sheets.map((sheet) => {
    const name = normalize(sheet.sheetName);
    let score = 0;
    // Prefer sheets with these names
    if (name.includes("transaction") || name.includes("transaksi")) score += 10;
    if (name.includes("detail")) score += 8;
    if (name.includes("item")) score += 6;
    if (name.includes("data")) score += 5;
    if (name.includes("income")) score += 4;
    if (name.includes("pendapatan")) score += 4;
    // Deprioritize overview/summary sheets
    if (name.includes("overview") || name.includes("ringkasan")) score -= 10;
    if (name.includes("summary")) score -= 8;
    return { sheet, score };
  });

  // Sort by priority score
  sheetPriority.sort((a, b) => b.score - a.score);

  const merged = new Map<string, IncomeTransaction>();

  for (const { sheet } of sheetPriority) {
    const preparedRows = sheet.rawRows;
    const headerIndex = findLazadaIncomeHeaderIndex(preparedRows);
    const candidateIndexes = new Set<number>();
    if (headerIndex >= 0) candidateIndexes.add(headerIndex);

    // Also add nearby rows as candidates in case header detection is slightly off
    if (headerIndex >= 0) {
      for (let i = Math.max(0, headerIndex - 5); i <= Math.min(preparedRows.length - 1, headerIndex + 5); i++) {
        candidateIndexes.add(i);
      }
    }

    // Add a brute force scan of first rows
    const bruteForceScan = Math.min(preparedRows.length, 200);
    for (let i = 0; i < bruteForceScan; i++) {
      candidateIndexes.add(i);
    }

    let bestTransactions: IncomeTransaction[] = [];
    let bestIndex = -1;

    for (const idx of candidateIndexes) {
      // Try the header map method first
      const mappedTransactions = parseLazadaRowsByHeaderMap(preparedRows, idx);
      if (mappedTransactions.length > bestTransactions.length) {
        bestTransactions = mappedTransactions;
        bestIndex = idx;
      }

      // Also try the object rows method
      const rows = buildRowsFromRaw(preparedRows, idx);
      const transactions = parseLazadaIncomeRows(rows);
      if (transactions.length > bestTransactions.length) {
        bestTransactions = transactions;
        bestIndex = idx;
      }

      // If we found enough transactions, stop early
      if (bestTransactions.length >= 10 && idx === headerIndex) {
        break;
      }
    }

    const transactions = bestTransactions;
    if (transactions.length === 0) continue;

    for (const tx of transactions) {
      const key = String(tx.orderId ?? "").trim();
      if (!key) continue;

      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...tx });
        continue;
      }

      existing.releaseDate = existing.releaseDate || tx.releaseDate;
      existing.settlementAmount += tx.settlementAmount;
      existing.commissionFee += tx.commissionFee;
      existing.serviceFee += tx.serviceFee;
      existing.shippingFee += tx.shippingFee;
      existing.voucherBySeller += tx.voucherBySeller;
      existing.otherFees += tx.otherFees;
      existing.totalDeductions += tx.totalDeductions;
      existing.grossAmount += tx.grossAmount;
    }

    // If we found transactions in this sheet, we can stop
    if (merged.size > 0) break;
  }

  if (merged.size > 0) return [...merged.values()];

  // Last fallback: cari baris data langsung dari raw cell dengan pola "order id + amount"
  for (const { sheet } of sheetPriority) {
    const rows = sheet.rawRows;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const cells = row.map((cell) => String(cell ?? "").trim()).filter(Boolean);
      if (cells.length < 2) continue;

      // Look for order ID pattern (typically 8+ digits) and amount pattern
      const orderLike = cells.find((cell) => /^\d{8,}$/.test(cell) || /^[A-Z0-9]{8,}$/i.test(cell));
      const amountLike = cells.find(
        (cell) => /^-?\d{1,3}(\.\d{3})*,?\d*$/.test(cell) || /^-?Rp[\s\d.,]+$/.test(cell)
      );
      if (!orderLike || !amountLike) continue;

      const orderId = orderLike;
      const amount = parseAmount(amountLike);
      if (amount === 0) continue;

      const existing = merged.get(orderId) ?? {
        orderId,
        releaseDate: "",
        settlementAmount: 0,
        commissionFee: 0,
        serviceFee: 0,
        shippingFee: 0,
        voucherBySeller: 0,
        otherFees: 0,
        totalDeductions: 0,
        grossAmount: 0,
      };

      if (amount > 0) existing.grossAmount += amount;
      else existing.otherFees += Math.abs(amount);
      existing.totalDeductions =
        existing.commissionFee +
        existing.serviceFee +
        existing.shippingFee +
        existing.voucherBySeller +
        existing.otherFees;
      merged.set(orderId, existing);
    }

    if (merged.size > 0) break;
  }

  return [...merged.values()];
}

function parseIncomeFromWorkbook(
  content: ArrayBuffer,
  parser: (rows: Record<string, string>[]) => IncomeTransaction[]
): IncomeTransaction[] {
  const sheets = readWorkbookSheetsToRows(content);
  if (sheets.length === 0) return [];

  const merged = new Map<string, IncomeTransaction>();

  for (const sheet of sheets) {
    const transactions = parser(sheet.rows);
    for (const tx of transactions) {
      const key = String(tx.orderId ?? "").trim();
      if (!key) continue;

      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...tx });
        continue;
      }

      existing.releaseDate = existing.releaseDate || tx.releaseDate;
      existing.settlementAmount += tx.settlementAmount;
      existing.commissionFee += tx.commissionFee;
      existing.serviceFee += tx.serviceFee;
      existing.shippingFee += tx.shippingFee;
      existing.voucherBySeller += tx.voucherBySeller;
      existing.otherFees += tx.otherFees;
      existing.totalDeductions += tx.totalDeductions;
      existing.grossAmount += tx.grossAmount;
    }
  }

  return [...merged.values()];
}

// ──────────────────────────────────────────────────────────────
// Main export
// ──────────────────────────────────────────────────────────────

export function parseIncomeFile(
  content: string | ArrayBuffer,
  marketplace: MarketplaceId
): IncomeTransaction[] {
  switch (marketplace) {
    case "shopee":
      if (content instanceof ArrayBuffer) {
        const fromWorkbook = parseShopeeIncomeWorkbook(content);
        if (fromWorkbook.length > 0) return fromWorkbook;
      }
      return parseShopeeIncomeRows(readFileToRows(content));
    case "tokopedia":
      if (content instanceof ArrayBuffer) {
        return parseIncomeFromWorkbook(content, parseTokopediaIncomeRows);
      }
      return parseTokopediaIncomeRows(readFileToRows(content));
    case "lazada":
      if (content instanceof ArrayBuffer) {
        const fromLazadaWorkbook = parseLazadaIncomeWorkbook(content);
        if (fromLazadaWorkbook.length > 0) return fromLazadaWorkbook;
        return parseIncomeFromWorkbook(content, parseLazadaIncomeRows);
      }
      return parseLazadaIncomeRows(readFileToRows(content));
  }
}

export function inspectIncomeWorkbook(content: ArrayBuffer): string {
  const sheets = mergeWorkbookRawRows(content);
  if (sheets.length === 0) return "workbook kosong";

  const normalize = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ");

  // Metadata keywords to identify non-header rows
  const metadataKeywords = [
    "periode laporan",
    "nomor laporan",
    "report period",
    "report number",
    "tanggal cetak",
    "print date",
    "seller name",
    "nama seller",
    "store name",
    "nama toko",
    "lazada",
  ];

  // Check if it looks like a date
  const isDateLike = (cell: string): boolean => {
    return /\d{1,2}\s+[a-z]{3,}\s+\d{4}/.test(cell) || // "31 Jan 2026"
      /\d{4}-\d{2}-\d{2}/.test(cell) || // "2026-01-31"
      /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(cell); // "31/01/2026"
  };

  const summary = sheets.slice(0, 5).map((sheet) => {
    const rawRows = sheet.rawRows;
    const headerIdx = findLazadaIncomeHeaderIndex(rawRows);

    // Find the first non-metadata, non-date row for fallback
    let fallbackHeader: unknown[] = [];
    for (const row of rawRows) {
      const cells = (row ?? []).map((cell) => String(cell ?? "").trim());
      const normalized = cells.map((cell) => normalize(cell)).filter(Boolean);

      if (normalized.length < 2) continue;

      const isMetadata = normalized.some((cell) =>
        metadataKeywords.some((meta) => cell.includes(meta))
      );
      if (isMetadata) continue;

      // Skip rows that are mostly dates
      const dateCells = normalized.filter(isDateLike);
      if (dateCells.length >= normalized.length * 0.5) continue;

      if (normalized.some((cell) => cell.length > 0)) {
        fallbackHeader = row ?? [];
        break;
      }
    }

    const headerRow = headerIdx >= 0 ? rawRows[headerIdx] ?? [] : fallbackHeader;
    const headerPreview = headerRow
      .map((cell) => String(cell ?? "").trim())
      .filter(Boolean)
      .slice(0, 10)
      .join(" | ");

    const hasOrder = headerRow.some((cell) => {
      const n = normalize(String(cell ?? ""));
      return (
        n.includes("nomor pesanan") ||
        n.includes("id pesanan") ||
        n.includes("order id") ||
        n.includes("order number")
      );
    });
    const hasFee = headerRow.some((cell) => {
      const n = normalize(String(cell ?? ""));
      return n.includes("nama biaya") || n.includes("fee name") || n.includes("jenis biaya") ||
        n.includes("biaya") || n.includes("fee");
    });
    const hasAmount = headerRow.some((cell) => {
      const n = normalize(String(cell ?? ""));
      return n.includes("jumlah") || n.includes("amount") || n.includes("nilai");
    });

    // Show first few data rows for debugging
    const dataRowsPreview: string[] = [];
    const dataStartIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
    if (rawRows.length > dataStartIdx) {
      for (let i = dataStartIdx; i < Math.min(rawRows.length, dataStartIdx + 3); i++) {
        const row = rawRows[i];
        if (!row) continue;
        const rowPreview = row
          .map((cell) => String(cell ?? "").trim())
          .filter(Boolean)
          .slice(0, 4)
          .join(", ");
        if (rowPreview && rowPreview.length > 5) dataRowsPreview.push(`[${i}] ${rowPreview.substring(0, 60)}`);
      }
    }

    const cellCounts = rawRows.slice(0, 6).map((row, idx) => `${idx}:${countNonEmptyCells(row ?? [])}`).join(",");

    return `${sheet.sheetName}(${sheet.source}): rows=${rawRows.length}, headerIdx=${headerIdx}, order=${hasOrder}, fee=${hasFee}, amount=${hasAmount}, cells=${cellCounts}, header=[${headerPreview}]${dataRowsPreview.length > 0 ? " data=" + dataRowsPreview.join("; ") : ""}`;
  });

  return `Sheets: ${sheets.map((s) => `${s.sheetName}:${s.source}`).join(", ")} | ${summary.join(" || ")}`;
}
