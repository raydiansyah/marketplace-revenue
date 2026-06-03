/**
 * Module: Currency Formatter
 * Purpose: Centralized IDR formatting utilities
 * Used by: All pages displaying monetary values (dashboard, reports, ads, cashflow)
 * Dependencies: Intl.NumberFormat (browser/Node built-in)
 * Public functions: formatRupiah(), formatCompact(), formatNumber()
 * Side effects: None
 */

// Full format: Rp 1.250.000
export function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Compact format: Rp 1,25 jt / Rp 2,5 M
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) {
    return `Rp ${(value / 1_000_000_000).toFixed(1)} M`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `Rp ${(value / 1_000_000).toFixed(1)} jt`;
  }
  if (Math.abs(value) >= 1_000) {
    return `Rp ${(value / 1_000).toFixed(0)} rb`;
  }
  return formatRupiah(value);
}

// Plain number with thousand separator
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}
