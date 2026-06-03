/**
 * Module: Admin AI Management Page
 * Purpose: Superadmin UI — tabbed interface for AI Providers, Persona Agent, and Knowledge Base (RAG)
 * Used by: /admin/ai route, AppSidebar (superadmin section)
 * Dependencies: useAuth, useNotification, AuthAreaLayout, lucide-react
 * Public functions: AdminAiPage (default export)
 * Side effects:
 *   - Providers tab: /api/admin/ai-providers (GET, POST, PATCH, DELETE, test, models)
 *   - Persona tab: /api/admin/ai/personas (GET, POST, PATCH, DELETE)
 *   - Knowledge Base tab: /api/admin/ai/rag (GET), /api/admin/ai/rag/upload (POST), /api/admin/ai/rag/[id] (DELETE), /api/admin/ai/rag/search (GET)
 */

"use client";

import { useEffect, useState, useRef, FormEvent } from "react";
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
  Upload,
  Search,
  Star,
  Pencil,
  X,
} from "lucide-react";
import type { AiProviderInfo, AiProvider, AiAgentPersona, RagDocument } from "@/lib/types";

// ─── Local Types ──────────────────────────────────────────────────────────────

interface TestResult {
  ok: boolean;
  latencyMs?: number;
  response?: string;
  error?: string;
}

type Tab = "providers" | "personas" | "knowledge";

const TONE_LABELS: Record<AiAgentPersona["tone"], string> = {
  formal: "Formal",
  casual: "Kasual",
  expert: "Expert",
  friendly: "Ramah",
};

const TONE_BADGE_COLORS: Record<AiAgentPersona["tone"], string> = {
  formal: "bg-blue-100 text-blue-700",
  casual: "bg-yellow-100 text-yellow-700",
  expert: "bg-purple-100 text-purple-700",
  friendly: "bg-green-100 text-green-700",
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminAiPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { notify } = useNotification();

  const [activeTab, setActiveTab] = useState<Tab>("providers");

  // Guard: superadmin only
  useEffect(() => {
    if (!authLoading && user?.role !== "superadmin") {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  if (authLoading || user?.role !== "superadmin") return null;

  return (
    <AuthAreaLayout contentClassName="p-6">
      <div className="max-w-4xl">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[var(--foreground)]">Manajemen AI</h1>
          <p className="text-sm text-[var(--text-subtle)] mt-0.5">
            Kelola provider, persona agent, dan knowledge base untuk fitur AI
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[var(--border-subtle)]">
          {(
            [
              { key: "providers", label: "Providers" },
              { key: "personas", label: "Persona Agent" },
              { key: "knowledge", label: "Knowledge Base" },
            ] as Array<{ key: Tab; label: string }>
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--text-subtle)] hover:text-[var(--foreground)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Panels */}
        {activeTab === "providers" && <ProvidersTab notify={notify} />}
        {activeTab === "personas" && <PersonasTab notify={notify} />}
        {activeTab === "knowledge" && <KnowledgeBaseTab notify={notify} />}
      </div>
    </AuthAreaLayout>
  );
}

// ─── Providers Tab ────────────────────────────────────────────────────────────

function ProvidersTab({ notify }: { notify: ReturnType<typeof useNotification>["notify"] }) {
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [formProvider, setFormProvider] = useState<AiProvider>("anthropic");
  const [formLabel, setFormLabel] = useState("");
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formModel, setFormModel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [modelsMap, setModelsMap] = useState<Record<string, string[]>>({});
  const [loadingModelsId, setLoadingModelsId] = useState<string | null>(null);
  const [showModelsId, setShowModelsId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modelSearchMap, setModelSearchMap] = useState<Record<string, string>>({});
  const [settingModel, setSettingModel] = useState<string | null>(null); // "providerId:modelId"

  useEffect(() => {
    fetch("/api/admin/ai-providers")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "Gagal memuat provider");
        return d;
      })
      .then((d) => setProviders(d.providers ?? []))
      .catch((e: unknown) => notify("error", e instanceof Error ? e.message : "Error"))
      .finally(() => setFetching(false));
  }, [notify]);

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
        prev.map((p) => (p.id === provider.id ? { ...p, isActive: !provider.isActive } : p))
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
        setProviders((prev) =>
          prev.map((p) => (p.id === id ? { ...p, lastTestAt: new Date().toISOString() } : p))
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
      const text = await res.text();
      let data: { models?: string[]; error?: string } = {};
      try {
        data = JSON.parse(text);
      } catch {
        notify("error", `Server error ${res.status}: respons bukan JSON. Cek server log.`);
        console.error("[loadModels] non-JSON response:", res.status, text.slice(0, 300));
        return;
      }
      if (!res.ok) {
        notify("error", data.error ?? "Gagal memuat models");
        return;
      }
      setModelsMap((prev) => ({ ...prev, [id]: data.models ?? [] }));
      setShowModelsId(id);
    } catch (err) {
      notify("error", "Gagal memuat daftar model.");
      console.error("[loadModels] fetch error:", err);
    } finally {
      setLoadingModelsId(null);
    }
  }

  async function handleSetModel(providerId: string, modelId: string | null) {
    const key = `${providerId}:${modelId ?? ""}`;
    setSettingModel(key);
    try {
      const res = await fetch(`/api/admin/ai-providers/${providerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultModel: modelId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        notify("error", d?.error ?? "Gagal mengatur model");
        return;
      }
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId ? { ...p, defaultModel: modelId ?? undefined } : p
        )
      );
      notify("success", modelId ? `Model "${modelId}" diset sebagai default.` : "Default model dihapus.");
    } catch {
      notify("error", "Terjadi kesalahan saat mengatur model.");
    } finally {
      setSettingModel(null);
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

  const providerBadge: Record<AiProvider, string> = {
    anthropic: "bg-orange-100 text-orange-700",
    openai: "bg-emerald-100 text-emerald-700",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--text-subtle)]">Provider AI untuk analisa laporan</p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 action-primary text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tambah Provider
        </button>
      </div>

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
                  Base URL (opsional)
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
                placeholder={formProvider === "anthropic" ? "claude-haiku-4-5-20251001" : "gpt-4o-mini"}
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
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold action-primary disabled:opacity-50 rounded-lg transition-colors"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}

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
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${providerBadge[p.provider]}`}>
                      {p.provider === "anthropic" ? "Anthropic" : "OpenAI"}
                    </span>
                    <span className="font-semibold text-[var(--foreground)] text-sm truncate">
                      {p.label}
                    </span>
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${p.isActive ? "bg-green-500" : "bg-slate-300"}`}
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
                  {testResults[p.id] && (
                    <div
                      className={`mt-2 text-xs rounded-md px-2.5 py-1.5 inline-flex items-center gap-1.5 ${
                        testResults[p.id].ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
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
                  {showModelsId === p.id && modelsMap[p.id] && (
                    <div className="mt-3 border border-[var(--border-subtle)] rounded-xl overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center justify-between px-3 py-2 bg-[var(--surface-soft)] border-b border-[var(--border-subtle)]">
                        <span className="text-xs font-semibold text-[var(--text-subtle)]">Pilih Model Default</span>
                        {p.defaultModel && (
                          <button
                            onClick={() => handleSetModel(p.id, null)}
                            disabled={settingModel !== null && settingModel.startsWith(p.id)}
                            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                          >
                            Hapus pilihan
                          </button>
                        )}
                      </div>
                      {/* Search */}
                      <div className="px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--background)]">
                        <input
                          value={modelSearchMap[p.id] ?? ""}
                          onChange={(e) =>
                            setModelSearchMap((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          placeholder="Filter model..."
                          className="w-full text-xs bg-transparent outline-none placeholder-slate-400 text-[var(--foreground)]"
                        />
                      </div>
                      {/* Model list */}
                      <div className="max-h-52 overflow-y-auto bg-[var(--background)]">
                        {modelsMap[p.id].length === 0 ? (
                          <p className="text-xs text-slate-400 px-3 py-4 text-center">
                            Tidak ada model tersedia.
                          </p>
                        ) : (
                          (() => {
                            const search = (modelSearchMap[p.id] ?? "").toLowerCase();
                            const filtered = search
                              ? modelsMap[p.id].filter((m) => m.toLowerCase().includes(search))
                              : modelsMap[p.id];
                            return filtered.length === 0 ? (
                              <p className="text-xs text-slate-400 px-3 py-4 text-center">
                                Tidak ada hasil untuk &ldquo;{modelSearchMap[p.id]}&rdquo;
                              </p>
                            ) : (
                              <ul className="divide-y divide-[var(--border-subtle)]">
                                {filtered.map((m) => {
                                  const isSelected = p.defaultModel === m;
                                  const isSaving = settingModel === `${p.id}:${m}`;
                                  return (
                                    <li key={m}>
                                      <button
                                        onClick={() => !isSelected && handleSetModel(p.id, m)}
                                        disabled={
                                          isSelected ||
                                          (settingModel !== null && settingModel.startsWith(p.id))
                                        }
                                        className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                                          isSelected
                                            ? "bg-[var(--accent)]/10 text-[var(--accent)] cursor-default"
                                            : "hover:bg-[var(--surface-soft)] text-[var(--foreground)] disabled:opacity-40"
                                        }`}
                                      >
                                        <span className="text-xs font-mono truncate">{m}</span>
                                        {isSaving ? (
                                          <Loader2 className="w-3 h-3 animate-spin shrink-0 text-[var(--accent)]" />
                                        ) : isSelected ? (
                                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                        ) : null}
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            );
                          })()
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleToggleActive(p)}
                    disabled={togglingId === p.id}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                      p.isActive
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    } disabled:opacity-50`}
                  >
                    {togglingId === p.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : p.isActive ? (
                      "Aktif"
                    ) : (
                      "Nonaktif"
                    )}
                  </button>
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
                  <button
                    onClick={() => handleLoadModels(p.id)}
                    disabled={loadingModelsId === p.id}
                    className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Pilih model default"
                  >
                    {loadingModelsId === p.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
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
  );
}

// ─── Personas Tab ─────────────────────────────────────────────────────────────

function PersonasTab({ notify }: { notify: ReturnType<typeof useNotification>["notify"] }) {
  const [personas, setPersonas] = useState<AiAgentPersona[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Add form state
  const [addName, setAddName] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addPrompt, setAddPrompt] = useState("");
  const [addTone, setAddTone] = useState<AiAgentPersona["tone"]>("formal");
  const [addSubmitting, setAddSubmitting] = useState(false);

  // Edit form state (mirrors add fields, keyed to editingId)
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editTone, setEditTone] = useState<AiAgentPersona["tone"]>("formal");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function loadPersonas() {
    setFetching(true);
    fetch("/api/admin/ai/personas")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "Gagal memuat persona");
        return d;
      })
      .then((d) => {
        const rows = (d.personas ?? []) as Array<{
          id: string;
          name: string;
          description?: string | null;
          systemPrompt: string;
          tone: AiAgentPersona["tone"];
          isDefault: number;
          createdAt: string;
          updatedAt: string;
        }>;
        setPersonas(
          rows.map((r) => ({
            ...r,
            description: r.description ?? undefined,
            isDefault: r.isDefault === 1,
          }))
        );
      })
      .catch((e: unknown) => notify("error", e instanceof Error ? e.message : "Error"))
      .finally(() => setFetching(false));
  }

  useEffect(() => {
    loadPersonas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEdit(p: AiAgentPersona) {
    setEditingId(p.id);
    setEditName(p.name);
    setEditDesc(p.description ?? "");
    setEditPrompt(p.systemPrompt);
    setEditTone(p.tone);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAddSubmitting(true);
    try {
      const res = await fetch("/api/admin/ai/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName,
          description: addDesc || undefined,
          systemPrompt: addPrompt,
          tone: addTone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify("error", data?.error ?? "Gagal menambah persona");
        return;
      }
      notify("success", "Persona berhasil ditambahkan.");
      setShowAddForm(false);
      setAddName("");
      setAddDesc("");
      setAddPrompt("");
      setAddTone("formal");
      loadPersonas();
    } catch {
      notify("error", "Terjadi kesalahan.");
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/admin/ai/personas/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          description: editDesc || undefined,
          systemPrompt: editPrompt,
          tone: editTone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify("error", data?.error ?? "Gagal mengupdate persona");
        return;
      }
      notify("success", "Persona diperbarui.");
      setEditingId(null);
      loadPersonas();
    } catch {
      notify("error", "Terjadi kesalahan.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleSetDefault(id: string) {
    setSettingDefaultId(id);
    try {
      const res = await fetch(`/api/admin/ai/personas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        notify("error", d?.error ?? "Gagal mengatur default");
        return;
      }
      notify("success", "Persona default diperbarui.");
      loadPersonas();
    } catch {
      notify("error", "Terjadi kesalahan.");
    } finally {
      setSettingDefaultId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Hapus persona "${name}"?`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/ai/personas/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        notify("error", d?.error ?? "Gagal menghapus persona");
        return;
      }
      setPersonas((prev) => prev.filter((p) => p.id !== id));
      notify("success", `Persona "${name}" dihapus.`);
    } catch {
      notify("error", "Terjadi kesalahan.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--text-subtle)]">
          Atur kepribadian dan system prompt AI yang digunakan saat analisa
        </p>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="inline-flex items-center gap-2 action-primary text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tambah Persona
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="panel-card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Tambah Persona Baru</h2>
            <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nama Persona</label>
                <input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  required
                  className="field-input"
                  placeholder="Contoh: FinArchitect Expert"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tone</label>
                <select
                  value={addTone}
                  onChange={(e) => setAddTone(e.target.value as AiAgentPersona["tone"])}
                  className="field-input"
                >
                  <option value="formal">Formal</option>
                  <option value="casual">Kasual</option>
                  <option value="expert">Expert</option>
                  <option value="friendly">Ramah</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Deskripsi (opsional)</label>
              <textarea
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                rows={2}
                className="field-input resize-none"
                placeholder="Deskripsi singkat persona ini..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">System Prompt</label>
              <textarea
                value={addPrompt}
                onChange={(e) => setAddPrompt(e.target.value)}
                required
                rows={8}
                className="field-input resize-y font-mono text-xs"
                placeholder="You are FinArchitect AI..."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-sm text-[var(--text-subtle)] hover:bg-[var(--surface-soft)] rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={addSubmitting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold action-primary disabled:opacity-50 rounded-lg transition-colors"
              >
                {addSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Personas List */}
      {fetching ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : personas.length === 0 ? (
        <div className="panel-card p-8 text-center">
          <p className="text-sm text-slate-500">Belum ada persona yang dibuat.</p>
          <p className="text-xs text-slate-400 mt-1">
            Tambah persona untuk mengkustomisasi perilaku AI.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {personas.map((p) => (
            <div key={p.id} className="panel-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-[var(--foreground)] text-sm">{p.name}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TONE_BADGE_COLORS[p.tone]}`}>
                      {TONE_LABELS[p.tone]}
                    </span>
                    {p.isDefault && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        <Star className="w-3 h-3" />
                        Default
                      </span>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-xs text-[var(--text-subtle)] mb-1 line-clamp-2">
                      {p.description}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 font-mono truncate">
                    {p.systemPrompt.slice(0, 120)}...
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!p.isDefault && (
                    <button
                      onClick={() => handleSetDefault(p.id)}
                      disabled={settingDefaultId === p.id}
                      className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Jadikan default"
                    >
                      {settingDefaultId === p.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Star className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => (editingId === p.id ? setEditingId(null) : openEdit(p))}
                    className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit persona"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    disabled={deletingId === p.id}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Hapus persona"
                  >
                    {deletingId === p.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Inline Edit Form */}
              {editingId === p.id && (
                <form onSubmit={handleEdit} className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Nama</label>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        required
                        className="field-input"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Tone</label>
                      <select
                        value={editTone}
                        onChange={(e) => setEditTone(e.target.value as AiAgentPersona["tone"])}
                        className="field-input"
                      >
                        <option value="formal">Formal</option>
                        <option value="casual">Kasual</option>
                        <option value="expert">Expert</option>
                        <option value="friendly">Ramah</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Deskripsi</label>
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      rows={2}
                      className="field-input resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">System Prompt</label>
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      required
                      rows={8}
                      className="field-input resize-y font-mono text-xs"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-xs text-[var(--text-subtle)] hover:bg-[var(--surface-soft)] rounded-lg transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={editSubmitting}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold action-primary disabled:opacity-50 rounded-lg transition-colors"
                    >
                      {editSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
                      Simpan
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Knowledge Base Tab ───────────────────────────────────────────────────────

function KnowledgeBaseTab({ notify }: { notify: ReturnType<typeof useNotification>["notify"] }) {
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [fetching, setFetching] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  function loadDocuments() {
    setFetching(true);
    fetch("/api/admin/ai/rag")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error ?? "Gagal memuat dokumen");
        return d;
      })
      .then((d) => {
        const rows = (d.documents ?? []) as Array<{
          id: string;
          title: string;
          fileName: string;
          charCount: number;
          chunkCount: number;
          uploadedAt: string;
        }>;
        setDocuments(rows);
      })
      .catch((e: unknown) => notify("error", e instanceof Error ? e.message : "Error"))
      .finally(() => setFetching(false));
  }

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFileChange(file: File | null) {
    setSelectedFile(file);
    if (file && !uploadTitle) {
      setUploadTitle(file.name.replace(/\.[^.]+$/, ""));
    }
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      notify("error", "Pilih file terlebih dahulu");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      if (uploadTitle.trim()) fd.append("title", uploadTitle.trim());

      const res = await fetch("/api/admin/ai/rag/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        notify("error", data?.error ?? "Upload gagal");
        return;
      }
      notify("success", `Dokumen "${data.title}" diunggah (${data.chunkCount} chunks).`);
      setSelectedFile(null);
      setUploadTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadDocuments();
    } catch {
      notify("error", "Terjadi kesalahan saat upload.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Hapus dokumen "${title}"? Semua chunks akan dihapus.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/ai/rag/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        notify("error", d?.error ?? "Gagal menghapus dokumen");
        return;
      }
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      notify("success", `Dokumen "${title}" dihapus.`);
    } catch {
      notify("error", "Terjadi kesalahan.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setShowSearchResults(false);
    try {
      const res = await fetch(`/api/admin/ai/rag/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (!res.ok) {
        notify("error", data?.error ?? "Pencarian gagal");
        return;
      }
      setSearchResults(data.chunks ?? []);
      setShowSearchResults(true);
    } catch {
      notify("error", "Terjadi kesalahan saat mencari.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div className="panel-card p-5">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">Unggah Dokumen</h2>
        <form onSubmit={handleUpload} className="space-y-4">
          {/* Drag and drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0] ?? null;
              handleFileChange(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-[var(--accent)] bg-[var(--accent)]/5"
                : "border-[var(--border-subtle)] hover:border-slate-400"
            }`}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
            {selectedFile ? (
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">{selectedFile.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-500">Seret file ke sini atau klik untuk pilih</p>
                <p className="text-xs text-slate-400 mt-0.5">.txt, .csv, .xlsx, .md</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.csv,.xlsx,.md"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Judul (opsional — default: nama file)
            </label>
            <input
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              className="field-input"
              placeholder="Contoh: Kebijakan Biaya Shopee 2025"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold action-primary disabled:opacity-50 rounded-lg transition-colors"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {uploading ? "Mengunggah..." : "Unggah"}
            </button>
          </div>
        </form>
      </div>

      {/* Search Preview */}
      <div className="panel-card p-5">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Preview Pencarian RAG</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="field-input flex-1"
            placeholder="Ketik query untuk preview hasil retrieval..."
          />
          <button
            type="submit"
            disabled={searching || !searchQuery.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold action-primary disabled:opacity-50 rounded-lg transition-colors shrink-0"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Cari
          </button>
        </form>

        {showSearchResults && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-slate-500">
              {searchResults.length} chunk ditemukan:
            </p>
            {searchResults.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                Tidak ada chunk yang relevan ditemukan.
              </p>
            ) : (
              searchResults.map((chunk, i) => (
                <div
                  key={i}
                  className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-xs text-slate-700 font-mono whitespace-pre-wrap break-words"
                >
                  <span className="text-slate-400 font-sans mr-2">[{i + 1}]</span>
                  {chunk}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Documents Table */}
      <div>
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Dokumen Terunggah</h2>
        {fetching ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : documents.length === 0 ? (
          <div className="panel-card p-8 text-center">
            <p className="text-sm text-slate-500">Belum ada dokumen yang diunggah.</p>
            <p className="text-xs text-slate-400 mt-1">
              Unggah dokumen untuk membangun knowledge base AI.
            </p>
          </div>
        ) : (
          <div className="panel-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-soft)]">
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5">Judul</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5 hidden sm:table-cell">
                    File
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-500 px-4 py-2.5">Chunks</th>
                  <th className="text-right text-xs font-semibold text-slate-500 px-4 py-2.5 hidden md:table-cell">
                    Tanggal Upload
                  </th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--surface-soft)] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate max-w-48">
                        {doc.title}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <p className="text-xs text-slate-500 font-mono truncate max-w-36">
                        {doc.fileName}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-xs font-semibold text-slate-600">{doc.chunkCount}</span>
                    </td>
                    <td className="px-4 py-3 text-right hidden md:table-cell">
                      <span className="text-xs text-slate-400">
                        {new Date(doc.uploadedAt).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(doc.id, doc.title)}
                        disabled={deletingId === doc.id}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Hapus dokumen"
                      >
                        {deletingId === doc.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
