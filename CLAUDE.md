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

## Context Mode & Performance Rules

### Context Mode (MANDATORY)
- ALL commands that read/query/analyze → use `ctx_execute` or `ctx_execute_file`
- Whitelist Bash only for: file mutations, git writes, navigation, process control, package install, echo
- Web/API fetch → `ctx_fetch_and_index` → `ctx_search`
- Large file analysis → ctx_execute_file (analyze in sandbox, print summary only)
- NEVER dump raw large output to context

### TiDB/Drizzle ORM Optimization (CRITICAL)
- ALWAYS check for N+1 query patterns in Drizzle/SQL code
- N+1 detection: loop over items + query/access relation per item
- N+1 fixes:
  - Eager load: use `innerJoin`, `leftJoin`, or `with()` for relations
  - Batch: collect IDs → `inArray(ids)` or raw `WHERE id IN (...)`
  - Aggregate: use `sql<number>` template or Drizzle aggregations
  - Index: check `EXPLAIN` or query analyzer
- Use select/projection to avoid overfetch: `.select({id: true, name: true})`
- Prefer prepared statements for repeated queries
- Connection pooling: TiDB handles this; ensure query is not held longer than needed
- Batch inserts/updates: use Drizzle's `.values([])` for bulk operations
- Avoid `SELECT *` — always narrow columns
- Cache expensive computations: server-side TTL cache

### File Parsing Optimization
- CSV/XLSX parsing is CPU-bound → process in server action, not client
- Large files (>5MB): warn user, consider streaming/chunked parsing
- Reuse parser instances; avoid re-parsing same file
- Use `xlsxUtils.ts` for consistent parsing; don't mix parser approaches

### Ask When Ambiguous
- Requirements unclear → ask user first
- DB migration impact → ask before proceeding
- Breaking changes → ask before proceeding
- Don't guess, don't assume

### Todo Tracking (MANDATORY)
- Multi-step tasks → create todo list
- Mark in_progress when starting
- Mark completed when done
- Use blockedBy for dependencies

### MCP & Subagent
- Use MCP tools when available (Context7, etc.)
- Delegate complex work to subagents: researcher, planner, reviewer, coder, tester
- Use skill injection: supabase, backend-testing, laravel-specialist
