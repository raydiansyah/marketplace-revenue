/**
 * Module: Lazada Ads Parser
 * Purpose: Parse Lazada Sponsored Solutions export files (CSV/XLSX) into ParsedAdsRow[]
 * Used by: /api/ads/upload route when marketplace=lazada
 * Dependencies: parseAdsGeneric from ./generic
 * Public functions: parseAdsLazada
 * Side effects: none (pure transform)
 */

import { parseAdsGeneric, type ParsedAdsRow } from "./generic";

/**
 * Parse a Lazada Sponsored Solutions ads export file.
 * Lazada's English column headers are covered by the generic synonym table.
 */
export function parseAdsLazada(content: string | ArrayBuffer): ParsedAdsRow[] {
  return parseAdsGeneric(content);
}
