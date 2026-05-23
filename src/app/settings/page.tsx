/**
 * Module: Settings Page
 * Purpose: Konfigurasi fee marketplace per-seller + profil & keamanan akun
 * Used by: AppSidebar ("Pengaturan" link)
 * Dependencies: useAppStore, useAuth, useNotification, lucide-react
 * Public functions: SettingsPage (default export)
 * Side effects:
 *   - updateConfig() → writes Zustand store (persisted localStorage)
 *   - submitPasswordChange() → POST /api/auth/password
 */
"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Settings2, Lock } from "lucide-react";
import AuthAreaLayout from "@/components/AuthAreaLayout";
import { useAppStore } from "@/store/app-store";
import { MARKETPLACE_LABELS } from "@/lib/types";
import { useAuth } from "@/lib/auth/auth-context";
import { useNotification } from "@/lib/notifications/notification-context";
import { validateStrongPassword } from "@/lib/auth/password-policy";

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
      <label className="block text-xs font-medium text-[var(--text-subtle)] mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={(value * 100).toFixed(2)}
          onChange={(e) => onChange(parseFloat(e.target.value) / 100 || 0)}
          step="0.01"
          className="field-input pr-8"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-subtle)]">%</span>
      </div>
      {help && <p className="text-xs text-[var(--text-subtle)] mt-0.5">{help}</p>}
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
      <label className="block text-xs font-medium text-[var(--text-subtle)] mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-subtle)]">Rp</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="field-input pl-9"
        />
      </div>
      {help && <p className="text-xs text-[var(--text-subtle)] mt-0.5">{help}</p>}
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
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-all flex-shrink-0 mt-0.5 border ${
          value
            ? "bg-[var(--brand)] border-[var(--brand)]"
            : "bg-[var(--surface-soft)] border-[var(--border-subtle)] hover:bg-[var(--hover-strong)]"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            value ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
      <div>
        <p className="text-xs font-medium text-[var(--foreground)]">{label}</p>
        {help && <p className="text-xs text-[var(--text-subtle)]">{help}</p>}
      </div>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="pt-3 border-t border-[var(--border-subtle)]">
      <p className="text-[11px] font-semibold text-[var(--text-subtle)] uppercase tracking-[0.1em] mb-3">
        {label}
      </p>
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

      <SectionDivider label="Program Opsional" />
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
  );
}

function TokopediaSettings() {
  const { configs, updateConfig } = useAppStore();
  const c = configs.tokopedia;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/8 px-3 py-2.5">
        <span className="mt-0.5 inline-block w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
        <p className="text-xs text-blue-400">
          Konfigurasi ini dipakai untuk Tokopedia dan TikTok Shop (model fee gabungan).
        </p>
      </div>
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
      <SectionDivider label="Seller Tipe" />
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
      <SectionDivider label="Program Opsional" />
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
  );
}

const SETTINGS_COMPONENTS: Record<string, React.FC> = {
  shopee: ShopeeSettings,
  tokopedia: TokopediaSettings,
  lazada: LazadaSettings,
};

function PasswordChecklistItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${ok ? "text-[var(--positive)]" : "text-[var(--text-subtle)]"}`}>
      <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ${ok ? "text-[var(--positive)]" : "text-[var(--text-muted)]"}`} />
      <span>{label}</span>
    </div>
  );
}

function ProfileSecuritySettings() {
  const { user } = useAuth();
  const { notify } = useNotification();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const strength = useMemo(() => validateStrongPassword(newPassword), [newPassword]);

  const submitPasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      notify("warning", "Semua field password wajib diisi.");
      return;
    }
    if (newPassword !== confirmPassword) {
      notify("error", "Konfirmasi password tidak cocok.");
      return;
    }
    if (!strength.isValid) {
      notify("warning", "Password baru belum memenuhi kriteria kuat.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = Array.isArray(data?.details) ? ` ${data.details.join(" ")}` : "";
        notify("error", `${data?.error ?? "Gagal memperbarui password."}${details}`);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify("success", "Password berhasil diperbarui.");
    } catch {
      notify("warning", "Terjadi kesalahan saat update password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel-card mt-6">
      <div className="p-5 border-b border-[var(--border-subtle)] flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
          <Lock className="w-4 h-4 text-[var(--accent)]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Profil & Keamanan</h2>
          <p className="text-xs text-[var(--text-subtle)] mt-0.5">
            Kelola identitas akun dan ubah password dengan standar strong password.
          </p>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2.5">
            <p className="text-[11px] font-medium text-[var(--text-subtle)] uppercase tracking-wide">Email</p>
            <p className="text-sm font-medium text-[var(--foreground)] mt-0.5">{user?.email ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3 py-2.5">
            <p className="text-[11px] font-medium text-[var(--text-subtle)] uppercase tracking-wide">Role</p>
            <p className="text-sm font-medium text-[var(--foreground)] mt-0.5 capitalize">{user?.role ?? "—"}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-subtle)] mb-1">Password Lama</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="field-input"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-subtle)] mb-1">Password Baru</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="field-input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-subtle)] mb-1">Konfirmasi Password Baru</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="field-input"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-3.5">
          <div className="flex items-center gap-2 mb-2.5">
            <CircleAlert className="w-4 h-4 text-[var(--text-subtle)] flex-shrink-0" />
            <p className="text-xs font-semibold text-[var(--foreground)]">Kriteria Strong Password</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-y-1.5">
            <PasswordChecklistItem ok={strength.checks.minLength} label="Minimal 12 karakter" />
            <PasswordChecklistItem ok={strength.checks.maxLength} label="Maksimal 72 byte" />
            <PasswordChecklistItem ok={strength.checks.hasLower} label="Ada huruf kecil (a-z)" />
            <PasswordChecklistItem ok={strength.checks.hasUpper} label="Ada huruf besar (A-Z)" />
            <PasswordChecklistItem ok={strength.checks.hasNumber} label="Ada angka (0-9)" />
            <PasswordChecklistItem ok={strength.checks.hasSymbol} label="Ada simbol (!@#$...)" />
            <PasswordChecklistItem ok={strength.checks.notCommon} label="Bukan password umum" />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={submitPasswordChange}
            disabled={saving}
            className="px-4 py-2 rounded-lg action-primary text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Update Password"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [active, setActive] = useState<"shopee" | "tokopedia" | "lazada">("shopee");

  const tabs = (["shopee", "tokopedia", "lazada"] as const).map((mp) => ({
    id: mp,
    label: MARKETPLACE_LABELS[mp],
  }));

  const ActiveComponent = SETTINGS_COMPONENTS[active];

  return (
    <AuthAreaLayout contentClassName="px-4 py-8 sm:px-6">
      <div className="max-w-2xl w-full mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0">
            <Settings2 className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Konfigurasi Fee Marketplace</h1>
            <p className="text-sm text-[var(--text-subtle)] mt-0.5">
              Atur persentase biaya sesuai kondisi seller kamu.
            </p>
          </div>
        </div>

        {/* Fee Config Card */}
        <div className="panel-card">
          <div className="flex border-b border-[var(--border-subtle)]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  active === tab.id
                    ? "text-[var(--accent)] border-b-2 border-[var(--accent)]"
                    : "text-[var(--text-subtle)] hover:text-[var(--foreground)]"
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

        <p className="text-xs text-[var(--text-subtle)] mt-3 text-center">
          Pengaturan disimpan otomatis ke akun kamu
        </p>

        <ProfileSecuritySettings />
      </div>
    </AuthAreaLayout>
  );
}
