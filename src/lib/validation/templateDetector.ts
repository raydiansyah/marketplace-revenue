/**
 * Module: Template Detector
 * Purpose: Score-based marketplace file format detection from header rows
 * Used by: uploadValidator.ts
 * Dependencies: headerDictionary.ts (TemplateSpec, normalizeHeader, resolveCanonical, getTemplateSpecs)
 * Public functions: detectTemplate, scoreSheetAgainstTemplate
 * Side effects: none (pure computation)
 */

import {
  type FileRole,
  type MarketplaceId,
  type TemplateSpec,
  normalizeHeader,
  resolveCanonical,
  getTemplateSpecs,
} from "./headerDictionary";

export interface ScoreResult {
  score: number;
  requiredHits: number;
  missingRequired: string[]; // canonical names of must-headers that had no match
}

export interface DetectionResult {
  template: TemplateSpec;
  score: number;
  requiredHits: number;
  missingRequired: string[];
  sheetIndex: number; // index into the sheets[] array that matched
  headerRow: string[]; // the raw header row that was matched
}

// ─────────────────────────────────────────────────────────────────────────────
// Score a single header row against one TemplateSpec
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score a header row against a template.
 *
 * Scoring:
 *   +10 per required (must) header hit
 *   +2  per optional header hit
 *   -5  per missing required header
 */
export function scoreSheetAgainstTemplate(
  headerRow: string[],
  template: TemplateSpec
): ScoreResult {
  let requiredHits = 0;
  const missingRequired: string[] = [];
  let optionalHits = 0;

  for (const mustHeader of template.must) {
    const hit = headerRow.some((raw) => resolveCanonical(raw, mustHeader));
    if (hit) {
      requiredHits++;
    } else {
      missingRequired.push(mustHeader.canonical);
    }
  }

  for (const optHeader of template.optional) {
    const hit = headerRow.some((raw) => resolveCanonical(raw, optHeader));
    if (hit) optionalHits++;
  }

  const score =
    requiredHits * 10 + optionalHits * 2 - missingRequired.length * 5;

  return { score, requiredHits, missingRequired };
}

// ─────────────────────────────────────────────────────────────────────────────
// Find the header row within up to the first 20 rows of a sheet
// ─────────────────────────────────────────────────────────────────────────────

function findHeaderRowInSheet(
  rows: string[][],
  template: TemplateSpec
): { headerRow: string[]; rowIndex: number; scoreResult: ScoreResult } | null {
  const maxScan = Math.min(rows.length, 20);
  let best: {
    headerRow: string[];
    rowIndex: number;
    scoreResult: ScoreResult;
  } | null = null;

  for (let i = 0; i < maxScan; i++) {
    const row = rows[i] ?? [];
    const nonEmpty = row.filter((c) => normalizeHeader(c) !== "");
    if (nonEmpty.length < 2) continue;

    const result = scoreSheetAgainstTemplate(row, template);
    if (result.requiredHits >= template.requiredMin) {
      if (!best || result.score > best.scoreResult.score) {
        best = { headerRow: row, rowIndex: i, scoreResult: result };
      }
    }
  }

  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main detection function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect the best-matching TemplateSpec across all provided sheets.
 *
 * @param sheets - array of { name, rows } where rows are raw 2D string arrays
 * @param hints  - optional filter to narrow candidates by marketplace or role
 * @returns DetectionResult for the best candidate, or null if none qualifies
 */
export function detectTemplate(
  sheets: { name: string; rows: string[][] }[],
  hints?: { marketplace?: MarketplaceId; role?: FileRole }
): DetectionResult | null {
  const allSpecs = getTemplateSpecs();

  let candidates = [...allSpecs];
  if (hints?.marketplace) {
    candidates = candidates.filter(
      (s) => s.marketplace === hints.marketplace
    );
  }
  if (hints?.role) {
    candidates = candidates.filter((s) => s.role === hints.role);
  }

  let best: DetectionResult | null = null;

  for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
    const sheet = sheets[sheetIndex];
    if (!sheet) continue;

    for (const template of candidates) {
      const found = findHeaderRowInSheet(sheet.rows, template);
      if (!found) continue;

      const { scoreResult, headerRow } = found;
      if (scoreResult.requiredHits < template.requiredMin) continue;

      const candidate: DetectionResult = {
        template,
        score: scoreResult.score,
        requiredHits: scoreResult.requiredHits,
        missingRequired: scoreResult.missingRequired,
        sheetIndex,
        headerRow,
      };

      if (!best || candidate.score > best.score) {
        best = candidate;
      }
    }
  }

  return best;
}
