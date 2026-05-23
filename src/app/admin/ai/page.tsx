/**
 * Module: Admin AI Providers Page
 * Purpose: Superadmin UI for managing global AI provider configurations
 * Used by: /admin/ai route, AppSidebar (superadmin section)
 * Dependencies: useAuth, useNotification, AuthAreaLayout, lucide-react
 * Public functions: AdminAiPage (default export)
 * Side effects: API calls to /api/admin/ai-providers (GET, POST, PATCH, DELETE, test, models)
 */

"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import AuthAreaLayout from "@/components/AuthAreaLayout";
import { useNotification } from "@/lib/notifications/notification-context";
import {
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  Zap,
  ChevronDown,
} from "lucide-react";
import type { AiProviderInfo, AiProvider } from "@/lib/types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TestResult {
  ok: boolean;
  latencyMs?: number;
  response?: string;
  error?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminAiPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { notify } = useNotification();

  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formProvider, setFormProvider] = useState<AiProvider>("anthropic");
  const [formLabel, setFormLabel] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formModel, setFormModel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Per-provider UI state
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [modelsMap, setModelsMap] = useState<Record<string, string[]>>({});
  const [loadingModelsId, setLoadingModelsId] = useState<string | null>(null);
  const [showModelsId, setShowModelsId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Guard: superadmin only
  useEffect(() => {
    if (!authLoading && user?.role !== "superadmin") {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  // Load providers
  useEffect(() => {
    if (user?.role !== "superadmin") return;
    fetch("/api/admin/ai-providers")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "Gagal memuat provider");
        return d;
      })
      .then((d) => setProviders(d.providers ?? []))
      .catch((e: unknown) => notify("error", e instanceof Error ? e.message : "Error"))
      .finally(() => setFetching(false));
  }, [user, notify]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/ai-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: formProvider,
          label: formLabel,
          baseUrl: formProvider === "openai" && formBaseUrl ? formBaseUrl : undefined,
          apiKey: formApiKey,
          defaultModel: formModel || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Gagal menambah provider");
        return;
      }
      notify("success", "Provider berhasil ditambahkan.");
      // Reload list
      setProviders([]);
      setFetching(true);
      fetch("/api/admin/ai-providers")
        .then((r) => r.json())
        .then((d) => setProviders(d.providers ?? []))
        .finally(() => setFetching(false));
      setShowForm(false);
      setFormLabel("");
      setFormApiKey("");
      setFormModel("");
      setFormBaseUrl("");
    } catch {
      setFormError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleActive(provider: AiProviderInfo) {
    setTogglingId(provider.id);
    try {
      const res = await fetch(`/api/admin/ai-providers/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !provider.isActive }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        notify("error", d?.error ?? "Gagal mengubah status");
        return;
      }
      setProviders((prev) =>
        prev.map((p) =>
          p.id === provider.id ? { ...p, isActive: !provider.isActive } : p
        )
      );
      notify("success", `Provider ${!provider.isActive ? "diaktifkan" : "dinonaktifkan"}.`);
    } catch {
      notify("error", "Terjadi kesalahan.");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    setTestResults((prev) => ({ ...prev, [id]: { ok: false } }));
    try {
      const res = await fetch(`/api/admin/ai-providers/${id}/test`, { method: "POST" });
      const data = (await res.json()) as TestResult;
      setTestResults((prev) => ({ ...prev, [id]: data }));
      if (data.ok) {
        notify("success", `Test berhasil! Latency: ${data.latencyMs}ms`);
        // Refresh lastTestAt
        setProviders((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, lastTestAt: new Date().toISOString() } : p
          )
        );
      } else {
        notify("warning", `Test gagal: ${data.error}`);
      }
    } catch {
      notify("error", "Gagal menghubungi provider.");
    } finally {
      setTestingId(null);
    }
  }

  async function handleLoadModels(id: string) {
    if (modelsMap[id]) {
      setShowModelsId((prev) => (prev === id ? null : id));
      return;
    }
    setLoadingModelsId(id);
    try {
      const res = await fetch(`/api/admin/ai-providers/${id}/models`);
      const data = (await res.json()) as { models?: string[]; error?: string };
      if (!res.ok) {
        notify("error", data.error ?? "Gagal memuat models");
        return;
      }
      setModelsMap((prev) => ({ ...prev, [id]: data.models ?? [] }));
      setShowModelsId(id);
    } catch {
      notify("error", "Gagal memuat daftar model.");
    } finally {
      setLoadingModelsId(null);
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!window.confirm(`Hapus provider "${label}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/ai-providers/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        notify("error", d?.error ?? "Gagal menghapus provider");
        return;
      }
      setProviders((prev) => prev.filter((p) => p.id !== id));
      notify("success", `Provider "${label}" dihapus.`);
    } catch {
      notify("error", "Terjadi kesalahan saat menghapus.");
    } finally {
      setDeletingId(null);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (authLoading || user?.role !== "superadmin") return null;

  const providerBadge: Record<AiProvider, string> = {
    anthropic: "bg-orange-100 text-orange-700",
    openai: "bg-emerald-100 text-emerald-700",
  };

  return (
    <AuthAreaLayout contentClassName="p-6">
      <div className="max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Manajemen AI Providers</h1>
            <p className="text-sm text-[var(--text-subtle)] mt-0.5">
              Kelola provider AI yang digunakan untuk analisa laporan
            </p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 action-primary text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Tambah Provider
          </button>
        </div>

        {/* Add Provider Form */}
        {showForm && (
          <div className="panel-card p-5 mb-6">
            <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">
              Tambah AI Provider Baru
            </h2>
            <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Provider</label>
                <select
                  value={formProvider}
                  onChange={(e) => setFormProvider(e.target.value as AiProvider)}
                  className="field-input"
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI / Compatible</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Label</label>
                <input
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  required
                  className="field-input"
                  placeholder="Contoh: Production Claude"
                />
              </div>
              {formProvider === "openai" && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Base URL (opsional, untuk provider kompatibel OpenAI)
                  </label>
                  <input
                    value={formBaseUrl}
                    onChange={(e) => setFormBaseUrl(e.target.value)}
                    className="field-input"
                    placeholder="https://api.openai.com"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">API Key</label>
                <input
                  type="password"
                  value={formApiKey}
                  onChange={(e) => setFormApiKey(e.target.value)}
                  required
                  className="field-input"
                  placeholder="sk-..."
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Default Model (opsional)
                </label>
                <input
                  value={formModel}
                  onChange={(e) => setFormModel(e.target.value)}
                  className="field-input"
                  placeholder={
                    formProvider === "anthropic"
                      ? "claude-haiku-4-5-20251001"
                      : "gpt-4o-mini"
                  }
                />
              </div>

              {formError && (
                <div className="sm:col-span-2">
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {formError}
                  </p>
                </div>
              )}

              <div className="sm:col-span-2 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-[var(--text-subtle)] hover:bg-[var(--surface-soft)] rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold action-primary disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Simpan
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Providers List */}
        {fetching ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : providers.length === 0 ? (
          <div className="panel-card p-8 text-center">
            <p className="text-sm text-slate-500">Belum ada AI provider yang dikonfigurasi.</p>
            <p className="text-xs text-slate-400 mt-1">
              Tambah provider untuk mengaktifkan fitur AI insights.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map((p) => (
              <div key={p.id} className="panel-card p-4">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${providerBadge[p.provider]}`}
                      >
                        {p.provider === "anthropic" ? "Anthropic" : "OpenAI"}
                      </span>
                      <span className="font-semibold text-[var(--foreground)] text-sm truncate">
                        {p.label}
                      </span>
                      {/* Active dot */}
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          p.isActive ? "bg-green-500" : "bg-slate-300"
                        }`}
                        title={p.isActive ? "Aktif" : "Nonaktif"}
                      />
                    </div>
                    {p.defaultModel && (
                      <p className="text-xs text-slate-500">Model: {p.defaultModel}</p>
                    )}
                    {p.lastTestAt && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Test terakhir:{" "}
                        {new Date(p.lastTestAt).toLocaleString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    )}
                    {/* Test result inline */}
                    {testResults[p.id] && (
                      <div
                        className={`mt-2 text-xs rounded-md px-2.5 py-1.5 inline-flex items-center gap-1.5 ${
                          testResults[p.id].ok
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-600"
                        }`}
                      >
                        {testResults[p.id].ok ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {testResults[p.id].latencyMs}ms — &ldquo;{testResults[p.id].response}&rdquo;
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" />
                            {testResults[p.id].error}
                          </>
                        )}
                      </div>
                    )}
                    {/* Models dropdown */}
                    {showModelsId === p.id && modelsMap[p.id] && (
                      <div className="mt-2 bg-slate-50 border border-slate-100 rounded-lg p-2 max-h-40 overflow-y-auto">
                        {modelsMap[p.id].length === 0 ? (
                          <p className="text-xs text-slate-400">Tidak ada model tersedia.</p>
                        ) : (
                          <ul className="space-y-0.5">
                            {modelsMap[p.id].map((m) => (
                              <li key={m} className="text-xs text-slate-600 font-mono">
                                {m}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Toggle active */}
                    <button
                      onClick={() => handleToggleActive(p)}
                      disabled={togglingId === p.id}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                        p.isActive
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      } disabled:opacity-50`}
                      title={p.isActive ? "Klik untuk nonaktifkan" : "Klik untuk aktifkan"}
                    >
                      {togglingId === p.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : p.isActive ? (
                        "Aktif"
                      ) : (
                        "Nonaktif"
                      )}
                    </button>

                    {/* Test */}
                    <button
                      onClick={() => handleTest(p.id)}
                      disabled={testingId === p.id}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Test koneksi"
                    >
                      {testingId === p.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Zap className="w-4 h-4" />
                      )}
                    </button>

                    {/* Models */}
                    <button
                      onClick={() => handleLoadModels(p.id)}
                      disabled={loadingModelsId === p.id}
                      className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Lihat daftar model"
                    >
                      {loadingModelsId === p.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(p.id, p.label)}
                      disabled={deletingId === p.id}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Hapus provider"
                    >
                      {deletingId === p.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AuthAreaLayout>
  );
}
