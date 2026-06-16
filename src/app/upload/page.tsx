/**
 * Module: Upload Page (2-step flow)
 * Purpose: Step 1 — select marketplace + store + period. Step 2 — drop files to /api/monthly-uploads.
 * Route: /upload
 * Used by: sellers uploading marketplace export files per toko per period
 * Dependencies: StorePicker, MonthPicker, /api/monthly-uploads, /api/stores
 * Public functions: UploadPage (default export)
 * Side effects: POST /api/monthly-uploads per file drop; reads /api/stores
 */

"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload, CheckCircle, X, AlertCircle, FileText, Receipt,
  ShoppingBag, RotateCcw, TruckIcon, ArrowRight, ArrowLeft,
  Database,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthAreaLayout from "@/components/AuthAreaLayout";
import StorePicker from "@/components/StorePicker";
import MonthPicker, { parseYearMonth } from "@/components/MonthPicker";
import { cn } from "@/lib/utils";
import type { MarketplaceId, FileType } from "@/lib/types";
import { MARKETPLACE_LABELS, MARKETPLACE_COLORS } from "@/lib/types";

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const MARKETPLACES: MarketplaceId[] = ["shopee", "tokopedia", "lazada"];

const FILE_ACCEPT = {
  "text/csv": [".csv"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

// ──────────────────────────────────────────────────────────────
// Types local to this page
// ──────────────────────────────────────────────────────────────

type UploadStatus = "idle" | "uploading" | "success" | "error";

interface SlotState {
  status: UploadStatus;
  fileName?: string;
  rowCount?: number;
  error?: string;
  uploadId?: string;
}

interface UploadSlots {
  order_prev: SlotState;
  order_curr: SlotState;
  income: SlotState;
  return: SlotState;
  cancel: SlotState;
  failed: SlotState;
}

const EMPTY_SLOTS: UploadSlots = {
  order_prev: { status: "idle" },
  order_curr: { status: "idle" },
  income: { status: "idle" },
  return: { status: "idle" },
  cancel: { status: "idle" },
  failed: { status: "idle" },
};

type SlotKey = keyof UploadSlots;

// ──────────────────────────────────────────────────────────────
// Drop Zone Component (kept from original, adapted for server upload)
// ──────────────────────────────────────────────────────────────

interface DropZoneProps {
  onFile: (file: File) => Promise<void>;
  label: string;
  hint: string;
  disabled?: boolean;
  uploading?: boolean;
}

function DropZone({ onFile, label, hint, disabled, uploading }: DropZoneProps) {
  const [localError, setLocalError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setLocalError(null);
      try {
        await onFile(file);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLocalError(msg || "Gagal mengunggah file.");
      }
    },
    [onFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: FILE_ACCEPT,
    multiple: false,
    disabled: disabled || uploading,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl px-4 py-4 text-center cursor-pointer transition-all duration-200",
          isDragActive
            ? "border-[var(--accent)] bg-[var(--accent-soft)] scale-[1.01]"
            : "border-[var(--border-subtle)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] hover:scale-[1.005]",
          (disabled || uploading) && "opacity-40 cursor-not-allowed hover:scale-100 hover:border-[var(--border-subtle)]"
        )}
        style={{
          boxShadow: isDragActive ? "0 0 0 4px var(--accent-glow)" : "none",
        }}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div className="flex items-center justify-center gap-2.5 text-[var(--text-subtle)] text-sm py-1">
            <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            <span className="font-medium">Mengunggah...</span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 justify-center">
            <Upload className={cn("w-4 h-4 transition-colors", isDragActive ? "text-[var(--accent)]" : "text-[var(--text-subtle)]")} />
            <span className="text-sm font-medium text-[var(--foreground)]">{label}</span>
            <span className="text-xs text-[var(--text-muted)]">{hint}</span>
          </div>
        )}
      </div>
      {localError && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[var(--negative)] text-xs font-medium">
          <AlertCircle className="w-3.5 h-3.5" />
          {localError}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Uploaded File Row Component
// ──────────────────────────────────────────────────────────────

function UploadedFileRow({
  fileName,
  count,
  countLabel,
  accentColor,
  onRemove,
}: {
  fileName: string;
  count: number;
  countLabel: string;
  accentColor: string;
  onRemove: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-lg px-3 py-2 border"
      style={{
        borderColor: `${accentColor}40`,
        backgroundColor: `${accentColor}12`,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: accentColor }} />
        <span className="text-xs text-[var(--foreground)] font-medium truncate max-w-[200px]">{fileName}</span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
          style={{ color: accentColor, backgroundColor: `${accentColor}20` }}
        >
          {count} {countLabel}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-[var(--text-subtle)] hover:text-red-400 ml-2 shrink-0 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Section Block
// ──────────────────────────────────────────────────────────────

function SectionBlock({
  icon,
  label,
  hint,
  optional,
  accentColor,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  optional?: boolean;
  accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span style={{ color: accentColor }}>{icon}</span>
          <span className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wide">{label}</span>
          {optional && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md border border-[var(--border-subtle)] text-[var(--text-subtle)] font-medium">
              Opsional
            </span>
          )}
        </div>
        {hint && <span className="text-[10px] text-[var(--text-subtle)] shrink-0">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Step 1 — Marketplace + Store + Period selection
// ──────────────────────────────────────────────────────────────

interface Step1Props {
  selectedMarketplace: MarketplaceId | null;
  onSelectMarketplace: (mp: MarketplaceId) => void;
  selectedStoreId: string | null;
  onSelectStore: (id: string) => void;
  selectedMonth: string | null;
  onSelectMonth: (ym: string) => void;
  onNext: () => void;
}

function Step1({
  selectedMarketplace,
  onSelectMarketplace,
  selectedStoreId,
  onSelectStore,
  selectedMonth,
  onNext,
  onSelectMonth,
}: Step1Props) {
  const canProceed = selectedMarketplace !== null && selectedStoreId !== null && selectedMonth !== null;

  return (
    <div className="space-y-5">
      {/* Marketplace cards */}
      <div>
        <p className="text-sm font-semibold text-[var(--foreground)] mb-3">Pilih Marketplace</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {MARKETPLACES.map((mp) => {
            const color = MARKETPLACE_COLORS[mp];
            const label = MARKETPLACE_LABELS[mp];
            const isSelected = selectedMarketplace === mp;
            return (
              <button
                key={mp}
                type="button"
                onClick={() => onSelectMarketplace(mp)}
                className="panel-card text-left transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  padding: "1rem",
                  outline: isSelected ? `2px solid ${color}` : "2px solid transparent",
                  outlineOffset: "2px",
                  boxShadow: isSelected ? `0 10px 30px ${color}20` : "0 0 0 transparent",
                  background: isSelected ? `linear-gradient(135deg, ${color}10, var(--surface))` : "var(--surface)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {label.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-[var(--foreground)]">{label}</p>
                    <p className="text-xs text-[var(--text-subtle)] mt-0.5">
                      {mp === "tokopedia" ? "Tokopedia + TikTok Shop" : mp === "shopee" ? "Shopee Seller Center" : "Lazada Seller Center"}
                    </p>
                  </div>
                  {isSelected && (
                    <CheckCircle className="w-4 h-4 ml-auto shrink-0" style={{ color }} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Store + Month (visible once marketplace is selected) */}
      {selectedMarketplace && (
        <div className="panel-card p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div
            className="h-1.5 rounded-full mb-4 -mx-4 -mt-4 animate-in slide-in-from-left duration-500"
            style={{ backgroundColor: MARKETPLACE_COLORS[selectedMarketplace] }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">
                Toko
              </label>
              <StorePicker
                marketplace={selectedMarketplace}
                value={selectedStoreId}
                onChange={onSelectStore}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wide">
                Periode Upload
              </label>
              <MonthPicker
                value={selectedMonth}
                onChange={onSelectMonth}
              />
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="action-primary inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:gap-3 disabled:hover:gap-2"
        >
          Lanjut ke Upload
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Step 2 — File upload zones
// ──────────────────────────────────────────────────────────────

interface Step2Props {
  marketplace: MarketplaceId;
  storeId: string;
  storeName: string;
  periodYear: number;
  periodMonth: number;
  slots: UploadSlots;
  onSlotUpdate: (key: SlotKey, update: Partial<SlotState>) => void;
  onBack: () => void;
}

function Step2({
  marketplace,
  storeId,
  storeName,
  periodYear,
  periodMonth,
  slots,
  onSlotUpdate,
  onBack,
}: Step2Props) {
  const router = useRouter();
  const color = MARKETPLACE_COLORS[marketplace];
  const label = MARKETPLACE_LABELS[marketplace];

  const monthLabel = new Date(periodYear, periodMonth - 1).toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });

  async function uploadFile(file: File, fileType: FileType, slotKey: SlotKey) {
    onSlotUpdate(slotKey, { status: "uploading", error: undefined });
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("storeId", storeId);
      formData.append("marketplace", marketplace);
      formData.append("periodYear", String(periodYear));
      formData.append("periodMonth", String(periodMonth));
      formData.append("fileType", fileType);
      formData.append("replace", "true");

      const res = await fetch("/api/monthly-uploads", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { id: string; rawRowCount: number };
      onSlotUpdate(slotKey, {
        status: "success",
        fileName: file.name,
        rowCount: data.rawRowCount,
        uploadId: data.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onSlotUpdate(slotKey, { status: "error", error: msg });
    }
  }

  function clearSlot(key: SlotKey) {
    onSlotUpdate(key, { status: "idle", fileName: undefined, rowCount: undefined, error: undefined, uploadId: undefined });
  }

  function renderSlot(
    slotKey: SlotKey,
    fileType: FileType,
    dropLabel: string,
    countLabel: string,
    accentColor: string
  ) {
    const slot = slots[slotKey];
    if (slot.status === "success" && slot.fileName) {
      return (
        <UploadedFileRow
          fileName={slot.fileName}
          count={slot.rowCount ?? 0}
          countLabel={countLabel}
          accentColor={accentColor}
          onRemove={() => clearSlot(slotKey)}
        />
      );
    }
    return (
      <div>
        <DropZone
          onFile={(file) => uploadFile(file, fileType, slotKey)}
          label={dropLabel}
          hint="CSV / XLSX"
          uploading={slot.status === "uploading"}
        />
        {slot.status === "error" && slot.error && (
          <div className="mt-1 flex items-center gap-1 text-red-500 text-xs">
            <AlertCircle className="w-3 h-3" />
            {slot.error}
          </div>
        )}
      </div>
    );
  }

  const anySuccess = Object.values(slots).some((s) => s.status === "success");

  return (
    <div className="space-y-4">
      {/* Context badge */}
      <div className="panel-card p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="h-1.5 rounded-full -mx-4 -mt-4 mb-4 animate-in slide-in-from-left duration-500" style={{ backgroundColor: color }} />
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
              style={{ backgroundColor: color }}
            >
              {label.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-sm text-[var(--foreground)]">
                {label} &middot; {storeName}
              </p>
              <p className="text-xs text-[var(--text-subtle)] mt-0.5">{monthLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-subtle)] hover:text-[var(--foreground)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Ganti Toko
          </button>
        </div>
      </div>

      {/* File zones */}
      <div className="space-y-3">
        {/* Pesanan Selesai — 2 slots */}
        <SectionBlock
          icon={<ShoppingBag className="w-3.5 h-3.5" />}
          label="Pesanan Selesai"
          hint="Bulan ini wajib · bulan lalu opsional"
          accentColor={color}
        >
          <div className="space-y-2">
            {renderSlot("order_prev", "order", "Bulan Lalu (Opsional)", "pesanan", color)}
            {renderSlot("order_curr", "order", "Bulan Ini", "pesanan", color)}
          </div>
        </SectionBlock>

        {/* Transaksi Pendapatan */}
        <SectionBlock
          icon={<Receipt className="w-3.5 h-3.5" />}
          label="Transaksi Pendapatan"
          hint="Bulan yang dihitung"
          accentColor="#10b981"
        >
          <div className="space-y-1">
            {renderSlot("income", "income", "Upload Transaksi Pendapatan", "transaksi", "#10b981")}
            {slots.income.status === "idle" && (
              <p className="text-[10px] text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                Tanpa file ini, fee platform dihitung dari estimasi — kurang akurat
              </p>
            )}
          </div>
        </SectionBlock>

        {/* Retur TikTok — Tokopedia only */}
        {marketplace === "tokopedia" && (
          <SectionBlock
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            label="Pesanan Retur TikTok"
            optional
            accentColor="#f97316"
          >
            {renderSlot("return", "return", "Upload Pesanan Retur", "retur", "#f97316")}
          </SectionBlock>
        )}

        {/* Pesanan Cancel */}
        <SectionBlock
          icon={<X className="w-3.5 h-3.5" />}
          label="Pesanan Cancel"
          optional
          accentColor="#f59e0b"
        >
          {renderSlot("cancel", "cancel", "Upload Pesanan Cancel", "cancel", "#f59e0b")}
        </SectionBlock>

        {/* Failed Delivery — Shopee only */}
        {marketplace === "shopee" && (
          <SectionBlock
            icon={<TruckIcon className="w-3.5 h-3.5" />}
            label="Pesanan Failed Delivery"
            optional
            accentColor="#f43f5e"
          >
            {renderSlot("failed", "failed", "Upload Pesanan Failed Delivery", "gagal kirim", "#f43f5e")}
          </SectionBlock>
        )}
      </div>

      {/* End state CTAs */}
      <div className="panel-card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--foreground)]">
            {anySuccess
              ? "File berhasil diunggah ke Bank Data"
              : "Upload file marketplace di atas untuk mulai"}
          </p>
          <p className="text-xs text-[var(--text-subtle)] mt-0.5">
            File tersimpan permanen dan bisa dilihat kapan saja di Bank Data
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={!anySuccess}
            onClick={() =>
              router.push(`/reports/new?storeId=${storeId}&year=${periodYear}&month=${periodMonth}`)
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-soft)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Kalkulasi Sekarang
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <Link
            href="/data-bank"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg action-primary text-sm font-semibold transition-colors"
          >
            <Database className="w-3.5 h-3.5" />
            Lihat Data Bank
          </Link>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────────────────

type Step = 1 | 2;

export default function UploadPage() {
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [selectedMarketplace, setSelectedMarketplace] = useState<MarketplaceId | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedStoreName, setSelectedStoreName] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  // Step 2 state (upload slots, reset on each step 1 → 2 transition)
  const [slots, setSlots] = useState<UploadSlots>(EMPTY_SLOTS);

  // Store list is managed inside StorePicker but we need the name for display.
  // We track it via a parallel lookup when storeId changes.
  // StorePicker calls onChange(storeId) — we fetch name from API.
  async function handleStoreChange(storeId: string) {
    setSelectedStoreId(storeId);
    // Fetch store name for display in step 2 header
    try {
      const res = await fetch(`/api/stores/${storeId}`);
      if (res.ok) {
        const data = await res.json() as { store: { storeName: string } };
        setSelectedStoreName(data.store.storeName);
      }
    } catch {
      setSelectedStoreName(storeId);
    }
  }

  function handleMarketplaceSelect(mp: MarketplaceId) {
    if (mp !== selectedMarketplace) {
      setSelectedMarketplace(mp);
      setSelectedStoreId(null);
      setSelectedStoreName("");
    }
  }

  function goToStep2() {
    if (!selectedMarketplace || !selectedStoreId || !selectedMonth) return;
    setSlots(EMPTY_SLOTS);
    setStep(2);
  }

  function goBackToStep1() {
    setStep(1);
    setSlots(EMPTY_SLOTS);
  }

  function updateSlot(key: SlotKey, update: Partial<SlotState>) {
    setSlots((prev) => ({ ...prev, [key]: { ...prev[key], ...update } }));
  }

  const parsed = parseYearMonth(selectedMonth);
  const step2Context = selectedMarketplace && selectedStoreId && parsed
    ? { marketplace: selectedMarketplace, storeId: selectedStoreId, parsed }
    : null;

  return (
    <AuthAreaLayout>
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6">
        <div className="max-w-3xl mx-auto">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-semibold text-xs transition-all duration-200",
                  step === 1
                    ? "bg-[var(--accent)] text-[var(--background)] shadow-lg"
                    : "bg-[var(--positive-bg)] text-[var(--positive)]"
                )}
              >
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all",
                  step === 1 ? "bg-white/20" : "bg-[var(--positive)]/20"
                )}>
                  {step === 1 ? "1" : <CheckCircle className="w-3 h-3" />}
                </span>
                Pilih Toko &amp; Periode
              </span>
            </div>
            <div className={cn(
              "h-0.5 w-8 rounded-full transition-all duration-300",
              step === 2 ? "bg-[var(--accent)]" : "bg-[var(--border-subtle)]"
            )} />
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-semibold text-xs transition-all duration-200",
                  step === 2
                    ? "bg-[var(--accent)] text-[var(--background)] shadow-lg"
                    : "bg-[var(--surface-muted)] text-[var(--text-subtle)]"
                )}
              >
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                  step === 2 ? "bg-white/20" : "bg-[var(--text-subtle)]/10"
                )}>2</span>
                Upload File
              </span>
            </div>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--foreground)] animate-in fade-in slide-in-from-bottom-1 duration-300">
            {step === 1 ? "Pilih Toko & Periode" : "Upload File Marketplace"}
          </h1>
          <p className="text-[var(--text-subtle)] mt-1.5 text-sm animate-in fade-in slide-in-from-bottom-1 duration-300" style={{ animationDelay: "50ms" }}>
            {step === 1
              ? "Pilih marketplace, toko, dan bulan yang ingin diupload datanya."
              : "Seret atau klik zona di bawah untuk mengunggah file export marketplace."}
          </p>
        </div>

        {/* Hint box — step 1 only */}
        {step === 1 && (
          <div className="panel-card-soft p-4 mb-5">
            <p className="text-sm font-medium text-[var(--foreground)] mb-2">Contoh alur pengambilan data</p>
            <div className="grid sm:grid-cols-2 gap-3 text-xs text-[var(--text-subtle)]">
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
        )}

        {/* Step content */}
        {step === 1 ? (
          <Step1
            selectedMarketplace={selectedMarketplace}
            onSelectMarketplace={handleMarketplaceSelect}
            selectedStoreId={selectedStoreId}
            onSelectStore={handleStoreChange}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
            onNext={goToStep2}
          />
        ) : step2Context ? (
          <Step2
            marketplace={step2Context.marketplace}
            storeId={step2Context.storeId}
            storeName={selectedStoreName}
            periodYear={step2Context.parsed.year}
            periodMonth={step2Context.parsed.month}
            slots={slots}
            onSlotUpdate={updateSlot}
            onBack={goBackToStep1}
          />
        ) : (
          <div className="panel-card p-5 text-sm">
            <p className="font-semibold text-[var(--foreground)]">Data Step 2 belum lengkap.</p>
            <p className="text-[var(--text-subtle)] mt-1">Pilih ulang marketplace, toko, dan periode lalu lanjutkan kembali.</p>
            <button
              type="button"
              onClick={goBackToStep1}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-[var(--foreground)] hover:bg-[var(--surface-soft)]"
            >
              <ArrowLeft className="w-4 h-4" />
              Kembali ke Step 1
            </button>
          </div>
        )}
        </div>
      </div>
    </AuthAreaLayout>
  );
}
