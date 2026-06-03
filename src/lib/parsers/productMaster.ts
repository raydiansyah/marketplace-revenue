/**
 * Module: Product Master Parser
 * Purpose: Parse HPP (cost-of-goods) master file into HppEntry[] for margin calculation
 * Used by: src/app/hpp/page.tsx, HppManager component, reconcile.ts
 * Dependencies: xlsxUtils.readFileToRows, types.HppEntry,
 *               validation/headerDictionary.normalizeHeader (column normalization)
 * Public functions: parseProductMasterFile(), parseProductMasterFileWithMeta()
 * Side effects: none
 */
import type { HppEntry } from "../types";
import { readFileToRows } from "./xlsxUtils";
import { normalizeHeader } from "../validation/headerDictionary";

export interface ProductMasterParseResult {
  entries: HppEntry[];
  duplicateKeys: string[];
  duplicateLabels: string[];
}

/**
 * Find a column value by candidate header names.
 * Uses normalizeHeader from headerDictionary for consistent normalization.
 * Matches any candidate that is a substring of the column key or vice-versa.
 */
function findColumn(row: Record<string, string>, candidates: string[]): string {
  const normalizedCandidates = candidates.map(normalizeHeader);
  for (const key of Object.keys(row)) {
    const keyLower = normalizeHeader(key);
    if (
      normalizedCandidates.some(
        (candidate) => keyLower.includes(candidate) || candidate.includes(keyLower)
      )
    ) {
      return row[key] ?? "";
    }
  }
  return "";
}

function parseAmount(value: string): number {
  if (!value) return 0;
  const raw = String(value)
    .replace(/\(([^)]+)\)/, "-$1")
    .replace(/[Rp\s]/gi, "");

  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  let normalized = raw;

  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = /,\d{1,2}$/.test(raw) ? raw.replace(",", ".") : raw.replace(/,/g, "");
  } else if (dot >= 0) {
    normalized = /\.\d{1,2}$/.test(raw) ? raw : raw.replace(/\./g, "");
  }

  const amount = parseFloat(normalized);
  return Number.isNaN(amount) ? 0 : amount;
}

function splitSkuValues(value: string): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/[,\n;|/]+/g)
    .map((part) =>
      String(part ?? "")
        .trim()
        .replace(/^'+/, "")
        .replace(/\.0+$/, "")
    )
    .filter((part) => part !== "" && part !== "-");
}

function normalizeSkuKey(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/^'+/, "")
    .replace(/\.0+$/, "")
    .toLowerCase();
}

type ParsedMasterRow = {
  masterProductName: string;
  variantName: string;
  masterSku: string;
  variantSku: string;
  masterVariationId: string;
  channelVariationIds: string;
  hppNew: number;
  hppOld: number;
};

type DedupEntry = {
  entry: HppEntry;
  priority: number;
};

export function parseProductMasterFileWithMeta(content: string | ArrayBuffer): ProductMasterParseResult {
  const rows = readFileToRows(content);

  const parsedRows: ParsedMasterRow[] = rows
    .map((row): ParsedMasterRow | null => {
      const masterProductName = findColumn(row, ["master product name", "nama produk", "product name"]).trim();
      const variantName = findColumn(row, ["varian name", "variant name", "nama varian", "variant"]).trim();
      const masterSku = findColumn(row, ["master sku", "master-sku", "sku master", "parent sku"]).trim();
      const variantSku = findColumn(row, ["variant sku", "variant-sku", "sku varian", "seller sku"]).trim();
      const masterVariationId = findColumn(row, ["master variation id", "parent variation id"]).trim();
      const channelVariationIds = findColumn(row, [
        "channel variation id",
        "channel variation",
        "channel sku",
        "sku channel",
      ]).trim();

      const hppNew = parseAmount(findColumn(row, ["hpp new", "hpp baru"]));
      const hppOld = parseAmount(findColumn(row, ["hpp old", "hpp lama"]));

      if (
        !masterProductName &&
        !variantName &&
        !masterSku &&
        !variantSku &&
        !masterVariationId &&
        !channelVariationIds
      ) {
        return null;
      }

      return {
        masterProductName,
        variantName,
        masterSku,
        variantSku,
        masterVariationId,
        channelVariationIds,
        hppNew,
        hppOld,
      };
    })
    .filter((row): row is ParsedMasterRow => row !== null);

  const entries: Array<{ entry: HppEntry; priority: number }> = parsedRows.flatMap((row) => {
    const productName = [row.masterProductName, row.variantName]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" - ") || row.masterProductName || row.variantName;

    // Rule final:
    // 1) HPP New (kolom H) per Master SKU
    // 2) fallback ke HPP Old (kolom G) jika HPP New kosong/0
    const cost = row.hppNew > 0
      ? row.hppNew
      : row.hppOld > 0
        ? row.hppOld
        : 0;

    const priority = row.hppNew > 0 ? 2 : row.hppOld > 0 ? 1 : 0;

    const skuCandidates = Array.from(
      new Set(
        [
          ...splitSkuValues(row.variantSku),
          ...splitSkuValues(row.masterSku),
          ...splitSkuValues(row.masterVariationId),
          ...splitSkuValues(row.channelVariationIds),
        ].map((value) => value.trim()).filter(Boolean)
      )
    );

    const masterSkuCandidates = Array.from(
      new Set(
        splitSkuValues(row.masterSku)
          .map((value) => value.trim())
          .filter(Boolean)
      )
    );

    const normalizedMasterSku = masterSkuCandidates[0] ?? "";

    if (skuCandidates.length === 0) {
      return [{
        entry: {
          sku: "",
          productName: productName.trim(),
          masterProductName: row.masterProductName.trim(),
          masterSku: normalizedMasterSku,
          cost,
        },
        priority,
      }];
    }

    return skuCandidates.map((sku) => ({
      entry: {
        sku,
        productName: productName.trim(),
        masterProductName: row.masterProductName.trim(),
        masterSku: normalizedMasterSku,
        cost,
      },
      priority,
    }));
  });

  const dedup = new Map<string, DedupEntry>();
  const duplicateKeys = new Set<string>();
  const duplicateLabels = new Set<string>();
  for (const { entry, priority } of entries) {
    const key = entry.sku
      ? `sku:${normalizeSkuKey(entry.sku)}`
      : `name:${entry.productName.toLowerCase()}|cost:${entry.cost}`;
    if (dedup.has(key)) {
      duplicateKeys.add(key);
      duplicateLabels.add(entry.sku || entry.productName || key);
    }

    const existing = dedup.get(key);
    if (!existing) {
      dedup.set(key, { entry, priority });
      continue;
    }

    const existingScore = existing.priority * 10 + (existing.entry.cost > 0 ? 1 : 0);
    const nextScore = priority * 10 + (entry.cost > 0 ? 1 : 0);
    if (nextScore >= existingScore) {
      dedup.set(key, { entry, priority });
    }
  }

  return {
    entries: [...dedup.values()].map((item) => item.entry),
    duplicateKeys: [...duplicateKeys],
    duplicateLabels: [...duplicateLabels],
  };
}

export function parseProductMasterFile(content: string | ArrayBuffer): HppEntry[] {
  return parseProductMasterFileWithMeta(content).entries;
}
