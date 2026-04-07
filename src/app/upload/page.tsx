"use client";

import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload, CheckCircle, X, AlertCircle, Plus, Trash2,
  ChevronDown, ChevronUp, FileText, Receipt,
} from "lucide-react";
import AppSidebar from "@/components/AppSidebar";
import { cn, formatRupiah } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { parseShopeeFile } from "@/lib/parsers/shopee";
import { parseTokopediaFile } from "@/lib/parsers/tokopedia";
import { parseLazadaFile } from "@/lib/parsers/lazada";
import { inspectIncomeWorkbook, parseIncomeFile } from "@/lib/parsers/income";
import { parseProductMasterFileWithMeta } from "@/lib/parsers/productMaster";
import { generateReportFromSets } from "@/lib/reconcile";
import { validateUploadFileOrThrow } from "@/lib/validation/uploadValidator";
import type { MarketplaceId, MarketplaceUploadSet, HppEntry } from "@/lib/types";
import { MARKETPLACE_LABELS, MARKETPLACE_COLORS } from "@/lib/types";
import { useRouter } from "next/navigation";

const MARKETPLACES: MarketplaceId[] = ["shopee", "tokopedia", "lazada"];

// ──────────────────────────────────────────────────────────────
// Drop Zone Component
// ──────────────────────────────────────────────────────────────

interface DropZoneProps {
  onFile: (file: File) => Promise<void>;
  label: string;
  hint: string;
  accept?: Record<string, string[]>;
  disabled?: boolean;
}

function DropZone({ onFile, label, hint, disabled }: DropZoneProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setError(null);
      setLoading(true);
      try {
        await onFile(file);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "Gagal membaca file.");
      } finally {
        setLoading(false);
      }
    },
    [onFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    multiple: false,
    disabled: disabled || loading,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl px-4 py-3 text-center cursor-pointer transition-all",
          isDragActive ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
          disabled && "opacity-40 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
            <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            Memproses...
          </div>
        ) : (
          <div className="flex items-center gap-2 justify-center">
            <Upload className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-600 font-medium">{label}</span>
            <span className="text-xs text-slate-300">{hint}</span>
          </div>
        )}
      </div>
      {error && (
        <div className="mt-1 flex items-center gap-1 text-red-500 text-xs">
          <AlertCircle className="w-3 h-3" />
          {error}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Marketplace Upload Card
// ──────────────────────────────────────────────────────────────

function MarketplaceCard({ marketplace }: { marketplace: MarketplaceId }) {
  const {
    uploadSets,
    setOrderFileAt,
    setCanceledOrderFile,
    setFailedDeliveryFile,
    setIncomeFile,
  } = useAppStore();
  const [open, setOpen] = useState(true);

  const uploadSet = uploadSets[marketplace];
  const color = MARKETPLACE_COLORS[marketplace];
  const label = MARKETPLACE_LABELS[marketplace];
  const orderFiles = uploadSet?.orderFiles ?? [];
  const canceledOrderFile = uploadSet?.canceledOrderFile ?? null;
  const failedDeliveryFile = uploadSet?.failedDeliveryFile ?? null;
  const incomeFile = uploadSet?.incomeFile ?? null;

  const totalOrders = orderFiles.reduce((s, f) => s + f.rawOrders.length, 0);
  const totalCanceledOrders = canceledOrderFile?.rawOrders.length ?? 0;
  const totalFailedDeliveryOrders = failedDeliveryFile?.rawOrders.length ?? 0;
  const totalIncome = incomeFile?.transactions.length ?? 0;
  const previousMonthOrderFile =
    orderFiles.find((f) => f.label === "previous-month") ??
    orderFiles.find((f) => f.label === undefined) ??
    null;
  const currentMonthOrderFile =
    orderFiles.find((f) => f.label === "current-month") ??
    null;

  async function handleOrderFile(file: File, slot: 0 | 1) {
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
    const content = isExcel ? await file.arrayBuffer() : await file.text();
    validateUploadFileOrThrow({
      marketplace,
      role: "orders",
      fileName: file.name,
      content,
    });

    let rawOrders;
    if (marketplace === "shopee") {
      rawOrders = parseShopeeFile(content);
    } else if (marketplace === "tokopedia") {
      rawOrders = parseTokopediaFile(content);
    } else {
      rawOrders = parseLazadaFile(content);
    }
    if (rawOrders.length === 0) throw new Error("0 pesanan terbaca — pastikan file adalah export Pesanan Selesai dari Seller Center, bukan laporan lainnya");
    setOrderFileAt(marketplace, slot, {
      fileName: file.name,
      rawOrders,
      uploadedAt: new Date().toISOString(),
    });
  }

  async function handleIncomeFile(file: File) {
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
    const content = isExcel ? await file.arrayBuffer() : await file.text();
    validateUploadFileOrThrow({
      marketplace,
      role: "income",
      fileName: file.name,
      content,
    });

    const transactions = parseIncomeFile(content, marketplace);
    if (transactions.length === 0) {
      if (isExcel && content instanceof ArrayBuffer && marketplace === "lazada") {
        const debugInfo = inspectIncomeWorkbook(content);
        throw new Error(
          `0 transaksi terbaca. Debug Lazada: ${debugInfo}`
        );
      }
      throw new Error("0 transaksi terbaca — pastikan file adalah export Transaksi Pendapatan / Income dari Seller Center");
    }
    setIncomeFile(marketplace, {
      fileName: file.name,
      transactions,
      uploadedAt: new Date().toISOString(),
    });
  }

  async function handleCanceledOrderFile(file: File) {
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
    const content = isExcel ? await file.arrayBuffer() : await file.text();
    validateUploadFileOrThrow({
      marketplace,
      role: "canceled-orders",
      fileName: file.name,
      content,
    });

    let rawOrders;
    if (marketplace === "shopee") {
      rawOrders = parseShopeeFile(content);
    } else if (marketplace === "tokopedia") {
      rawOrders = parseTokopediaFile(content);
    } else {
      rawOrders = parseLazadaFile(content);
    }
    if (rawOrders.length === 0) throw new Error("0 pesanan cancel terbaca — pastikan file adalah export Pesanan Cancel dari Seller Center");
    setCanceledOrderFile(marketplace, {
      fileName: file.name,
      rawOrders,
      uploadedAt: new Date().toISOString(),
      label: "cancelled-orders",
    });
  }

  async function handleFailedDeliveryFile(file: File) {
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
    const content = isExcel ? await file.arrayBuffer() : await file.text();
    validateUploadFileOrThrow({
      marketplace,
      role: "failed-delivery",
      fileName: file.name,
      content,
    });

    const rawOrders = parseShopeeFile(content);
    if (rawOrders.length === 0) {
      throw new Error("0 pesanan failed delivery terbaca — pastikan file adalah export Failed Delivery dari Seller Center");
    }

    setFailedDeliveryFile(marketplace, {
      fileName: file.name,
      rawOrders,
      uploadedAt: new Date().toISOString(),
      label: "failed-delivery-orders",
    });
  }

  const hasData =
    totalOrders > 0 ||
    totalIncome > 0 ||
    totalCanceledOrders > 0 ||
    totalFailedDeliveryOrders > 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-semibold text-slate-800">{label}</span>
          {hasData && (
            <div className="flex items-center gap-2">
              {totalOrders > 0 && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                  {totalOrders} pesanan
                </span>
              )}
              {totalCanceledOrders > 0 && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  {totalCanceledOrders} cancel
                </span>
              )}
              {totalFailedDeliveryOrders > 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                  {totalFailedDeliveryOrders} failed delivery
                </span>
              )}
              {totalIncome > 0 && (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  {totalIncome} transaksi
                </span>
              )}
            </div>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4">

          {/* Pesanan Selesai */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Pesanan Selesai
              </span>
              <span className="text-xs text-slate-400">(download 2 bulan: bulan lalu + bulan ini)</span>
            </div>

            <div className="space-y-2">
              {previousMonthOrderFile ? (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-xs text-slate-700 font-medium truncate max-w-[200px]">{previousMonthOrderFile.fileName}</span>
                    <span className="text-xs text-slate-400">{previousMonthOrderFile.rawOrders.length} pesanan</span>
                  </div>
                  <button
                    onClick={() => setOrderFileAt(marketplace, 0, null)}
                    className="text-slate-300 hover:text-red-400 ml-2"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <DropZone
                  onFile={(file) => handleOrderFile(file, 0)}
                  label="Upload Pesanan Selesai Bulan Lalu"
                  hint="CSV / XLSX"
                />
              )}

              {currentMonthOrderFile ? (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-xs text-slate-700 font-medium truncate max-w-[200px]">{currentMonthOrderFile.fileName}</span>
                    <span className="text-xs text-slate-400">{currentMonthOrderFile.rawOrders.length} pesanan</span>
                  </div>
                  <button
                    onClick={() => setOrderFileAt(marketplace, 1, null)}
                    className="text-slate-300 hover:text-red-400 ml-2"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <DropZone
                  onFile={(file) => handleOrderFile(file, 1)}
                  label="Upload Pesanan Selesai Bulan Ini"
                  hint="CSV / XLSX"
                />
              )}
            </div>
          </div>

          {/* Transaksi Pendapatan */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Receipt className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Transaksi Pendapatan
              </span>
              <span className="text-xs text-slate-400">(download bulan yang dihitung saja)</span>
            </div>

            {incomeFile ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs text-slate-700 font-medium truncate max-w-[200px]">{incomeFile.fileName}</span>
                  <span className="text-xs text-slate-400">{incomeFile.transactions.length} transaksi</span>
                </div>
                <button
                  onClick={() => setIncomeFile(marketplace, null)}
                  className="text-slate-300 hover:text-red-400 ml-2"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <DropZone
                onFile={handleIncomeFile}
                label="Upload Transaksi Pendapatan"
                hint="CSV / XLSX — opsional, tapi lebih akurat"
              />
            )}

            {!incomeFile && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Tanpa file ini, biaya platform dihitung dari estimasi config — kurang akurat
              </p>
            )}
          </div>

          {/* Pesanan Cancel (opsional) */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Pesanan Cancel (Opsional)
              </span>
            </div>

            {canceledOrderFile ? (
              <div className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs text-slate-700 font-medium truncate max-w-[200px]">{canceledOrderFile.fileName}</span>
                  <span className="text-xs text-slate-400">{canceledOrderFile.rawOrders.length} pesanan</span>
                </div>
                <button
                  onClick={() => setCanceledOrderFile(marketplace, null)}
                  className="text-slate-300 hover:text-red-400 ml-2"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <DropZone
                onFile={handleCanceledOrderFile}
                label="Upload Pesanan Cancel"
                hint="CSV / XLSX (opsional)"
              />
            )}
          </div>

          {marketplace === "shopee" && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Pesanan Failed Delivery (Opsional)
                </span>
              </div>

              {failedDeliveryFile ? (
                <div className="flex items-center justify-between bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-xs text-slate-700 font-medium truncate max-w-[200px]">{failedDeliveryFile.fileName}</span>
                    <span className="text-xs text-slate-400">{failedDeliveryFile.rawOrders.length} pesanan</span>
                  </div>
                  <button
                    onClick={() => setFailedDeliveryFile(marketplace, null)}
                    className="text-slate-300 hover:text-red-400 ml-2"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <DropZone
                  onFile={handleFailedDeliveryFile}
                  label="Upload Pesanan Failed Delivery"
                  hint="CSV / XLSX (opsional)"
                />
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// HPP Manager
// ──────────────────────────────────────────────────────────────

function HppManager() {
  const { hppEntries, addHppEntry, setHppEntries } = useAppStore();
  const [form, setForm] = useState({ sku: "", productName: "", cost: "" });
  const [open, setOpen] = useState(true);
  const [duplicateKeys, setDuplicateKeys] = useState<string[]>([]);

  const handleAdd = () => {
    if (!form.sku && !form.productName) return;
    addHppEntry({ sku: form.sku, productName: form.productName, cost: parseFloat(form.cost) || 0 });
    setForm({ sku: "", productName: "", cost: "" });
  };

  const handleImportMasterFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith(".xlsx") || fileName.endsWith(".xls");
    const content = isExcel ? await file.arrayBuffer() : await file.text();
    const { entries, duplicateLabels } = parseProductMasterFileWithMeta(content);
    setDuplicateKeys(duplicateLabels);
    setHppEntries(entries);
    e.target.value = "";
  };

  const handleResetHpp = () => {
    setHppEntries([]);
    setDuplicateKeys([]);
    setForm({ sku: "", productName: "", cost: "" });
  };

  const hppPreviewEntries = Array.from(
    hppEntries.reduce(
      (acc, entry) => {
        const masterProductName = (entry.masterProductName || entry.productName || "").trim();
        const masterSku = (entry.masterSku || entry.sku || "").trim();
        const key = `${masterProductName.toLowerCase()}|${masterSku.toLowerCase()}|${entry.cost}`;

        if (!acc.has(key)) {
          acc.set(key, {
            key,
            masterProductName,
            masterSku,
            sku: entry.sku,
            productName: entry.productName,
            cost: entry.cost,
          });
        }

        return acc;
      },
      new Map<
        string,
        {
          key: string;
          masterProductName: string;
          masterSku: string;
          sku: string;
          productName: string;
          cost: number;
        }
      >()
    ).values()
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-800">HPP (Harga Pokok Penjualan)</span>
          {hppEntries.length > 0 && (
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
              {hppPreviewEntries.length} Master SKU
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
            <input placeholder="Nama Produk" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
            <div className="flex gap-2">
              <input placeholder="HPP (Rp)" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })}
                type="number" className="border border-slate-200 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-slate-300" />
              <button onClick={handleAdd} className="bg-slate-900 text-white rounded-lg px-3 hover:bg-slate-700 transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Gunakan tombol reset untuk hapus seluruh data HPP.
            </p>
            <button
              onClick={handleResetHpp}
              disabled={hppEntries.length === 0}
              className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reset HPP
            </button>
          </div>

          <div className="border border-blue-100 bg-blue-50 rounded-lg p-3">
            <p className="text-xs font-medium text-blue-800 mb-1">
              Upload File HPP Produk (XLSX / CSV)
            </p>
            <p className="text-xs text-blue-700 mb-2">
              Kolom: Master Product Name, Variant Name, Master SKU, HPP New, HPP Old, Master variation ID, Channel variation ID
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleImportMasterFile}
              className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-slate-700"
            />
            <p className="text-[11px] text-blue-600 mt-1">
              HPP yang dipakai per Master SKU: HPP New (kolom H), fallback ke HPP Old (kolom G).
            </p>
          </div>

          {duplicateKeys.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
              <p className="text-xs font-medium text-amber-800">
                Ditemukan {duplicateKeys.length} data duplikat (SKU/Nama Produk).
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Sistem otomatis memakai baris terakhir untuk key yang sama.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {duplicateKeys.slice(0, 12).map((key) => (
                  <span
                    key={key}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200"
                  >
                    {key}
                  </span>
                ))}
                {duplicateKeys.length > 12 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    +{duplicateKeys.length - 12} lainnya
                  </span>
                )}
              </div>
            </div>
          )}

          {hppEntries.length > 0 && (
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Master SKU</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">SKU</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-500">Nama Produk</th>
                    <th className="text-right px-3 py-2 text-xs text-gray-500">HPP/unit</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {hppPreviewEntries.map((entry) => (
                    <tr key={entry.key} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-gray-600 font-mono text-xs">{entry.masterSku || "-"}</td>
                      <td className="px-3 py-2 text-gray-600 font-mono text-xs">{entry.sku}</td>
                      <td className="px-3 py-2 text-gray-800">{entry.masterProductName || entry.productName}</td>
                      <td className="px-3 py-2 text-right text-gray-800">{formatRupiah(entry.cost)}</td>
                      <td className="px-2 py-2">
                        <button onClick={() => setHppEntries(hppEntries.filter((e) => {
                          const eMasterProductName = (e.masterProductName || e.productName || "").trim().toLowerCase();
                          const eMasterSku = (e.masterSku || e.sku || "").trim().toLowerCase();
                          return !(
                            eMasterProductName === entry.masterProductName.trim().toLowerCase() &&
                            eMasterSku === entry.masterSku.trim().toLowerCase() &&
                            e.cost === entry.cost
                          );
                        }))}
                          className="text-gray-300 hover:text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────────────────

export default function UploadPage() {
  const { uploadSets, hppEntries, configs, setReport } = useAppStore();
  const router = useRouter();
  const [calculating, setCalculating] = useState(false);
  const [offlineForm, setOfflineForm] = useState({
    productName: "",
    qty: "1",
    unit: "Unit",
    totalPrice: "",
    date: "",
  });

  const marketplaceProgress = MARKETPLACES.map((marketplace) => {
    const set = uploadSets[marketplace];
    const orderCount = set?.orderFiles.length ?? 0;
    const hasIncome = Boolean(set?.incomeFile);
    const hasAny = orderCount > 0 || hasIncome;
    const isComplete = orderCount === 2 && hasIncome;
    return { marketplace, orderCount, hasIncome, hasAny, isComplete };
  });

  const totalMarketplaces = marketplaceProgress.filter((p) => p.hasAny).length;
  const incompleteMarketplaces = marketplaceProgress.filter((p) => p.hasAny && !p.isComplete);
  const isReadyToCalculate = totalMarketplaces > 0 && incompleteMarketplaces.length === 0;

  const activeUploadSets = MARKETPLACES.reduce<Partial<Record<MarketplaceId, MarketplaceUploadSet>>>(
    (acc, marketplace) => {
      acc[marketplace] = uploadSets[marketplace];
      return acc;
    },
    {}
  );

  const totalOrders = MARKETPLACES.reduce(
    (s, marketplace) =>
      s + (uploadSets[marketplace]?.orderFiles.reduce((ss, f) => ss + f.rawOrders.length, 0) ?? 0),
    0
  );

  const totalIncome = MARKETPLACES.reduce(
    (s, marketplace) => s + (uploadSets[marketplace]?.incomeFile?.transactions.length ?? 0),
    0
  );

  const hasIncomeFiles = MARKETPLACES.some((marketplace) => uploadSets[marketplace]?.incomeFile !== null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#hpp-manager") return;
    const hppSection = document.getElementById("hpp-manager");
    if (!hppSection) return;
    hppSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleCalculate = () => {
    if (!isReadyToCalculate) return;
    setCalculating(true);
    setTimeout(() => {
      const report = generateReportFromSets(activeUploadSets, hppEntries, configs);
      setReport(report);
      setCalculating(false);
      router.push("/dashboard");
    }, 100);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <AppSidebar />
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Modul Pendapatan</h1>
            <p className="text-slate-600 mt-1 text-sm max-w-3xl">
              Integrasikan laporan penjualan dari berbagai marketplace atau input data offline manual untuk analisa profit yang lebih cepat dan akurat.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5">
            <div className="space-y-5">
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 shadow-sm">
                <p className="text-sm font-medium text-blue-800 mb-2">Contoh alur pengambilan data</p>
                <div className="grid sm:grid-cols-2 gap-3 text-xs text-blue-700">
                  <div className="flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Pesanan Selesai</p>
                      <p>Upload 2 bulan (bulan lalu + bulan berjalan)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Receipt className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Transaksi Pendapatan</p>
                      <p>Upload bulan yang dihitung saja</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {MARKETPLACES.map((mp) => (
                  <MarketplaceCard key={mp} marketplace={mp} />
                ))}
              </div>

              <section id="hpp-manager" className="scroll-mt-6">
                <HppManager />
              </section>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <div>
                  <p className="font-medium text-slate-800">
                    {totalMarketplaces > 0
                      ? `${totalMarketplaces} marketplace • ${totalOrders} pesanan • ${totalIncome} transaksi pendapatan`
                      : "Belum ada data yang diupload"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {!hasIncomeFiles
                      ? "Upload Transaksi Pendapatan agar settlement akurat"
                      : incompleteMarketplaces.length > 0
                        ? `Lengkapi ${incompleteMarketplaces.map((p) => MARKETPLACE_LABELS[p.marketplace]).join(", ")}: 2 file Pesanan Selesai + 1 file Pendapatan`
                        : "Siap dihitung: tiap marketplace sudah lengkap"}
                  </p>
                </div>
                <button
                  onClick={handleCalculate}
                  disabled={!isReadyToCalculate || calculating}
                  className="bg-slate-900 text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                >
                  {calculating && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  Hitung Revenue
                </button>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-800 mb-3">Input Penjualan Offline</p>
                <div className="space-y-2.5">
                  <input
                    placeholder="Nama produk/jasa"
                    value={offlineForm.productName}
                    onChange={(e) => setOfflineForm((prev) => ({ ...prev, productName: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="Jumlah"
                      value={offlineForm.qty}
                      onChange={(e) => setOfflineForm((prev) => ({ ...prev, qty: e.target.value }))}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <select
                      value={offlineForm.unit}
                      onChange={(e) => setOfflineForm((prev) => ({ ...prev, unit: e.target.value }))}
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option>Unit</option>
                      <option>Pcs</option>
                      <option>Paket</option>
                    </select>
                  </div>
                  <input
                    placeholder="Total harga (Rp)"
                    value={offlineForm.totalPrice}
                    onChange={(e) => setOfflineForm((prev) => ({ ...prev, totalPrice: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="date"
                    value={offlineForm.date}
                    onChange={(e) => setOfflineForm((prev) => ({ ...prev, date: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                  />
                  <button className="w-full rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-sm font-semibold py-2.5">
                    Simpan Data Offline
                  </button>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-900 to-blue-700 text-white rounded-2xl p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-blue-200">Target Bulanan</p>
                <p className="text-3xl font-extrabold mt-1">74% Tercapai</p>
                <div className="h-2 bg-white/20 rounded-full mt-3 overflow-hidden">
                  <div className="h-full w-3/4 bg-emerald-300 rounded-full" />
                </div>
                <p className="text-xs text-blue-100 mt-2">Performa saat ini dari akumulasi data transaksi yang diupload.</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <p className="text-sm font-semibold text-slate-800 mb-2">Kontribusi Sumber Pendapatan</p>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>Marketplace</span>
                    <span className="font-semibold text-emerald-600">82%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Offline / Direct</span>
                    <span className="font-semibold text-blue-700">18%</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
      </div>
    </div>
  );
}
