import type { HppEntry } from "../types";

// ──────────────────────────────────────────────────────────────
// HPP Lookup — shared between reconcile.ts and fee-engine.ts
// ──────────────────────────────────────────────────────────────

function normalizeSku(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/^'+/, "")
    .replace(/\.0+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function normalizeName(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitSkuAliases(value: string): string[] {
  return String(value ?? "")
    .split(/[,\n;|/]+/g)
    .map((part) => normalizeSku(part))
    .filter(Boolean);
}

/**
 * Cari HPP per unit untuk order berdasarkan SKU dan nama produk.
 *
 * Prioritas lookup:
 * 1. Exact SKU match (termasuk multi-alias dari e.sku + e.masterSku)
 * 2. Product name fuzzy match (exact > substring > token overlap >= 2)
 *    — jika SKU ada tapi tidak ketemu, hanya pakai hasil nama bila cost tidak ambigu
 *
 * @returns HPP per unit, atau 0 jika tidak ditemukan
 */
export function lookupHpp(sku: string, productName: string, hppEntries: HppEntry[]): number {
  if (!hppEntries.length) return 0;

  const normalizedSku = normalizeSku(sku);
  const normalizedProductName = normalizeName(productName);

  if (normalizedSku) {
    const bySkuExact = hppEntries.find((e) => {
      if (e.cost <= 0) return false;
      const aliases = new Set<string>([
        ...splitSkuAliases(e.sku),
        ...splitSkuAliases(e.masterSku || ""),
      ]);
      return aliases.has(normalizedSku);
    });
    if (bySkuExact) return bySkuExact.cost;
  }

  if (!normalizedProductName) return 0;

  const scored = hppEntries
    .map((entry) => {
      const entryName = normalizeName(entry.productName);
      if (!entryName) return { entry, score: 0 };
      if (entryName === normalizedProductName) return { entry, score: 100 };
      if (normalizedProductName.includes(entryName) || entryName.includes(normalizedProductName)) {
        return { entry, score: 80 };
      }

      const a = new Set(normalizedProductName.split(" ").filter(Boolean));
      const b = new Set(entryName.split(" ").filter(Boolean));
      const overlap = [...a].filter((token) => b.has(token)).length;
      const score = overlap >= 2 ? overlap * 10 : 0;
      return { entry, score };
    })
    .filter((item) => item.score > 0)
    .sort((x, y) => y.score - x.score);

  const withCost = scored.find((item) => item.entry.cost > 0);
  if (!withCost) return scored[0]?.entry.cost ?? 0;

  // Jika SKU ada tapi tidak ketemu exact, fallback nama hanya dipakai bila tidak ambigu.
  // Mencegah kasus product name sama dengan HPP berbeda antar SKU (contoh pack vs pcs).
  if (normalizedSku) {
    const distinctCosts = new Set(
      scored
        .map((item) => item.entry.cost)
        .filter((cost) => cost > 0)
    );
    return distinctCosts.size === 1 ? withCost.entry.cost : 0;
  }

  return withCost.entry.cost;
}
