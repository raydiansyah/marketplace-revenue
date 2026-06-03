/**
 * Module: Shopee Ads Parser
 * Purpose: Parse Shopee ads campaign export files (CSV/XLSX) into ParsedAdsRow[]
 * Used by: /api/ads/upload route when marketplace=shopee
 * Dependencies: parseAdsGeneric from ./generic
 * Public functions: parseAdsShopee
 * Side effects: none (pure transform)
 */

import { parseAdsGeneric, type ParsedAdsRow } from "./generic";

/**
 * Parse a Shopee ads export file.
 * Shopee's bilingual column headers (Indonesian/English) are already covered
 * by the generic parser's synonym table, so this is a thin named wrapper.
 */
export function parseAdsShopee(content: string | ArrayBuffer): ParsedAdsRow[] {
  return parseAdsGeneric(content);
}
