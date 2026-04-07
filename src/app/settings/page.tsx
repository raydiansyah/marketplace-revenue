"use client";

import { useState } from "react";
import AppSidebar from "@/components/AppSidebar";
import { useAppStore } from "@/store/app-store";
import { MARKETPLACE_LABELS } from "@/lib/types";

function PercentInput({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  help?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={(value * 100).toFixed(2)}
          onChange={(e) => onChange(parseFloat(e.target.value) / 100 || 0)}
          step="0.01"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
      </div>
      {help && <p className="text-xs text-gray-400 mt-0.5">{help}</p>}
    </div>
  );
}

function RpInput({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  help?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">Rp</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pl-9 focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
      </div>
      {help && <p className="text-xs text-gray-400 mt-0.5">{help}</p>}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  help?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 mt-0.5 ${
          value ? "bg-slate-800" : "bg-gray-200"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            value ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
      <div>
        <p className="text-xs font-medium text-slate-600">{label}</p>
        {help && <p className="text-xs text-gray-400">{help}</p>}
      </div>
    </div>
  );
}

function ShopeeSettings() {
  const { configs, updateConfig } = useAppStore();
  const c = configs.shopee;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <PercentInput
          label="Komisi Platform"
          value={c.commissionRate}
          onChange={(v) => updateConfig("shopee", { commissionRate: v })}
          help="Cek di Seller Center > Biaya & Promosi (2.5% - 10.2%)"
        />
        <PercentInput
          label="Transaction Fee"
          value={c.transactionFee}
          onChange={(v) => updateConfig("shopee", { transactionFee: v })}
          help="Default 2.18%"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <RpInput
          label="Order Processing Fee (per order)"
          value={c.orderProcessingFee}
          onChange={(v) => updateConfig("shopee", { orderProcessingFee: v })}
          help="Default Rp1.250/order"
        />
        <PercentInput
          label="Komisi Affiliate"
          value={c.affiliateRate}
          onChange={(v) => updateConfig("shopee", { affiliateRate: v })}
          help="0% jika tidak pakai affiliate"
        />
      </div>

      <div className="space-y-3 pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Program Opsional</p>
        <Toggle
          label="Free Shipping XTRA"
          value={c.freeShippingXtra}
          onChange={(v) => updateConfig("shopee", { freeShippingXtra: v })}
          help="Aktifkan jika seller ikut program Free Shipping Shopee"
        />
        {c.freeShippingXtra && (
          <PercentInput
            label="Rate Free Shipping"
            value={c.freeShippingRate}
            onChange={(v) => updateConfig("shopee", { freeShippingRate: v })}
            help="Biasanya 4% - 4.5%"
          />
        )}
        <Toggle
          label="Coins Cashback"
          value={c.coinsCashback}
          onChange={(v) => updateConfig("shopee", { coinsCashback: v })}
          help="Aktifkan jika seller ikut program Shopee Coins"
        />
        {c.coinsCashback && (
          <PercentInput
            label="Rate Coins Cashback"
            value={c.coinsCashbackRate}
            onChange={(v) => updateConfig("shopee", { coinsCashbackRate: v })}
            help="Biasanya 3% - 5%"
          />
        )}
        <Toggle
          label="Promo XTRA"
          value={c.promoXtra}
          onChange={(v) => updateConfig("shopee", { promoXtra: v })}
          help="Aktifkan jika seller ikut program Promo XTRA"
        />
        {c.promoXtra && (
          <PercentInput
            label="Rate Promo XTRA"
            value={c.promoXtraRate}
            onChange={(v) => updateConfig("shopee", { promoXtraRate: v })}
            help="Biasanya 1.4% - 2%"
          />
        )}
      </div>
    </div>
  );
}

function TokopediaSettings() {
  const { configs, updateConfig } = useAppStore();
  const c = configs.tokopedia;

  return (
    <div className="space-y-4">
      <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        Konfigurasi ini dipakai untuk Tokopedia dan TikTok Shop (model fee gabungan).
      </p>
      <div className="grid grid-cols-2 gap-4">
        <PercentInput
          label="Komisi Platform"
          value={c.commissionRate}
          onChange={(v) => updateConfig("tokopedia", { commissionRate: v })}
          help="1% - 8% tergantung kategori"
        />
        <PercentInput
          label="Dynamic Commission Fee"
          value={c.dynamicCommissionRate}
          onChange={(v) => updateConfig("tokopedia", { dynamicCommissionRate: v })}
          help="4% - 6% per transaksi"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <RpInput
          label="Dynamic Commission Max (per item)"
          value={c.dynamicCommissionMax}
          onChange={(v) => updateConfig("tokopedia", { dynamicCommissionMax: v })}
          help="Maksimum Rp40.000 per item"
        />
        <RpInput
          label="Order Processing Fee"
          value={c.orderProcessingFee}
          onChange={(v) => updateConfig("tokopedia", { orderProcessingFee: v })}
          help="Default Rp1.250/order"
        />
      </div>
      <PercentInput
        label="Komisi Affiliate"
        value={c.affiliateRate}
        onChange={(v) => updateConfig("tokopedia", { affiliateRate: v })}
        help="0% jika tidak pakai affiliate"
      />
      <div className="space-y-3 pt-2 border-t border-gray-100">
        <Toggle
          label="Seller Mall"
          value={c.isMall}
          onChange={(v) => updateConfig("tokopedia", { isMall: v })}
          help="Aktifkan jika kamu adalah seller Official Store / Mall"
        />
        {c.isMall && (
          <div className="grid grid-cols-2 gap-4">
            <PercentInput
              label="Mall Service Fee"
              value={c.mallServiceFeeRate}
              onChange={(v) => updateConfig("tokopedia", { mallServiceFeeRate: v })}
              help="Default 1.8%"
            />
            <RpInput
              label="Mall Service Fee Max"
              value={c.mallServiceFeeMax}
              onChange={(v) => updateConfig("tokopedia", { mallServiceFeeMax: v })}
              help="Maksimum Rp50.000"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function LazadaSettings() {
  const { configs, updateConfig } = useAppStore();
  const c = configs.lazada;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <PercentInput
          label="Administrative Fee"
          value={c.adminFee}
          onChange={(v) => updateConfig("lazada", { adminFee: v })}
          help="Default 1.82% untuk semua seller"
        />
        <PercentInput
          label="Commission Fee"
          value={c.commissionRate}
          onChange={(v) => updateConfig("lazada", { commissionRate: v })}
          help="2.43% - 22.5% (naik Nov 2025)"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <PercentInput
          label="Payment Processing Fee"
          value={c.paymentProcessingRate}
          onChange={(v) => updateConfig("lazada", { paymentProcessingRate: v })}
          help="~2% default"
        />
        <PercentInput
          label="Komisi Affiliate"
          value={c.affiliateRate}
          onChange={(v) => updateConfig("lazada", { affiliateRate: v })}
          help="0% jika tidak pakai affiliate"
        />
      </div>
      <div className="space-y-3 pt-2 border-t border-gray-100">
        <Toggle
          label="Free Shipping Max Program"
          value={c.freeShippingMax}
          onChange={(v) => updateConfig("lazada", { freeShippingMax: v })}
          help="Aktifkan jika seller ikut program Free Shipping Max (biaya +4%)"
        />
        <Toggle
          label="LazMall Seller"
          value={c.isLazMall}
          onChange={(v) => updateConfig("lazada", { isLazMall: v })}
          help="Aktifkan jika kamu adalah seller LazMall"
        />
      </div>
    </div>
  );
}

const SETTINGS_COMPONENTS: Record<string, React.FC> = {
  shopee: ShopeeSettings,
  tokopedia: TokopediaSettings,
  lazada: LazadaSettings,
};

export default function SettingsPage() {
  const [active, setActive] = useState<"shopee" | "tokopedia" | "lazada">("shopee");

  const tabs = (["shopee", "tokopedia", "lazada"] as const).map((mp) => ({
    id: mp,
    label: MARKETPLACE_LABELS[mp],
  }));

  const ActiveComponent = SETTINGS_COMPONENTS[active];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <AppSidebar />
      <div className="flex-1 max-w-2xl w-full mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Konfigurasi Fee Marketplace</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Atur persentase biaya sesuai kondisi seller kamu. Marketplace sering mengubah fee — perbarui di sini jika ada perubahan.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex border-b border-gray-100">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  active === tab.id
                    ? "text-slate-800 border-b-2 border-slate-800"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="p-5">
            <ActiveComponent />
          </div>
        </div>

        <p className="text-xs text-slate-400 mt-4 text-center">
          Pengaturan disimpan otomatis ke browser kamu
        </p>
      </div>
    </div>
  );
}
