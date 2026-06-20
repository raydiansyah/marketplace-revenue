"use client";

import { create } from "zustand";
import type {
  HppEntry,
  RevenueReport,
  SavedStoreReport,
  MarketplaceId,
  ShopeeConfig,
  TokopediaConfig,
  LazadaConfig,
  MarketplaceUploadSet,
  OrderFile,
  IncomeFile,
  ReturnOrderFile,
} from "@/lib/types";
import { MARKETPLACE_LABELS } from "@/lib/types";
import {
  DEFAULT_SHOPEE_CONFIG,
  DEFAULT_TOKOPEDIA_CONFIG,
  DEFAULT_LAZADA_CONFIG,
} from "@/lib/defaults";
import { debouncedFetch } from "@/lib/debounce-fetch";

interface AppStore {
  // ── Ephemeral (session only, never persisted) ──────────────────
  uploadSets: Partial<Record<MarketplaceId, MarketplaceUploadSet>>;
  report: RevenueReport | null;
  reportSource: "computed" | "saved";
  activeSavedReportId: string | null;
  uploadPreviewReport: RevenueReport | null;

  // ── Server-synced ──────────────────────────────────────────────
  savedReports: SavedStoreReport[];
  reportsLoading: boolean;

  hppEntries: HppEntry[];
  hppLoading: boolean;
  hppError: string | null;

  configs: {
    shopee: ShopeeConfig;
    tokopedia: TokopediaConfig;
    lazada: LazadaConfig;
  };
  configsLoading: boolean;

  // ── Upload actions (unchanged) ─────────────────────────────────
  addOrderFile: (marketplace: MarketplaceId, file: OrderFile) => void;
  removeOrderFile: (marketplace: MarketplaceId, fileName: string) => void;
  setOrderFileAt: (marketplace: MarketplaceId, slot: 0 | 1, file: OrderFile | null) => void;
  setCanceledOrderFile: (marketplace: MarketplaceId, file: OrderFile | null) => void;
  setFailedDeliveryFile: (marketplace: MarketplaceId, file: OrderFile | null) => void;
  setIncomeFile: (marketplace: MarketplaceId, file: IncomeFile | null) => void;
  setReturnOrderFile: (marketplace: MarketplaceId, file: ReturnOrderFile | null) => void;
  clearMarketplace: (marketplace: MarketplaceId) => void;
  setReport: (report: RevenueReport | null, source?: "computed" | "saved", savedReportId?: string | null) => void;
  setUploadPreviewReport: (report: RevenueReport | null) => void;

  // ── HPP actions ────────────────────────────────────────────────
  loadHpp: () => Promise<void>;
  setHppEntries: (entries: HppEntry[]) => void;
  addHppEntry: (entry: HppEntry) => void;
  addHppEntryAndSync: (entry: HppEntry) => Promise<boolean>;
  replaceHppEntriesAndSync: (entries: HppEntry[]) => Promise<boolean>;
  syncHpp: (entries: HppEntry[]) => Promise<void>;

  // ── Config actions ─────────────────────────────────────────────
  loadConfigs: () => Promise<void>;
  updateConfig: <T extends MarketplaceId>(
    marketplace: T,
    config: Partial<AppStore["configs"][T]>
  ) => void;
  syncConfig: <T extends MarketplaceId>(
    marketplace: T,
    config: Partial<AppStore["configs"][T]>
  ) => Promise<void>;

  // ── Report actions ─────────────────────────────────────────────
  loadSavedReports: () => Promise<void>;
  saveStoreReport: (payload: {
    storeName: string;
    marketplace: MarketplaceId;
    report: RevenueReport;
  }) => Promise<string | null>;
  updateSavedReportContent: (id: string, report: RevenueReport) => Promise<boolean>;
  renameSavedReport: (id: string, storeName: string) => void;
  deleteSavedReport: (id: string) => void;

  // ── Global ─────────────────────────────────────────────────────
  clearAll: () => void;
}

function ensureSet(
  sets: Partial<Record<MarketplaceId, MarketplaceUploadSet>>,
  marketplace: MarketplaceId
): MarketplaceUploadSet {
  const existing = sets[marketplace];
  if (existing) {
    return {
      marketplace: existing.marketplace,
      orderFiles: existing.orderFiles ?? [],
      incomeFile: existing.incomeFile ?? null,
      returnOrderFile: existing.returnOrderFile ?? null,
      canceledOrderFile: existing.canceledOrderFile ?? null,
      failedDeliveryFile: existing.failedDeliveryFile ?? null,
    };
  }
  return {
    marketplace,
    orderFiles: [],
    incomeFile: null,
    returnOrderFile: null,
    canceledOrderFile: null,
    failedDeliveryFile: null,
  };
}

function normalizeHppEntries(entries: HppEntry[]): HppEntry[] {
  return entries.map((entry) => {
    const sku = String(entry.sku ?? "").trim();
    const productName = String(entry.productName ?? "").trim();
    const masterProductName = String(entry.masterProductName ?? "").trim();
    const masterSku = String(entry.masterSku ?? "").trim();
    const normalizedCost = Number.isFinite(entry.cost) && entry.cost >= 0 ? entry.cost : 0;

    return {
      sku,
      productName: productName || masterProductName || sku || "Tanpa Nama Produk",
      masterProductName: masterProductName || undefined,
      masterSku: masterSku || undefined,
      cost: normalizedCost,
    };
  });
}

function buildReportLabel(input: {
  storeName: string;
  marketplace: MarketplaceId;
  report?: RevenueReport;
}): string {
  const trimmed = input.storeName.trim();
  const totalMarketplaces = input.report?.marketplaces?.length ?? 0;
  if (totalMarketplaces > 1) return trimmed;
  return `${MARKETPLACE_LABELS[input.marketplace]} - ${trimmed}`;
}

export const useAppStore = create<AppStore>()((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────
  uploadSets: {},
  report: null,
  reportSource: "computed",
  activeSavedReportId: null,
  uploadPreviewReport: null,

  savedReports: [],
  reportsLoading: false,

  hppEntries: [],
  hppLoading: false,
  hppError: null,

  configs: {
    shopee: DEFAULT_SHOPEE_CONFIG,
    tokopedia: DEFAULT_TOKOPEDIA_CONFIG,
    lazada: DEFAULT_LAZADA_CONFIG,
  },
  configsLoading: false,

  // ── Upload actions ─────────────────────────────────────────────
  addOrderFile: (marketplace, file) =>
    set((state) => {
      const current = ensureSet(state.uploadSets, marketplace);
      const orderFiles = current.orderFiles.filter((f) => f.fileName !== file.fileName);
      const updated = [...orderFiles, file].slice(-2);
      return { uploadSets: { ...state.uploadSets, [marketplace]: { ...current, orderFiles: updated } } };
    }),

  removeOrderFile: (marketplace, fileName) =>
    set((state) => {
      const current = ensureSet(state.uploadSets, marketplace);
      return {
        uploadSets: {
          ...state.uploadSets,
          [marketplace]: { ...current, orderFiles: current.orderFiles.filter((f) => f.fileName !== fileName) },
        },
      };
    }),

  setOrderFileAt: (marketplace, slot, file) =>
    set((state) => {
      const current = ensureSet(state.uploadSets, marketplace);
      const slotLabel = slot === 0 ? "previous-month" : "current-month";
      const nextFiles = current.orderFiles.filter((f) => f.label !== slotLabel);
      if (file !== null) nextFiles.push({ ...file, label: slotLabel });
      return { uploadSets: { ...state.uploadSets, [marketplace]: { ...current, orderFiles: nextFiles } } };
    }),

  setCanceledOrderFile: (marketplace, file) =>
    set((state) => {
      const current = ensureSet(state.uploadSets, marketplace);
      return { uploadSets: { ...state.uploadSets, [marketplace]: { ...current, canceledOrderFile: file } } };
    }),

  setFailedDeliveryFile: (marketplace, file) =>
    set((state) => {
      const current = ensureSet(state.uploadSets, marketplace);
      return { uploadSets: { ...state.uploadSets, [marketplace]: { ...current, failedDeliveryFile: file } } };
    }),

  setIncomeFile: (marketplace, file) =>
    set((state) => {
      const current = ensureSet(state.uploadSets, marketplace);
      return { uploadSets: { ...state.uploadSets, [marketplace]: { ...current, incomeFile: file } } };
    }),

  setReturnOrderFile: (marketplace, file) =>
    set((state) => {
      const current = ensureSet(state.uploadSets, marketplace);
      return { uploadSets: { ...state.uploadSets, [marketplace]: { ...current, returnOrderFile: file } } };
    }),

  clearMarketplace: (marketplace) =>
    set((state) => {
      const updated = { ...state.uploadSets };
      delete updated[marketplace];
      return { uploadSets: updated };
    }),

  setReport: (report, source = "computed", savedReportId = null) =>
    set({
      report,
      reportSource: source,
      activeSavedReportId: source === "saved" ? savedReportId : null,
    }),
  setUploadPreviewReport: (report) => set({ uploadPreviewReport: report }),

  // ── HPP ────────────────────────────────────────────────────────
  loadHpp: async () => {
    set({ hppLoading: true, hppError: null });
    try {
      const res = await fetch("/api/hpp/master?limit=2000");
      if (res.ok) {
        const data = await res.json();
        const hppEntries: HppEntry[] = (data.entries ?? []).map((e: {
          sku: string; productName: string; masterProductName?: string;
          masterSku?: string; cost: number;
        }) => ({
          sku: e.sku,
          productName: e.productName,
          masterProductName: e.masterProductName,
          masterSku: e.masterSku,
          cost: e.cost,
        }));
        set({ hppEntries, hppError: null });
      } else if (res.status === 401) {
        // Sesi expired/belum tersedia — silent, jangan tampilkan error ke user
        set({ hppError: null });
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      console.error("[loadHpp]", e);
      set({ hppError: "Gagal memuat data HPP" });
    } finally {
      set({ hppLoading: false });
    }
  },

  setHppEntries: (entries) => {
    const normalized = normalizeHppEntries(entries);
    set({ hppEntries: normalized });
    get().syncHpp(normalized).catch(console.error);
  },

  addHppEntry: (entry) => {
    const state = get();
    const skuKey = entry.sku.trim().toLowerCase();
    const nameKey = entry.productName.trim().toLowerCase();
    const idx = state.hppEntries.findIndex((e) => {
      const eSkuKey = e.sku.trim().toLowerCase();
      const eNameKey = e.productName.trim().toLowerCase();
      if (skuKey && eSkuKey) return eSkuKey === skuKey;
      return eNameKey === nameKey;
    });
    const updated = idx >= 0
      ? state.hppEntries.map((e, i) => (i === idx ? entry : e))
      : [...state.hppEntries, entry];
    set({ hppEntries: updated });
    get().syncHpp(updated).catch(console.error);
  },

  addHppEntryAndSync: async (entry) => {
    const currentEntries = get().hppEntries;
    const skuKey = entry.sku.trim().toLowerCase();
    const nameKey = entry.productName.trim().toLowerCase();
    const idx = currentEntries.findIndex((e) => {
      const eSkuKey = e.sku.trim().toLowerCase();
      const eNameKey = e.productName.trim().toLowerCase();
      if (skuKey && eSkuKey) return eSkuKey === skuKey;
      return eNameKey === nameKey;
    });
    const optimisticEntries = idx >= 0
      ? currentEntries.map((e, i) => (i === idx ? entry : e))
      : [...currentEntries, entry];
    return get().replaceHppEntriesAndSync(optimisticEntries);
  },

  replaceHppEntriesAndSync: async (entries) => {
    const previousEntries = get().hppEntries;
    const normalized = normalizeHppEntries(entries);
    set({ hppEntries: normalized, hppError: null });
    try {
      const res = await fetch("/api/hpp/master", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: normalized }),
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error("UNAUTHORIZED");
        throw new Error(`HTTP ${res.status}`);
      }
      await get().loadHpp();
      return true;
    } catch (e) {
      if (e instanceof Error && e.message === "UNAUTHORIZED") {
        set({ hppEntries: previousEntries });
        return false;
      }
      console.error("[replaceHppEntriesAndSync]", e);
      set({ hppEntries: previousEntries, hppError: "Gagal menyimpan data HPP" });
      return false;
    }
  },

  syncHpp: async (entries) => {
    const normalized = normalizeHppEntries(entries);
    set({ hppEntries: normalized });
    debouncedFetch(
      "sync-hpp",
      "/api/hpp/master",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: normalized }),
      },
      500
    );
  },

  // ── Configs ────────────────────────────────────────────────────
  loadConfigs: async () => {
    set({ configsLoading: true });
    try {
      const res = await fetch("/api/configs");
      if (res.ok) {
        const data = await res.json();
        set({ configs: data.configs });
      }
    } catch (e) {
      console.error("[loadConfigs]", e);
    } finally {
      set({ configsLoading: false });
    }
  },

  updateConfig: (marketplace, config) =>
    set((state) => ({
      configs: { ...state.configs, [marketplace]: { ...state.configs[marketplace], ...config } },
    })),

  syncConfig: async (marketplace, config) => {
    const merged = { ...get().configs[marketplace], ...config };
    set((state) => ({
      configs: { ...state.configs, [marketplace]: merged },
    }));
    debouncedFetch(
      `sync-config-${marketplace}`,
      "/api/configs",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplace, config: merged }),
      },
      500
    );
  },

  // ── Saved Reports ──────────────────────────────────────────────
  loadSavedReports: async () => {
    set({ reportsLoading: true });
    try {
      const res = await fetch("/api/reports");
      if (res.ok) {
        const data = await res.json();
        const reports: SavedStoreReport[] = (data.reports ?? []).map(
          (row: { id: string; storeName: string; marketplace: string; label: string; createdAt: string; reportJson: RevenueReport }) => ({
            id: row.id,
            storeName: row.storeName,
            marketplace: row.marketplace as MarketplaceId,
            label: row.label,
            createdAt: row.createdAt,
            report: row.reportJson,
          })
        );
        set({ savedReports: reports });
      }
    } catch (e) {
      console.error("[loadSavedReports]", e);
    } finally {
      set({ reportsLoading: false });
    }
  },

  saveStoreReport: async ({ storeName, marketplace, report }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const label = buildReportLabel({ storeName, marketplace, report });
    const entry: SavedStoreReport = {
      id,
      storeName: storeName.trim(),
      marketplace,
      label,
      createdAt: new Date().toISOString(),
      report,
    };
    // Optimistic
    set((state) => ({ savedReports: [entry, ...state.savedReports] }));
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, storeName: entry.storeName, marketplace, label, reportJson: report }),
      });
      if (!res.ok) {
        set((state) => ({ savedReports: state.savedReports.filter((item) => item.id !== id) }));
        return null;
      }
      return id;
    } catch (e) {
      console.error("[saveStoreReport]", e);
      set((state) => ({ savedReports: state.savedReports.filter((item) => item.id !== id) }));
      return null;
    }
  },

  updateSavedReportContent: async (id, report) => {
    const previous = get().savedReports;
    set((state) => ({
      savedReports: state.savedReports.map((item) => (item.id === id ? { ...item, report } : item)),
    }));
    try {
      const res = await fetch(`/api/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportJson: report }),
      });
      if (!res.ok) {
        set({ savedReports: previous });
        return false;
      }
      return true;
    } catch (e) {
      console.error("[updateSavedReportContent]", e);
      set({ savedReports: previous });
      return false;
    }
  },

  renameSavedReport: (id, storeName) => {
    set((state) => ({
      savedReports: state.savedReports.map((item) => {
        if (item.id !== id) return item;
        const trimmed = storeName.trim();
        const label = buildReportLabel({
          storeName: trimmed,
          marketplace: item.marketplace,
          report: item.report,
        });
        return { ...item, storeName: trimmed, label };
      }),
    }));
    const current = get().savedReports.find((r) => r.id === id);
    const nextLabel = current
      ? buildReportLabel({
          storeName: storeName.trim(),
          marketplace: current.marketplace,
          report: current.report,
        })
      : storeName.trim();
    fetch(`/api/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeName: storeName.trim(),
        label: nextLabel,
      }),
    }).catch(console.error);
  },

  deleteSavedReport: (id) => {
    set((state) => ({ savedReports: state.savedReports.filter((item) => item.id !== id) }));
    fetch(`/api/reports/${id}`, { method: "DELETE" }).catch(console.error);
  },

  clearAll: () => {
    set({
      uploadSets: {},
      hppEntries: [],
      report: null,
      reportSource: "computed",
      activeSavedReportId: null,
      uploadPreviewReport: null,
      savedReports: [],
      configs: {
        shopee: DEFAULT_SHOPEE_CONFIG,
        tokopedia: DEFAULT_TOKOPEDIA_CONFIG,
        lazada: DEFAULT_LAZADA_CONFIG,
      },
    });
  },
}));
