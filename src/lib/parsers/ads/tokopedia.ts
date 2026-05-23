/**
 * Module: Tokopedia Ads Parser
 * Purpose: Parse Tokopedia / TikTok Shop ads campaign export files (CSV/XLSX) into ParsedAdsRow[]
 * Used by: /api/ads/upload route when marketplace=tokopedia
 * Dependencies: parseAdsGeneric from ./generic
 * Public functions: parseAdsTokopedia
 * Side effects: none (pure transform)
 */

import { parseAdsGeneric, type ParsedAdsRow } from "./generic";

/**
 * Parse a Tokopedia or TikTok Shop ads export file.
 * Tokopedia/TikTok bilingual column headers are covered by the generic synonym table.
 */
export function parseAdsTokopedia(content: string | ArrayBuffer): ParsedAdsRow[] {
  return parseAdsGeneric(content);
}
