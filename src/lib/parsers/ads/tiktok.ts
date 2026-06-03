/**
 * Module: TikTok Ads Parser
 * Purpose: Parse TikTok Ads Manager export files (CSV/XLSX) into ParsedAdsRow[]
 * Used by: /api/ads/upload route when marketplace=tokopedia (TikTok Shop uses same marketplace slot)
 * Dependencies: parseAdsGeneric from ./generic
 * Public functions: parseAdsTikTok
 * Side effects: none (pure transform)
 */

import { parseAdsGeneric, type ParsedAdsRow } from "./generic";

/**
 * Parse a TikTok Ads Manager export file.
 * TikTok's English column headers are covered by the generic synonym table.
 */
export function parseAdsTikTok(content: string | ArrayBuffer): ParsedAdsRow[] {
  return parseAdsGeneric(content);
}
