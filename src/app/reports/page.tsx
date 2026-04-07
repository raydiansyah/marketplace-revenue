"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Pencil, Save, Trash2, X } from "lucide-react";
import AppSidebar from "@/components/AppSidebar";
import { useAppStore } from "@/store/app-store";
import { formatRupiah } from "@/lib/utils";

export default function SavedReportsPage() {
  const router = useRouter();
  const { savedReports, setReport, deleteSavedReport, renameSavedReport } = useAppStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const handleRename = () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) return;
    renameSavedReport(editingId, trimmed);
    setEditingId(null);
    setEditingName("");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <AppSidebar />
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Laporan Tersimpan</h1>
            <p className="text-slate-600 mt-1 text-sm">Kelola, rename, dan buka ulang laporan tanpa upload ulang data.</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            {savedReports.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-500">Belum ada laporan tersimpan.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {savedReports.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <div key={item.id} className="px-5 py-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        {isEditing ? (
                          <input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="w-full max-w-md border border-slate-200 rounded-lg px-3 py-1.5 text-sm"
                            placeholder="Nama toko"
                          />
                        ) : (
                          <p className="text-sm font-medium text-slate-800 truncate">{item.label}</p>
                        )}
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(item.createdAt).toLocaleString("id-ID")} • Revenue {formatRupiah(item.report.totalRevenue)} • Net {formatRupiah(item.report.totalNetProfit)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setReport(item.report);
                            router.push("/dashboard");
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          Buka
                        </button>

                        {isEditing ? (
                          <>
                            <button
                              onClick={handleRename}
                              disabled={!editingName.trim()}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-40"
                            >
                              <Save className="w-3.5 h-3.5" />
                              Simpan
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(null);
                                setEditingName("");
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                            >
                              <X className="w-3.5 h-3.5" />
                              Batal
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => startRename(item.id, item.storeName)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Rename
                          </button>
                        )}

                        <button
                          onClick={() => deleteSavedReport(item.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Hapus
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
