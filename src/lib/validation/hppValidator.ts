/**
 * Module: HPP Validator
 * Purpose: Validate HPP rows before DB insertion — catch duplicates, invalid costs, missing names
 * Used by: src/app/api/hpp/marketplace/route.ts
 * Dependencies: none
 * Public functions: validateHppRows()
 * Side effects: none
 */

export interface HppValidationInput {
  productName: string;
  sku: string;
  cost: number;
  masterSku?: string;
  masterProductName?: string;
}

type HppWarningType = "warning_empty_sku";
type HppErrorType =
  | "error_duplicate_sku_same_marketplace"
  | "error_invalid_cost"
  | "error_missing_product_name";

export interface HppValidationIssue {
  rowIndex: number;
  type: HppWarningType | HppErrorType;
  message: string;
}

export interface HppValidationResult {
  valid: HppValidationInput[];
  warnings: HppValidationIssue[];
  errors: HppValidationIssue[];
}

export function validateHppRows(rows: HppValidationInput[]): HppValidationResult {
  const valid: HppValidationInput[] = [];
  const warnings: HppValidationIssue[] = [];
  const errors: HppValidationIssue[] = [];
  const seenSkus = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!row.productName || row.productName.trim() === "") {
      errors.push({
        rowIndex: i,
        type: "error_missing_product_name",
        message: `Baris ${i + 1}: nama produk kosong`,
      });
      continue;
    }

    if (Number.isNaN(row.cost) || row.cost < 0) {
      errors.push({
        rowIndex: i,
        type: "error_invalid_cost",
        message: `Baris ${i + 1}: HPP tidak valid (${row.cost})`,
      });
      continue;
    }

    const sku = row.sku ?? "";

    if (sku === "") {
      warnings.push({
        rowIndex: i,
        type: "warning_empty_sku",
        message: `Baris ${i + 1}: SKU kosong — produk tetap dimasukkan tanpa SKU`,
      });
    } else {
      if (seenSkus.has(sku)) {
        errors.push({
          rowIndex: i,
          type: "error_duplicate_sku_same_marketplace",
          message: `Baris ${i + 1}: SKU duplikat dalam batch ini (${sku})`,
        });
        continue;
      }
      seenSkus.add(sku);
    }

    valid.push({ ...row, sku });
  }

  return { valid, warnings, errors };
}
