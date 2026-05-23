"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import AuthAreaLayout from "@/components/AuthAreaLayout";
import { UserPlus, Trash2, Loader2 } from "lucide-react";
import { useNotification } from "@/lib/notifications/notification-context";

type Role = "superadmin" | "admin" | "finance";

interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

const roleBadge: Record<Role, string> = {
  superadmin: "bg-purple-100 text-purple-700",
  admin: "bg-blue-100 text-blue-700",
  finance: "bg-green-100 text-green-700",
};

const roleLabel: Record<Role, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  finance: "Finance",
};

export default function AdminUsersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { notify } = useNotification();

  const [users, setUsers] = useState<User[]>([]);
  const [fetching, setFetching] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "finance">("admin");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user?.role !== "superadmin") {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user?.role === "superadmin") {
      fetch("/api/admin/users")
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data?.error ?? "Gagal memuat user");
          return data;
        })
        .then((d) => setUsers(d.users ?? []))
        .catch((e: unknown) => {
          console.error(e);
          notify("error", e instanceof Error ? e.message : "Gagal memuat user");
        })
        .finally(() => setFetching(false));
    }
  }, [notify, user]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data.error ?? "Gagal membuat user";
        setFormError(message);
        notify("error", message);
        return;
      }
      setUsers((prev) => [...prev, data.user]);
      setName("");
      setEmail("");
      setPassword("");
      setRole("admin");
      setShowForm(false);
      notify("success", "User berhasil ditambahkan.");
    } catch {
      const message = "Terjadi kesalahan. Silakan coba lagi.";
      setFormError(message);
      notify("warning", message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string, userName: string) {
    if (!window.confirm(`Hapus user "${userName}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify("error", data?.error ?? "Gagal menghapus user");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== id));
      notify("success", `User "${userName}" berhasil dihapus.`);
    } catch (e) {
      console.error(e);
      notify("warning", "Terjadi kesalahan saat menghapus user.");
    }
  }

  if (authLoading || user?.role !== "superadmin") return null;

  return (
    <AuthAreaLayout contentClassName="p-6">
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Manajemen User</h1>
            <p className="text-sm text-[var(--text-subtle)] mt-0.5">Kelola akun yang dapat mengakses aplikasi</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 action-primary text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Tambah User
          </button>
        </div>

        {/* Add User Form */}
        {showForm && (
          <div className="panel-card p-5 mb-6">
            <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">Tambah User Baru</h2>
            <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nama</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="field-input"
                  placeholder="Nama lengkap"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="field-input"
                  placeholder="email@domain.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="field-input"
                  placeholder="Min. 8 karakter"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "admin" | "finance")}
                  className="field-input"
                >
                  <option value="admin">Admin</option>
                  <option value="finance">Finance</option>
                </select>
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

        {/* Users Table */}
        <div className="panel-card overflow-hidden">
          {fetching ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">Belum ada user terdaftar.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nama</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Dibuat</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleBadge[u.role]}`}>
                        {roleLabel[u.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(u.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.id !== user?.id && u.role !== "superadmin" && (
                        <button
                          onClick={() => handleDelete(u.id, u.name)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Hapus user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AuthAreaLayout>
  );
}
