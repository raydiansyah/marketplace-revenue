"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ChartNoAxesCombined, Clock3, FileSpreadsheet, Upload } from "lucide-react";

const reveal = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const flowItems = [
  "Upload pesanan + pendapatan",
  "Sinkronisasi HPP per SKU",
  "Rekalkulasi fee marketplace",
  "Laporan net profit siap kirim",
];

export default function HomePage() {
  const [ordersPerMonth, setOrdersPerMonth] = useState(2800);

  const simulator = useMemo(() => {
    const manualHours = Math.round((ordersPerMonth / 130) * 8.5);
    const assistedHours = Math.max(2, Math.round(manualHours * 0.22));
    const savedHours = Math.max(0, manualHours - assistedHours);
    const estimatedErrorReduction = Math.min(92, Math.round(35 + ordersPerMonth / 120));
    return { manualHours, assistedHours, savedHours, estimatedErrorReduction };
  }, [ordersPerMonth]);

  return (
    <div className="min-h-screen flex bg-[#060b14] text-slate-100">
      <main className="flex-1 overflow-x-hidden">
        <section className="relative min-h-[92svh] px-5 sm:px-8 lg:px-14 py-10 lg:py-14">
          <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_80%_15%,rgba(22,163,186,0.3),transparent_60%),radial-gradient(60%_55%_at_15%_80%,rgba(15,23,42,0.9),transparent_65%),linear-gradient(165deg,#050812_0%,#081122_45%,#060b14_100%)]" />
          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:56px_56px]" />

          <div className="relative h-full max-w-6xl mx-auto grid gap-12 lg:grid-cols-[1.1fr_0.9fr] items-end">
            <motion.div
              initial="hidden"
              animate="visible"
              transition={{ staggerChildren: 0.12 }}
              className="max-w-2xl"
            >
              <motion.p
                variants={reveal}
                transition={{ duration: 0.55 }}
                className="text-[11px] tracking-[0.18em] uppercase text-cyan-300/90 font-semibold"
              >
                FinArchitect Revenue OS
              </motion.p>
              <motion.h1
                variants={reveal}
                transition={{ duration: 0.6 }}
                className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.04] tracking-tight text-white"
              >
                Satu layar untuk membaca untung bersih
                <span className="block text-cyan-300">Shopee, TikTok, dan Lazada.</span>
              </motion.h1>
              <motion.p
                variants={reveal}
                transition={{ duration: 0.6 }}
                className="mt-5 text-sm sm:text-base text-slate-300 max-w-xl"
              >
                Upload file laporan, cocokkan HPP per master SKU, lalu lihat net profit yang bisa diaudit sampai level order.
              </motion.p>
              <motion.div variants={reveal} transition={{ duration: 0.6 }} className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300 transition-colors"
                >
                  Mulai dari Upload <ArrowRight size={16} />
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-600/80 px-5 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-800/60 transition-colors"
                >
                  Lihat Dashboard
                </Link>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
              className="border border-slate-700/70 rounded-2xl bg-slate-950/40 backdrop-blur px-5 py-4"
            >
              <p className="text-xs text-slate-400">Signal Live</p>
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Marketplace aktif</span>
                  <span className="font-semibold text-cyan-300">3 channel</span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">Fee engine</span>
                  <span className="font-semibold text-white">Per order line</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Output</span>
                  <span className="font-semibold text-emerald-300">Net profit terverifikasi</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="px-5 sm:px-8 lg:px-14 py-12 bg-[#070d18] border-y border-slate-800/70">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            transition={{ staggerChildren: 0.1 }}
            className="max-w-6xl mx-auto"
          >
            <motion.h2 variants={reveal} transition={{ duration: 0.45 }} className="text-2xl sm:text-3xl font-bold text-white">
              Workflow yang ringkas, bukan dashboard card bertumpuk.
            </motion.h2>
            <motion.p variants={reveal} transition={{ duration: 0.45 }} className="mt-2 text-sm text-slate-300 max-w-2xl">
              Setiap tahap punya satu tujuan: data masuk, biaya tervalidasi, profit bersih siap jadi keputusan.
            </motion.p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {flowItems.map((item, idx) => (
                <motion.div
                  key={item}
                  variants={reveal}
                  transition={{ duration: 0.45 }}
                  className="border border-slate-700 rounded-xl px-4 py-4 bg-slate-900/40"
                >
                  <p className="text-[11px] text-cyan-300 font-semibold tracking-wider">STEP {idx + 1}</p>
                  <p className="mt-1 text-sm text-slate-100">{item}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="px-5 sm:px-8 lg:px-14 py-14 bg-[#060b14]">
          <div className="max-w-6xl mx-auto grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-start">
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.55 }}
            >
              <p className="text-xs tracking-[0.16em] uppercase text-cyan-300 font-semibold">Impact Simulator</p>
              <h3 className="mt-2 text-3xl font-bold text-white">Semakin besar volume order, semakin terasa efek otomatisasi.</h3>
              <p className="mt-3 text-sm text-slate-300 max-w-xl">
                Geser volume order untuk melihat estimasi jam kerja yang bisa dipangkas dan reduksi potensi human error.
              </p>

              <div className="mt-7">
                <input
                  type="range"
                  min={300}
                  max={12000}
                  step={100}
                  value={ordersPerMonth}
                  onChange={(e) => setOrdersPerMonth(Number(e.target.value))}
                  className="w-full accent-cyan-300"
                />
                <p className="mt-2 text-xs text-slate-400">Volume order / bulan: {ordersPerMonth.toLocaleString("id-ID")}</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.55, delay: 0.1 }}
              className="border border-slate-700 rounded-2xl p-5 bg-slate-950/50"
            >
              <MetricRow icon={Upload} label="Proses manual" value={`${simulator.manualHours} jam/bulan`} />
              <MetricRow icon={Clock3} label="Dengan sistem" value={`${simulator.assistedHours} jam/bulan`} />
              <MetricRow icon={ChartNoAxesCombined} label="Jam dihemat" value={`${simulator.savedHours} jam/bulan`} highlight />
              <MetricRow icon={FileSpreadsheet} label="Reduksi potensi error" value={`${simulator.estimatedErrorReduction}%`} />
            </motion.div>
          </div>
        </section>

        <section className="px-5 sm:px-8 lg:px-14 pb-14">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.6 }}
            className="max-w-6xl mx-auto rounded-2xl border border-slate-700 bg-gradient-to-r from-slate-900 to-[#071c25] px-6 py-8 sm:px-8"
          >
            <p className="text-xs tracking-[0.15em] uppercase text-cyan-300 font-semibold">Final Action</p>
            <h4 className="mt-2 text-2xl sm:text-3xl font-bold text-white">Masuk ke modul upload dan hitung profit toko kamu hari ini.</h4>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/upload"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200 transition-colors"
              >
                Hitung Revenue Sekarang <ArrowRight size={16} />
              </Link>
              <Link
                href="/reports"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-800/60 transition-colors"
              >
                Buka Laporan Tersimpan
              </Link>
            </div>
          </motion.div>
        </section>
      </main>
    </div>
  );
}

function MetricRow({
  icon: Icon,
  label,
  value,
  highlight = false,
}: {
  icon: typeof Upload;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-800 last:border-b-0">
      <div className="inline-flex items-center gap-2 text-slate-300 text-sm">
        <Icon size={15} className={highlight ? "text-cyan-300" : "text-slate-400"} />
        {label}
      </div>
      <span className={`text-sm font-semibold ${highlight ? "text-cyan-300" : "text-white"}`}>{value}</span>
    </div>
  );
}
