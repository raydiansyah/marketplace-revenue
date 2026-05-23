/**
 * Module: MonthPicker
 * Purpose: Year-month selector for upload period selection
 * Used by: /upload, /reports/new, /data-bank filter
 * Dependencies: none
 * Public functions: MonthPicker (default export)
 * Side effects: none
 */

"use client";

interface MonthPickerProps {
  value: string | null;
  onChange: (yearMonth: string) => void;
  max?: string;
  min?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Parses a "YYYY-MM" string to { year, month }.
 * Returns null if the input is null or malformed.
 */
export function parseYearMonth(value: string | null): { year: number; month: number } | null {
  if (!value) return null;
  const parts = value.split("-");
  if (parts.length !== 2) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (Number.isNaN(year) || Number.isNaN(month)) return null;
  return { year, month };
}

/** Returns current year-month string in "YYYY-MM" format. */
function currentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export default function MonthPicker({
  value,
  onChange,
  max,
  min = "2023-01",
  disabled,
  id,
}: MonthPickerProps) {
  const resolvedMax = max ?? currentYearMonth();

  return (
    <input
      id={id}
      type="month"
      value={value ?? ""}
      min={min}
      max={resolvedMax}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value) onChange(e.target.value);
      }}
      className="field-input"
      style={{ colorScheme: "light dark" }}
    />
  );
}
