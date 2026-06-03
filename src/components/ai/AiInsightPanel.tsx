/**
 * Module: AiInsightPanel
 * Purpose: Per-report AI insight panel with 4 quick-action buttons and markdown display
 * Used by: report detail pages (src/app/reports/[id]/page.tsx or dashboard)
 * Dependencies: /api/ai/status, /api/ai/insights
 * Public functions: AiInsightPanel (default export)
 * Side effects: Fetch /api/ai/status on mount; POST /api/ai/insights on user action
 */

"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, AlertCircle, Info } from "lucide-react";
import type { AiInsightKind } from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AiStatusResponse {
  available: boolean;
  providerLabel?: string;
  model?: string | null;
}

interface InsightButton {
  kind: AiInsightKind;
  label: string;
  description: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const INSIGHT_BUTTONS: InsightButton[] = [
  {
    kind: "revenue",
    label: "Ringkasan Revenue",
    description: "3-5 insight dari data penjualan",
  },
  {
    kind: "ads-roas",
    label: "Rekomendasi Iklan",
    description: "Alokasi anggaran iklan optimal",
  },
  {
    kind: "fee-anomaly",
    label: "Anomali Fee",
    description: "Biaya platform yang tidak wajar",
  },
  {
    kind: "hpp-margin",
    label: "Margin HPP",
    description: "SKU dengan margin negatif",
  },
];

// ─── Markdown renderer ───────────────────────────────────────────────────────
// Simple renderer: render markdown as styled HTML without external libraries.

function renderMarkdown(md: string): string {
  return md
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold mt-4 mb-1 text-[var(--foreground)]">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-bold mt-5 mb-2 text-[var(--foreground)]">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold mt-5 mb-2 text-[var(--foreground)]">$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Bullets
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm text-[var(--foreground)]">$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (m) => `<ul class="my-1 space-y-0.5">${m}</ul>`)
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm text-[var(--foreground)]">$1</li>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="my-3 border-slate-200" />')
    // Paragraphs (blank lines)
    .replace(/\n\n+/g, '</p><p class="text-sm text-[var(--foreground)] leading-relaxed my-2">')
    // Wrap all in a paragraph
    .replace(/^(.+)$/, '<p class="text-sm text-[var(--foreground)] leading-relaxed my-2">$1');
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  reportId: string;
}

export default function AiInsightPanel({ reportId }: Props) {
  const [status, setStatus] = useState<AiStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [selectedKind, setSelectedKind] = useState<AiInsightKind | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [model, setModel] = useState<string>("");

  // Fetch AI availability on mount
  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d: AiStatusResponse) => setStatus(d))
      .catch(() => setStatus({ available: false }))
      .finally(() => setStatusLoading(false));
  }, []);

  async function handleInsight(kind: AiInsightKind) {
    setSelectedKind(kind);
    setMarkdown("");
    setError("");
    setModel("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, kind }),
      });
      const data = (await res.json()) as {
        markdown?: string;
        model?: string;
        tokensIn?: number;
        tokensOut?: number;
        error?: string;
      };

      if (!res.ok) {
        setError(data.error ?? "Terjadi kesalahan saat memanggil AI.");
        return;
      }

      setMarkdown(data.markdown ?? "");
      setModel(data.model ?? "");
    } catch {
      setError("Gagal menghubungi server. Periksa koneksi internet.");
    } finally {
      setLoading(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!status?.available) {
    return (
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          AI belum dikonfigurasi. Hubungi superadmin untuk mengatur AI provider.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Provider info */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Sparkles className="w-3.5 h-3.5 text-purple-500" />
        <span>
          {status.providerLabel ?? "AI"}
          {status.model ? ` · ${status.model}` : ""}
        </span>
      </div>

      {/* Quick-action buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {INSIGHT_BUTTONS.map(({ kind, label, description }) => (
          <button
            key={kind}
            onClick={() => handleInsight(kind)}
            disabled={loading}
            className={`p-3 text-left rounded-xl border transition-all disabled:opacity-60 ${
              selectedKind === kind
                ? "border-purple-300 bg-purple-50 text-purple-800"
                : "border-slate-200 hover:border-purple-200 hover:bg-purple-50 text-slate-700"
            }`}
          >
            <p className="text-xs font-semibold leading-tight">{label}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{description}</p>
          </button>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Menganalisa...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Markdown output */}
      {markdown && !loading && (
        <div className="panel-card p-4 overflow-auto">
          {model && (
            <p className="text-[11px] text-slate-400 mb-3 text-right">Model: {model}</p>
          )}
          <div
            className="ai-prose"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
          />
        </div>
      )}
    </div>
  );
}
