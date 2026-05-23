"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";

interface HeroSectionProps {
  ordersPerMonth: number;
  setOrdersPerMonth: (v: number) => void;
  monthlyHoursSaved: number;
}

const marketplaceBadges = [
  { label: "Shopee", className: "bg-orange-50 text-orange-600 border-orange-200" },
  { label: "Tokopedia", className: "bg-green-50 text-green-600 border-green-200" },
  { label: "Lazada", className: "bg-blue-50 text-blue-700 border-blue-200" },
];

const stats = [
  { value: "3 Marketplace", desc: "Shopee · Tokopedia · Lazada" },
  { value: "100% Akurat", desc: "Rekonsiliasi otomatis" },
  { value: "< 5 Menit", desc: "Dari upload ke laporan" },
];

const headlineLines = ["Hitung Revenue", "Marketplace Anda", "Secara Akurat"];

export default function HeroSection({
  ordersPerMonth,
  setOrdersPerMonth,
  monthlyHoursSaved,
}: HeroSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section
      ref={ref}
      className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/85 p-7 shadow-[0_20px_80px_-45px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10"
    >
      {/* Background blobs */}
      <div className="absolute right-0 top-0 h-40 w-40 -translate-y-10 translate-x-10 rounded-full bg-cyan-200/40 blur-3xl" />
      <div className="absolute left-0 bottom-0 h-40 w-40 -translate-x-10 translate-y-10 rounded-full bg-blue-200/50 blur-3xl" />

      {/* Floating decorative elements */}
      <motion.div
        className="absolute top-8 right-24 h-10 w-10 rounded-full border-2 border-blue-200/60 hidden lg:block"
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-16 right-12 h-5 w-5 rounded-full bg-cyan-200/50 hidden lg:block"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      />
      <motion.div
        className="absolute top-1/2 right-6 h-3 w-3 rounded-full bg-blue-300/40 hidden lg:block"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Left column */}
        <div>
          {/* Badge */}
          <motion.p
            className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          >
            <Sparkles size={14} /> Revenue Intelligence untuk Seller Indonesia
          </motion.p>

          {/* Marketplace badges */}
          <div className="mb-4 flex flex-wrap gap-2">
            {marketplaceBadges.map((badge, i) => (
              <motion.span
                key={badge.label}
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                initial={{ opacity: 0, x: -16 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.18 + i * 0.08, ease: "easeOut" }}
              >
                {badge.label}
              </motion.span>
            ))}
          </div>

          {/* Headline */}
          <h1 className="text-4xl font-extrabold tracking-tight leading-[1.15] text-slate-900 sm:text-5xl">
            {headlineLines.map((line, i) => (
              <motion.span
                key={line}
                className={`block ${i === 2 ? "text-blue-600" : ""}`}
                initial={{ opacity: 0, y: 24 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.25 + i * 0.15, ease: "easeOut" }}
              >
                {line}
              </motion.span>
            ))}
          </h1>

          {/* Subheadline */}
          <motion.p
            className="mt-4 max-w-xl text-sm text-slate-600 sm:text-base"
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.55, ease: "easeOut" }}
          >
            Rekonsiliasi otomatis Pesanan Selesai + Transaksi Pendapatan dari Shopee,
            Tokopedia/TikTok, dan Lazada. Lihat net profit per order dalam menit.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            className="mt-6 flex flex-wrap gap-3"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.65, ease: "easeOut" }}
          >
            <motion.div whileHover={{ scale: 1.03 }} transition={{ duration: 0.15 }}>
              <Link
                href="/upload"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md"
              >
                Mulai Hitung Sekarang <ArrowRight size={16} />
              </Link>
            </motion.div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Lihat Dashboard
            </Link>
          </motion.div>

          {/* Stats cards */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.value}
                className="rounded-xl border border-slate-100 bg-white/80 px-4 py-3 backdrop-blur-sm"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.75 + i * 0.1, ease: "easeOut" }}
              >
                <p className="text-lg font-bold text-slate-900">{stat.value}</p>
                <p className="mt-0.5 text-xs text-slate-500">{stat.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right column — slider simulasi */}
        <motion.div
          className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
          initial={{ opacity: 0, x: 40 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
        >
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
              <p className="text-xl font-bold text-slate-900">
                {ordersPerMonth.toLocaleString("id-ID")}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">Estimasi waktu manual yang bisa dipotong</p>
              <p className="text-xl font-bold text-emerald-700">~{monthlyHoursSaved} jam / bulan</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
