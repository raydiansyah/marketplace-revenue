"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AppSidebar from "@/components/AppSidebar";
import {
  BarChart3,
  Upload,
  Settings,
  FileSpreadsheet,
  Clock3,
  Users,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const personas = [
  {
    id: "owner",
    title: "Owner / Founder",
    pain: "Profit per order tidak transparan, sulit tentukan produk paling sehat.",
    gain: "Lihat net profit, margin, dan biaya platform secara jelas per order.",
  },
  {
    id: "finance",
    title: "Admin Finance",
    pain: "Rekap bulanan dari 3 marketplace manual, rawan salah hitung.",
    gain: "Upload file, hitung otomatis, lalu export laporan rapi dalam hitungan menit.",
  },
  {
    id: "ops",
    title: "Tim Operasional",
    pain: "Sulit investigasi order yang marginnya aneh karena potongan tersembunyi.",
    gain: "Breakdown fee per order membantu audit cepat dan lebih akurat.",
  },
];

export default function HomePage() {
  const [activePersona, setActivePersona] = useState(personas[0].id);
  const [ordersPerMonth, setOrdersPerMonth] = useState(2500);

  const active = personas.find((item) => item.id === activePersona) ?? personas[0];
  const monthlyHoursSaved = useMemo(() => Math.round((ordersPerMonth / 120) * 7), [ordersPerMonth]);

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-800">
      <AppSidebar />
      <main className="flex-1 bg-[radial-gradient(ellipse_at_top,#e2ecff_0%,#f7fafc_45%,#eef6ff_100%)]">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/85 p-7 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10">
          <div className="absolute right-0 top-0 h-40 w-40 -translate-y-10 translate-x-10 rounded-full bg-cyan-200/40 blur-3xl" />
          <div className="absolute left-0 bottom-0 h-40 w-40 -translate-x-10 translate-y-10 rounded-full bg-blue-200/50 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                <Sparkles size={14} /> Revenue Intelligence untuk Seller
              </p>

              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
                Hitung profit marketplace dalam menit, bukan berjam-jam.
              </h1>

              <p className="mt-4 max-w-2xl text-sm text-slate-600 sm:text-base">
                Sistem ini dibuat untuk membantu seller dan tim finance memahami profit bersih
                secara akurat dari Shopee, Tokopedia/TikTok, dan Lazada. Semua potongan fee,
                voucher, ongkir, serta HPP dihitung otomatis dari file asli marketplace.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Masuk ke Menu Utama <ArrowRight size={16} />
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Lihat Dashboard
                </Link>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Marketplace</p>
                  <p className="mt-1 text-lg font-bold">3 Platform</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Analisis</p>
                  <p className="mt-1 text-lg font-bold">Per Order</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Output</p>
                  <p className="mt-1 text-lg font-bold">Dashboard + Excel</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-sm font-semibold text-slate-700">Simulasi penghematan waktu</h2>
              <p className="mt-1 text-xs text-slate-500">Geser volume order bulanan kamu</p>

              <input
                type="range"
                min={300}
                max={10000}
                step={100}
                value={ordersPerMonth}
                onChange={(e) => setOrdersPerMonth(Number(e.target.value))}
                className="mt-4 w-full accent-slate-800"
              />

              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Order / bulan</p>
                  <p className="text-xl font-bold text-slate-900">{ordersPerMonth.toLocaleString("id-ID")}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs text-emerald-700">Estimasi waktu manual yang bisa dipotong</p>
                  <p className="text-xl font-bold text-emerald-700">~{monthlyHoursSaved} jam / bulan</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard icon={Upload} title="Upload Sekali" text="Tarik CSV/XLSX langsung dari seller center." />
          <FeatureCard icon={Settings} title="Config Fleksibel" text="Atur fee dan parameter sesuai kondisi toko." />
          <FeatureCard icon={BarChart3} title="Profit Transparan" text="Lihat margin per order sampai level detail." />
          <FeatureCard icon={FileSpreadsheet} title="Export Cepat" text="Bagikan laporan ke tim dalam format Excel." />
        </section>

        <section className="mt-8 grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:grid-cols-[1fr_1fr]">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Dibuat untuk siapa?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Pilih peranmu, lihat masalah paling umum, dan bagaimana sistem ini menyelesaikannya.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {personas.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActivePersona(item.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    activePersona === item.id
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-500">Kesulitan utama</p>
            <p className="mt-2 text-sm text-slate-700">{active.pain}</p>

            <p className="mt-4 text-xs font-semibold text-slate-500">Bantuan dari sistem</p>
            <p className="mt-2 text-sm text-slate-700">{active.gain}</p>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Kenapa ini memotong banyak waktu?</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStep icon={Clock3} title="Dulu" text="Rekap manual antar file, banyak copy-paste." />
            <MiniStep icon={Users} title="Sekarang" text="Satu alur standar untuk owner, admin, dan tim ops." />
            <MiniStep icon={ShieldCheck} title="Lebih Aman" text="Kurangi human error dalam hitung fee/margin." />
            <MiniStep icon={TrendingUp} title="Lebih Cepat" text="Fokus ke keputusan bisnis, bukan kerja administratif." />
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">Alur kerja singkat</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <StepPill text="1. Upload file pesanan + pendapatan" />
              <StepPill text="2. Sinkronkan HPP" />
              <StepPill text="3. Hitung otomatis" />
              <StepPill text="4. Analisis & export" />
            </div>
          </div>
        </section>
        <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-900 px-6 py-7 text-white shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-300">Siap mulai hitung profit dengan cara yang lebih cepat?</p>
              <h3 className="mt-1 text-2xl font-bold">Masuk ke menu utama dan upload file pertamamu.</h3>
            </div>
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
            >
              Mulai Sekarang <ArrowRight size={16} />
            </Link>
          </div>
        </section>
        </div>
      </main>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Upload;
  title: string;
  text: string;
}) {
  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-2 inline-flex rounded-lg bg-slate-100 p-2 text-slate-700">
        <Icon size={16} />
      </div>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 text-xs text-slate-600">{text}</p>
    </div>
  );
}

function MiniStep({ icon: Icon, title, text }: { icon: typeof Clock3; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 inline-flex items-center gap-2 text-slate-700">
        <Icon size={14} />
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <p className="text-xs text-slate-600">{text}</p>
    </div>
  );
}

function StepPill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5">
      <CheckCircle2 size={13} className="text-emerald-600" />
      {text}
    </span>
  );
}
