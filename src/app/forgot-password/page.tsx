"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [devResetUrl, setDevResetUrl] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setDevResetUrl("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Gagal memproses permintaan.");
        return;
      }
      setSuccess(data?.message ?? "Jika email terdaftar, link reset telah dikirim.");
      if (data?.resetUrl) setDevResetUrl(String(data.resetUrl));
    } catch {
      setError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-[11px] tracking-widest text-slate-400 uppercase">FinArchitect</p>
          <h1 className="text-2xl font-bold text-slate-800 mt-1">Forgot Password</h1>
          <p className="text-sm text-slate-500 mt-1">Masukkan email akun untuk reset password</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="nama@email.com"
              />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5">{error}</p>}
            {success && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3.5 py-2.5">{success}</p>}
            {devResetUrl && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5">
                <p className="text-xs font-semibold text-amber-800">Mode development</p>
                <a href={devResetUrl} className="mt-1 block break-all text-xs text-amber-700 underline">
                  {devResetUrl}
                </a>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
            >
              {loading ? "Memproses..." : "Kirim Link Reset"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          <Link href="/login" className="underline">Kembali ke login</Link>
        </p>
      </div>
    </div>
  );
}

