/**
 * Module: Utils
 * Purpose: Shared utility functions — class merging (cn) and formatting helpers
 * Used by: All pages and components throughout the app
 * Dependencies: clsx, tailwind-merge
 * Public functions: cn(), formatRupiah(), formatPercent(), formatNumber()
 * Side effects: None
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}
