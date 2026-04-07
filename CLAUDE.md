# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev          # Start dev server (outputs to .next-dev/ to avoid conflicts with prod build)
npm run build        # Production build (outputs to .next/)
npm run lint         # ESLint via next lint

# Database (TiDB via Drizzle ORM)
npm run db:generate  # Generate migration files from schema changes
npm run db:migrate   # Run pending migrations
npm run db:push      # Push schema directly to DB (skipping migrations)
npm run db:studio    # Open Drizzle Studio GUI
```

Environment variables required: `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, `TIDB_DATABASE`.

## Architecture

This is a **Next.js 15 App Router** application for analyzing marketplace seller revenue across Shopee, Tokopedia/TikTok, and Lazada.

### Core Data Flow

1. **Upload** (`/upload`) — Seller uploads CSV/XLSX files from marketplace dashboards. Supported file types per marketplace:
   - *Pesanan Selesai* (completed orders) — up to 2 files (previous + current month)
   - *Transaksi Pendapatan* (income transactions) — 1 file (actual settlement data)
   - *Pesanan Cancel* and *Pesanan Failed Delivery* (optional)

2. **Parse** — `src/lib/parsers/` contains per-marketplace parsers (`shopee.ts`, `tokopedia.ts`, `lazada.ts`) plus a general `income.ts` for income transactions. `xlsxUtils.ts` handles raw XLSX-to-JSON conversion. The `/api/parse` route is the server-side entry point.

3. **Reconcile** — `src/lib/reconcile.ts` is the core engine. It joins Pesanan Selesai + Transaksi Pendapatan by Order ID. Income file is the source of truth for settlement; order files are the source of truth for product details (SKU, name, qty).

4. **Fee Calculation** — `src/lib/calculators/fee-engine.ts` computes platform fees per marketplace (commission, transaction fee, free shipping subsidy, order processing fee, vouchers, affiliate) using configs from the store.

5. **Dashboard** (`/dashboard`) — Displays `RevenueReport` with charts (`RevenueBarChart`, `FeePieChart`) and order-level breakdown table.

6. **Reports** (`/reports`) — Shows saved store reports.

7. **Settings** (`/settings`) — Per-marketplace fee rate configuration.

### State Management

`src/store/app-store.ts` — Single Zustand store with `persist` middleware (localStorage). Holds:
- `uploadSets`: per-marketplace uploaded files
- `hppEntries`: HPP (Cost of Goods) entries for margin calculation
- `configs`: per-marketplace fee configurations
- `report`: the current computed `RevenueReport`
- `savedReports`: array of `SavedStoreReport` (also synced to TiDB via API)

### Key Types (`src/lib/types.ts`)

- `RawOrder` — parsed from marketplace order files
- `IncomeTransaction` — parsed from income/settlement files
- `CalculatedOrder` — `RawOrder` + HPP + `OrderFeeBreakdown` + margin fields
- `RevenueReport` — aggregated result with per-marketplace `MarketplaceSummary` + all `CalculatedOrder[]`
- `MarketplaceUploadSet` — groups all files for one marketplace

### Database

TiDB (MySQL-compatible) via Drizzle ORM. Single table: `saved_reports` (`src/lib/db/schema.ts`) stores `RevenueReport` as JSON blob, keyed by `userId` + `marketplace`.

### Export

`src/lib/export/excel.ts` and `pdf.ts` handle report export using `xlsx` and `@react-pdf/renderer`.

### Upload Validation

`src/lib/validation/uploadValidator.ts` — validates file structure and detects marketplace format before parsing.
