/**
 * Module: HppUnmatchedPanel
 * Purpose: Panel for manually mapping unmatched order SKUs to master HPP entries
 * Used by: src/components/HppMasterManager.tsx
 * Dependencies: /api/hpp/master/resolve, lucide-react, formatRupiah
 * Public functions: HppUnmatchedPanel (default export)
 * Side effects: POST /api/hpp/master/resolve for each resolved mapping
 */

"use client";

import { useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import type { HppEntry } from "@/lib/types";

interface Props {
  unmatchedSkus: string[];
  masterEntries: Array<HppEntry & { id: string }>;
  onResolve: (orderSku: string, masterEntryId: string) => Promise<void>;
  onDismiss: () => void;
}

export default function HppUnmatchedPanel({ unmatchedSkus, masterEntries, onResolve, onDismiss }: Props) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  async function handleSave(orderSku: string) {
    const masterEntryId = selections[orderSku];
    if (!masterEntryId) return;
    setSaving((prev) => ({ ...prev, [orderSku]: true }));
    try {
      await onResolve(orderSku, masterEntryId);
      setSaved((prev) => ({ ...prev, [orderSku]: true }));
    } finally {
      setSaving((prev) => ({ ...prev, [orderSku]: false }));
    }
  }

  const pending = unmatchedSkus.filter((sku) => !saved[sku]);

  if (pending.length === 0) return null;

  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-yellow-300">
            {pending.length} SKU dari riwayat order tidak ditemukan di HPP master
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-yellow-400/60 hover:text-yellow-300 shrink-0"
          title="Tutup panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        {pending.map((orderSku) => (
          <div key={orderSku} className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-yellow-200 bg-yellow-900/40 px-2 py-1 rounded shrink-0">
              {orderSku}
            </span>
            <span className="text-xs text-yellow-400/60 shrink-0">→</span>
            <select
              value={selections[orderSku] ?? ""}
              onChange={(e) =>
                setSelections((prev) => ({ ...prev, [orderSku]: e.target.value }))
              }
              className="flex-1 min-w-[200px] text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-zinc-200 focus:outline-none focus:border-zinc-400"
            >
              <option value="">— Pilih produk master —</option>
              {masterEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.productName} ({entry.sku}) — {formatRupiah(entry.cost)}
                </option>
              ))}
            </select>
            <button
              onClick={() => handleSave(orderSku)}
              disabled={!selections[orderSku] || saving[orderSku]}
              className="text-xs px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed rounded text-white font-medium shrink-0 flex items-center gap-1"
            >
              {saving[orderSku] ? (
                <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Simpan
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
