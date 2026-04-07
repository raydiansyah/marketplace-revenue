"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
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
} from "@/lib/types";
import {
  DEFAULT_SHOPEE_CONFIG,
  DEFAULT_TOKOPEDIA_CONFIG,
  DEFAULT_LAZADA_CONFIG,
} from "@/lib/defaults";

interface AppStore {
  uploadSets: Partial<Record<MarketplaceId, MarketplaceUploadSet>>;
  hppEntries: HppEntry[];
  configs: {
    shopee: ShopeeConfig;
    tokopedia: TokopediaConfig;
    lazada: LazadaConfig;
  };
  report: RevenueReport | null;
  savedReports: SavedStoreReport[];

  addOrderFile: (marketplace: MarketplaceId, file: OrderFile) => void;
  removeOrderFile: (marketplace: MarketplaceId, fileName: string) => void;
  setOrderFileAt: (marketplace: MarketplaceId, slot: 0 | 1, file: OrderFile | null) => void;
  setCanceledOrderFile: (marketplace: MarketplaceId, file: OrderFile | null) => void;
  setFailedDeliveryFile: (marketplace: MarketplaceId, file: OrderFile | null) => void;
  setIncomeFile: (marketplace: MarketplaceId, file: IncomeFile | null) => void;
  clearMarketplace: (marketplace: MarketplaceId) => void;

  setHppEntries: (entries: HppEntry[]) => void;
  addHppEntry: (entry: HppEntry) => void;
  updateConfig: <T extends MarketplaceId>(
    marketplace: T,
    config: Partial<AppStore["configs"][T]>
  ) => void;
  setReport: (report: RevenueReport | null) => void;
  saveStoreReport: (payload: {
    storeName: string;
    marketplace: MarketplaceId;
    report: RevenueReport;
  }) => void;
  renameSavedReport: (id: string, storeName: string) => void;
  deleteSavedReport: (id: string) => void;
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
      canceledOrderFile: existing.canceledOrderFile ?? null,
      failedDeliveryFile: existing.failedDeliveryFile ?? null,
    };
  }

  return {
    marketplace,
    orderFiles: [],
    incomeFile: null,
    canceledOrderFile: null,
    failedDeliveryFile: null,
  };
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      uploadSets: {},
      hppEntries: [],
      configs: {
        shopee: DEFAULT_SHOPEE_CONFIG,
        tokopedia: DEFAULT_TOKOPEDIA_CONFIG,
        lazada: DEFAULT_LAZADA_CONFIG,
      },
      report: null,
      savedReports: [],

      addOrderFile: (marketplace, file) =>
        set((state) => {
          const current = ensureSet(state.uploadSets, marketplace);
          // Maksimum 2 file pesanan (bulan lalu + bulan ini)
          const orderFiles = current.orderFiles.filter((f) => f.fileName !== file.fileName);
          const updated = [...orderFiles, file].slice(-2);
          return {
            uploadSets: {
              ...state.uploadSets,
              [marketplace]: { ...current, orderFiles: updated },
            },
          };
        }),

      removeOrderFile: (marketplace, fileName) =>
        set((state) => {
          const current = ensureSet(state.uploadSets, marketplace);
          return {
            uploadSets: {
              ...state.uploadSets,
              [marketplace]: {
                ...current,
                orderFiles: current.orderFiles.filter((f) => f.fileName !== fileName),
              },
            },
          };
        }),

      setOrderFileAt: (marketplace, slot, file) =>
        set((state) => {
          const current = ensureSet(state.uploadSets, marketplace);
          const slotLabel = slot === 0 ? "previous-month" : "current-month";
          const nextFiles = current.orderFiles.filter((f) => f.label !== slotLabel);

          if (file !== null) {
            nextFiles.push({ ...file, label: slotLabel });
          }

          return {
            uploadSets: {
              ...state.uploadSets,
              [marketplace]: {
                ...current,
                orderFiles: nextFiles,
              },
            },
          };
        }),

      setCanceledOrderFile: (marketplace, file) =>
        set((state) => {
          const current = ensureSet(state.uploadSets, marketplace);
          return {
            uploadSets: {
              ...state.uploadSets,
              [marketplace]: { ...current, canceledOrderFile: file },
            },
          };
        }),

      setFailedDeliveryFile: (marketplace, file) =>
        set((state) => {
          const current = ensureSet(state.uploadSets, marketplace);
          return {
            uploadSets: {
              ...state.uploadSets,
              [marketplace]: { ...current, failedDeliveryFile: file },
            },
          };
        }),

      setIncomeFile: (marketplace, file) =>
        set((state) => {
          const current = ensureSet(state.uploadSets, marketplace);
          return {
            uploadSets: {
              ...state.uploadSets,
              [marketplace]: { ...current, incomeFile: file },
            },
          };
        }),

      clearMarketplace: (marketplace) =>
        set((state) => {
          const updated = { ...state.uploadSets };
          delete updated[marketplace];
          return { uploadSets: updated };
        }),

      setHppEntries: (entries) => set({ hppEntries: entries }),

      addHppEntry: (entry) =>
        set((state) => {
          const existing = state.hppEntries.findIndex(
            (e) => e.sku.toLowerCase() === entry.sku.toLowerCase()
          );
          if (existing >= 0) {
            const updated = [...state.hppEntries];
            updated[existing] = entry;
            return { hppEntries: updated };
          }
          return { hppEntries: [...state.hppEntries, entry] };
        }),

      updateConfig: (marketplace, config) =>
        set((state) => ({
          configs: {
            ...state.configs,
            [marketplace]: { ...state.configs[marketplace], ...config },
          },
        })),

      setReport: (report) => set({ report }),

      saveStoreReport: ({ storeName, marketplace, report }) =>
        set((state) => {
          const label = `${marketplace === "tokopedia" ? "Tokopedia/TikTok" : marketplace[0].toUpperCase() + marketplace.slice(1)} - ${storeName.trim()}`;
          const entry: SavedStoreReport = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            storeName: storeName.trim(),
            marketplace,
            label,
            createdAt: new Date().toISOString(),
            report,
          };
          return { savedReports: [entry, ...state.savedReports] };
        }),

      renameSavedReport: (id, storeName) =>
        set((state) => ({
          savedReports: state.savedReports.map((item) => {
            if (item.id !== id) return item;
            const trimmedStoreName = storeName.trim();
            const marketplaceLabel =
              item.marketplace === "tokopedia"
                ? "Tokopedia/TikTok"
                : item.marketplace[0].toUpperCase() + item.marketplace.slice(1);
            return {
              ...item,
              storeName: trimmedStoreName,
              label: `${marketplaceLabel} - ${trimmedStoreName}`,
            };
          }),
        })),

      deleteSavedReport: (id) =>
        set((state) => ({
          savedReports: state.savedReports.filter((item) => item.id !== id),
        })),

      clearAll: () =>
        set({
          uploadSets: {},
          hppEntries: [],
          report: null,
          savedReports: [],
        }),
    }),
    {
      name: "marketplace-revenue-store",
      version: 4,
      migrate: (persistedState: unknown, version) => {
        const state = (persistedState ?? {}) as {
          hppEntries?: HppEntry[];
          savedReports?: SavedStoreReport[];
          configs?: Partial<AppStore["configs"]> & {
            tiktokshop?: {
              commissionRate: number;
              dynamicCommissionRate: number;
              dynamicCommissionMax: number;
              orderProcessingFee: number;
              affiliateRate: number;
            };
          };
        };

        if (version < 3 && state.configs?.tiktokshop) {
          const legacyTiktok = state.configs.tiktokshop;
          const currentTokopedia = state.configs.tokopedia ?? DEFAULT_TOKOPEDIA_CONFIG;

          state.configs = {
            shopee: state.configs.shopee ?? DEFAULT_SHOPEE_CONFIG,
            lazada: state.configs.lazada ?? DEFAULT_LAZADA_CONFIG,
            tokopedia: {
              ...currentTokopedia,
              commissionRate: legacyTiktok.commissionRate,
              dynamicCommissionRate: legacyTiktok.dynamicCommissionRate,
              dynamicCommissionMax: legacyTiktok.dynamicCommissionMax,
              orderProcessingFee: legacyTiktok.orderProcessingFee,
              affiliateRate: legacyTiktok.affiliateRate,
            },
          };
        } else if (version < 3 && state.configs) {
          state.configs = {
            shopee: state.configs.shopee ?? DEFAULT_SHOPEE_CONFIG,
            tokopedia: state.configs.tokopedia ?? DEFAULT_TOKOPEDIA_CONFIG,
            lazada: state.configs.lazada ?? DEFAULT_LAZADA_CONFIG,
          };
        }

        if (version < 4) {
          state.savedReports = state.savedReports ?? [];
        }

        return state as AppStore;
      },
      partialize: (state) => ({
        hppEntries: state.hppEntries,
        configs: state.configs,
        savedReports: state.savedReports,
      }),
    }
  )
);
