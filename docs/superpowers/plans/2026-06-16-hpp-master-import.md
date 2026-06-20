# HPP Master Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-marketplace HPP management with a single master HPP imported from an Excel file, applicable to all marketplaces simultaneously.

**Architecture:** Make `marketplace` column nullable in `hpp_marketplace_entries` (NULL = global master). Add `hpp_sku_aliases` table for manual SKU mapping. New API routes under `/api/hpp/master`. New UI component `HppMasterManager` replaces `HppManagerTabbed`. Store `loadHpp` updates to fetch from `/api/hpp/master`.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, TiDB (MySQL-compatible), Zustand, TypeScript, Tailwind CSS, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-16-hpp-master-import-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/db/schema.ts` | Modify | Make `marketplace` nullable; add `hppSkuAliases` table |
| `src/lib/db/queries/hppMaster.ts` | Create | Query fns: list/replace master HPP, alias CRUD, unmatched lookup |
| `src/lib/db/queries/hppMarketplace.ts` | Modify | Fix `rowToEntry` for nullable `marketplace` |
| `src/app/api/hpp/master/route.ts` | Create | GET (list) + POST (import file) |
| `src/app/api/hpp/master/resolve/route.ts` | Create | POST (save SKU alias) |
| `src/components/HppUnmatchedPanel.tsx` | Create | Panel for manual SKU → master entry mapping |
| `src/components/HppMasterManager.tsx` | Create | Main HPP page component (import + table) |
| `src/app/hpp/page.tsx` | Modify | Swap `HppManagerTabbed` → `HppMasterManager` |
| `src/store/app-store.ts` | Modify | Update `loadHpp` to fetch from `/api/hpp/master` |
| `src/components/HppManagerTabbed.tsx` | Delete | Replaced by HppMasterManager |
| `src/app/api/hpp/marketplace/route.ts` | Delete | Replaced by /api/hpp/master |
| `src/app/api/hpp/marketplace/[id]/route.ts` | Delete | Replaced by /api/hpp/master |
| `src/app/api/hpp/combined/route.ts` | Delete | Replaced by /api/hpp/master |

---

## Task 1: Update DB Schema

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Make `marketplace` nullable on `hppMarketplaceEntries`**

Find this block in `src/lib/db/schema.ts` (around line 278):
```typescript
marketplace: mysqlEnum("marketplace", ["shopee", "tokopedia", "lazada"]).notNull(),
```

Change to:
```typescript
marketplace: mysqlEnum("marketplace", ["shopee", "tokopedia", "lazada"]),
```

- [ ] **Step 2: Add `hppSkuAliases` table after the `hppMarketplaceEntries` block (after line ~294)**

```typescript
// ============================================================
// HPP SKU ALIASES (master import manual mapping)
// ============================================================

export const hppSkuAliases = mysqlTable(
  "hpp_sku_aliases",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    userId: varchar("user_id", { length: 40 }).notNull(),
    orderSku: varchar("order_sku", { length: 191 }).notNull(),
    masterEntryId: varchar("master_entry_id", { length: 40 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    userOrderSkuIdx: index("idx_hpp_aliases_user_sku").on(t.userId, t.orderSku),
  })
);

export type HppSkuAliasRow = typeof hppSkuAliases.$inferSelect;
export type NewHppSkuAliasRow = typeof hppSkuAliases.$inferInsert;
```

- [ ] **Step 3: Update the header doc comment at line 1 to include new table and phase**

Add `hppSkuAliases` to the Tables list and add: `* Phase 8: hppSkuAliases added for master HPP import manual mapping; hppMarketplaceEntries.marketplace made nullable`

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(schema): make hpp marketplace nullable, add hpp_sku_aliases table"
```

---

## Task 2: Run Database Migration

**Files:**
- No code files — DB migration only

- [ ] **Step 1: Generate migration files**

```bash
npm run db:generate
```

Expected: new files created in `drizzle/` or `migrations/` directory.

- [ ] **Step 2: Review generated migration SQL**

Open the generated migration file. Verify it contains:
1. `ALTER TABLE hpp_marketplace_entries MODIFY COLUMN marketplace ...` (nullable)
2. `CREATE TABLE hpp_sku_aliases ...`

If the migration looks wrong, do NOT run it — check `schema.ts` edits for errors.

- [ ] **Step 3: Run migration against database**

```bash
npm run db:migrate
```

Expected: migration completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add drizzle/
git commit -m "feat(migration): hpp_marketplace_entries nullable marketplace, add hpp_sku_aliases"
```

---

## Task 3: Fix `hppMarketplace.ts` for nullable `marketplace`

**Files:**
- Modify: `src/lib/db/queries/hppMarketplace.ts`

After Task 1, `hppMarketplaceEntries.marketplace` is now nullable in the Drizzle schema. The existing `rowToEntry` casts it as `MarketplaceId` — this will now be a TypeScript error.

- [ ] **Step 1: Update `rowToEntry` to handle nullable marketplace**

Find the `rowToEntry` function (line ~19):
```typescript
function rowToEntry(row: typeof hppMarketplaceEntries.$inferSelect): HppMarketplaceEntry {
  return {
    id: row.id,
    userId: row.userId,
    marketplace: row.marketplace as MarketplaceId,
    ...
```

Change to:
```typescript
function rowToEntry(row: typeof hppMarketplaceEntries.$inferSelect): HppMarketplaceEntry {
  return {
    id: row.id,
    userId: row.userId,
    marketplace: (row.marketplace ?? "shopee") as MarketplaceId,
    sku: row.sku,
    productName: row.productName,
    masterSku: row.masterSku ?? undefined,
    masterProductName: row.masterProductName ?? undefined,
    cost: Number(row.cost),
    sourceFileName: row.sourceFileName ?? undefined,
    uploadedAt: row.uploadedAt.toISOString(),
  };
}
```

- [ ] **Step 2: Update header doc** (line 1–9)

Change `Used by` line to:
```
 * Used by: DEPRECATED — existing data only; new imports use /api/hpp/master
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in `hppMarketplace.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/hppMarketplace.ts
git commit -m "fix(hppMarketplace): handle nullable marketplace in rowToEntry"
```

---

## Task 4: Create `hppMaster.ts` query functions

**Files:**
- Create: `src/lib/db/queries/hppMaster.ts`

- [ ] **Step 1: Create the file**

```typescript
/**
 * Module: HPP Master Queries
 * Purpose: DB query functions for HPP master entries (marketplace IS NULL) and SKU aliases
 * Used by: src/app/api/hpp/master/route.ts, src/app/api/hpp/master/resolve/route.ts
 * Dependencies: drizzle-orm, src/lib/db/client, src/lib/db/schema
 * Public functions: listHppMaster(), replaceHppMaster(), getUnmatchedOrderSkus(),
 *                   listSkuAliases(), upsertSkuAlias()
 * Side effects: DB reads/writes to hpp_marketplace_entries (marketplace IS NULL), hpp_sku_aliases
 */

import { eq, and, isNull, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/client";
import { hppMarketplaceEntries, hppSkuAliases, monthlyUploads } from "@/lib/db/schema";
import type { HppEntry } from "@/lib/types";

type AnyTx = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function rowToHppEntry(row: typeof hppMarketplaceEntries.$inferSelect): HppEntry & { id: string } {
  return {
    id: row.id,
    sku: row.sku,
    productName: row.productName,
    masterProductName: row.masterProductName ?? undefined,
    masterSku: row.masterSku ?? undefined,
    cost: Number(row.cost),
  };
}

/** List all HPP master entries (marketplace IS NULL) for a user. */
export async function listHppMaster(userId: string): Promise<Array<HppEntry & { id: string }>> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(hppMarketplaceEntries)
    .where(and(eq(hppMarketplaceEntries.userId, userId), isNull(hppMarketplaceEntries.marketplace)));
  return rows.map(rowToHppEntry);
}

/** Replace all HPP master entries for a user (DELETE WHERE marketplace IS NULL, then bulk INSERT). */
export async function replaceHppMaster(
  userId: string,
  entries: Array<{
    sku: string;
    productName: string;
    cost: number;
    masterSku?: string;
    masterProductName?: string;
    sourceFileName?: string;
  }>
): Promise<number> {
  const db = await getDb();
  await db.transaction(async (tx: AnyTx) => {
    await tx
      .delete(hppMarketplaceEntries)
      .where(and(eq(hppMarketplaceEntries.userId, userId), isNull(hppMarketplaceEntries.marketplace)));

    if (entries.length > 0) {
      await tx.insert(hppMarketplaceEntries).values(
        entries.map((e) => ({
          id: randomUUID(),
          userId,
          marketplace: null,
          sku: e.sku ?? "",
          productName: e.productName,
          masterSku: e.masterSku ?? null,
          masterProductName: e.masterProductName ?? null,
          cost: String(e.cost),
          sourceFileName: e.sourceFileName ?? null,
        }))
      );
    }
  });
  return entries.length;
}

/**
 * Get all unique SKUs from a user's order history (monthly_uploads with fileType='order')
 * that do NOT have a matching master HPP entry or SKU alias.
 */
export async function getUnmatchedOrderSkus(
  userId: string,
  masterEntries: Array<HppEntry & { id: string }>
): Promise<string[]> {
  const db = await getDb();

  // Fetch all order uploads for this user
  const uploads = await db
    .select({ parsedJson: monthlyUploads.parsedJson })
    .from(monthlyUploads)
    .where(and(eq(monthlyUploads.userId, userId), eq(monthlyUploads.fileType, "order")));

  // Extract unique SKUs from parsed order JSON
  const allOrderSkus = new Set<string>();
  for (const upload of uploads) {
    const rows = upload.parsedJson as Array<Record<string, unknown>>;
    for (const row of rows) {
      const sku = String(row.sku ?? row.sellerSku ?? row.SKU ?? "").trim();
      if (sku) allOrderSkus.add(sku);
    }
  }

  if (allOrderSkus.size === 0) return [];

  // Fetch existing aliases
  const aliases = await db
    .select({ orderSku: hppSkuAliases.orderSku })
    .from(hppSkuAliases)
    .where(eq(hppSkuAliases.userId, userId));
  const aliasedSkus = new Set(aliases.map((a) => a.orderSku));

  // Build set of all master SKUs (sku + masterSku)
  const masterSkuSet = new Set<string>();
  for (const entry of masterEntries) {
    if (entry.sku) masterSkuSet.add(entry.sku.trim().toLowerCase());
    if (entry.masterSku) masterSkuSet.add(entry.masterSku.trim().toLowerCase());
  }

  // Return SKUs from orders not found in master and not aliased
  return [...allOrderSkus].filter((sku) => {
    const normalized = sku.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
    return !masterSkuSet.has(normalized) && !aliasedSkus.has(sku);
  });
}

/** List all SKU aliases for a user as a map: orderSku → masterEntryId. */
export async function listSkuAliases(userId: string): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(hppSkuAliases)
    .where(eq(hppSkuAliases.userId, userId));
  return new Map(rows.map((r) => [r.orderSku, r.masterEntryId]));
}

/** Insert or update a SKU alias mapping. */
export async function upsertSkuAlias(
  userId: string,
  orderSku: string,
  masterEntryId: string
): Promise<void> {
  const db = await getDb();
  // Check if alias already exists
  const existing = await db
    .select({ id: hppSkuAliases.id })
    .from(hppSkuAliases)
    .where(and(eq(hppSkuAliases.userId, userId), eq(hppSkuAliases.orderSku, orderSku)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(hppSkuAliases)
      .set({ masterEntryId })
      .where(and(eq(hppSkuAliases.userId, userId), eq(hppSkuAliases.orderSku, orderSku)));
  } else {
    await db.insert(hppSkuAliases).values({
      id: randomUUID(),
      userId,
      orderSku,
      masterEntryId,
    });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors in `hppMaster.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/queries/hppMaster.ts
git commit -m "feat(hppMaster): add query functions for master HPP and SKU aliases"
```

---

## Task 5: Create `/api/hpp/master/route.ts`

**Files:**
- Create: `src/app/api/hpp/master/route.ts`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p src/app/api/hpp/master
```

- [ ] **Step 2: Write the route**

```typescript
/**
 * Module: HPP Master API — GET + POST
 * Purpose: List and import HPP master entries (marketplace-agnostic, marketplace IS NULL)
 * Used by: src/components/HppMasterManager.tsx, src/store/app-store.ts (loadHpp)
 * Dependencies: hppMaster queries, hppValidator, productMaster parser, requireSession
 * Public functions: GET (?page&limit&q), POST (multipart file import)
 * Side effects: DB reads/writes to hpp_marketplace_entries (marketplace IS NULL)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { listHppMaster, replaceHppMaster, getUnmatchedOrderSkus } from "@/lib/db/queries/hppMaster";
import { validateHppRows } from "@/lib/validation/hppValidator";
import { parseProductMasterFileWithMeta } from "@/lib/parsers/productMaster";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const q = (searchParams.get("q") ?? "").trim().toLowerCase();

    let entries = await listHppMaster(session.sub);

    if (q) {
      entries = entries.filter(
        (e) =>
          e.productName.toLowerCase().includes(q) ||
          e.sku.toLowerCase().includes(q) ||
          (e.masterSku ?? "").toLowerCase().includes(q)
      );
    }

    const total = entries.length;
    const totalPages = Math.ceil(total / limit);
    const paginated = entries.slice((page - 1) * limit, page * limit);

    return NextResponse.json({ entries: paginated, total, page, totalPages });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/hpp/master]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const contentType = req.headers.get("content-type") ?? "";

    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Content-Type harus multipart/form-data" }, { status: 415 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "file wajib diupload" }, { status: 400 });
    }

    const content = await file.arrayBuffer();
    const parseResult = parseProductMasterFileWithMeta(content);
    const validationResult = validateHppRows(
      parseResult.entries.map((e) => ({
        sku: e.sku ?? "",
        productName: e.productName,
        cost: e.cost,
        masterSku: e.masterSku,
        masterProductName: e.masterProductName,
      }))
    );

    if (validationResult.valid.length === 0) {
      return NextResponse.json(
        {
          error: "Tidak ada data valid untuk diimport",
          errors: [
            ...parseResult.duplicateLabels,
            ...validationResult.errors.map((err) => err.message),
          ],
        },
        { status: 422 }
      );
    }

    const inserted = await replaceHppMaster(
      session.sub,
      validationResult.valid.map((e) => ({ ...e, sourceFileName: file.name }))
    );

    // Fetch master entries (just inserted) to compute unmatched order SKUs
    const masterEntries = await listHppMaster(session.sub);
    const unmatchedOrderSkus = await getUnmatchedOrderSkus(session.sub, masterEntries);

    return NextResponse.json({
      inserted,
      warnings: [
        ...parseResult.duplicateLabels,
        ...validationResult.warnings.map((w) => w.message),
      ],
      errors: validationResult.errors.map((err) => err.message),
      unmatchedOrderSkus,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/hpp/master]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/hpp/master/route.ts
git commit -m "feat(api): add GET+POST /api/hpp/master for master HPP import"
```

---

## Task 6: Create `/api/hpp/master/resolve/route.ts`

**Files:**
- Create: `src/app/api/hpp/master/resolve/route.ts`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p src/app/api/hpp/master/resolve
```

- [ ] **Step 2: Write the route**

```typescript
/**
 * Module: HPP Master Resolve API — POST
 * Purpose: Save manual SKU alias mapping (order SKU → master HPP entry)
 * Used by: src/components/HppUnmatchedPanel.tsx
 * Dependencies: hppMaster queries, requireSession
 * Public functions: POST ({ orderSku, masterEntryId })
 * Side effects: DB write to hpp_sku_aliases
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { upsertSkuAlias, listHppMaster } from "@/lib/db/queries/hppMaster";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json() as { orderSku?: unknown; masterEntryId?: unknown };

    const orderSku = typeof body.orderSku === "string" ? body.orderSku.trim() : "";
    const masterEntryId = typeof body.masterEntryId === "string" ? body.masterEntryId.trim() : "";

    if (!orderSku) {
      return NextResponse.json({ error: "orderSku wajib diisi" }, { status: 400 });
    }
    if (!masterEntryId) {
      return NextResponse.json({ error: "masterEntryId wajib diisi" }, { status: 400 });
    }

    // Verify masterEntryId belongs to this user
    const masterEntries = await listHppMaster(session.sub);
    const valid = masterEntries.some((e) => e.id === masterEntryId);
    if (!valid) {
      return NextResponse.json({ error: "masterEntryId tidak valid" }, { status: 404 });
    }

    await upsertSkuAlias(session.sub, orderSku, masterEntryId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/hpp/master/resolve]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/hpp/master/resolve/route.ts
git commit -m "feat(api): add POST /api/hpp/master/resolve for SKU alias mapping"
```

---

## Task 7: Create `HppUnmatchedPanel.tsx`

**Files:**
- Create: `src/components/HppUnmatchedPanel.tsx`

- [ ] **Step 1: Create the file**

```typescript
/**
 * Module: HppUnmatchedPanel
 * Purpose: Panel for manually mapping unmatched order SKUs to master HPP entries
 * Used by: src/components/HppMasterManager.tsx
 * Dependencies: /api/hpp/master/resolve, lucide-react, formatRupiah
 * Public functions: HppUnmatchedPanel (default export)
 * Side effects: POST /api/hpp/master/resolve for each resolved mapping
 */

"use client";

import { useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import type { HppEntry } from "@/lib/types";

interface Props {
  unmatchedSkus: string[];
  masterEntries: Array<HppEntry & { id: string }>;
  onResolve: (orderSku: string, masterEntryId: string) => Promise<void>;
  onDismiss: () => void;
}

export default function HppUnmatchedPanel({ unmatchedSkus, masterEntries, onResolve, onDismiss }: Props) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  async function handleSave(orderSku: string) {
    const masterEntryId = selections[orderSku];
    if (!masterEntryId) return;
    setSaving((prev) => ({ ...prev, [orderSku]: true }));
    try {
      await onResolve(orderSku, masterEntryId);
      setSaved((prev) => ({ ...prev, [orderSku]: true }));
    } finally {
      setSaving((prev) => ({ ...prev, [orderSku]: false }));
    }
  }

  const pending = unmatchedSkus.filter((sku) => !saved[sku]);

  if (pending.length === 0) return null;

  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-yellow-300">
            {pending.length} SKU dari riwayat order tidak ditemukan di HPP master
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-yellow-400/60 hover:text-yellow-300 shrink-0"
          title="Tutup panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        {pending.map((orderSku) => (
          <div key={orderSku} className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-yellow-200 bg-yellow-900/40 px-2 py-1 rounded shrink-0">
              {orderSku}
            </span>
            <span className="text-xs text-yellow-400/60 shrink-0">→</span>
            <select
              value={selections[orderSku] ?? ""}
              onChange={(e) =>
                setSelections((prev) => ({ ...prev, [orderSku]: e.target.value }))
              }
              className="flex-1 min-w-[200px] text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-zinc-200 focus:outline-none focus:border-zinc-400"
            >
              <option value="">— Pilih produk master —</option>
              {masterEntries.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.productName} ({entry.sku}) — {formatRupiah(entry.cost)}
                </option>
              ))}
            </select>
            <button
              onClick={() => handleSave(orderSku)}
              disabled={!selections[orderSku] || saving[orderSku]}
              className="text-xs px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed rounded text-white font-medium shrink-0 flex items-center gap-1"
            >
              {saving[orderSku] ? (
                <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Simpan
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/components/HppUnmatchedPanel.tsx
git commit -m "feat(ui): add HppUnmatchedPanel for manual SKU alias mapping"
```

---

## Task 8: Create `HppMasterManager.tsx`

**Files:**
- Create: `src/components/HppMasterManager.tsx`

- [ ] **Step 1: Create the file**

```typescript
/**
 * Module: HppMasterManager
 * Purpose: Main HPP management UI — import master Excel file and display HPP master table
 * Used by: src/app/hpp/page.tsx
 * Dependencies: /api/hpp/master, HppUnmatchedPanel, lucide-react, formatRupiah
 * Public functions: HppMasterManager (default export)
 * Side effects: GET /api/hpp/master (list), POST /api/hpp/master (import), POST /api/hpp/master/resolve
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Upload, Loader2, FileSpreadsheet, RefreshCw } from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import HppUnmatchedPanel from "@/components/HppUnmatchedPanel";
import type { HppEntry } from "@/lib/types";

interface MasterEntry extends HppEntry {
  id: string;
}

interface FetchState {
  entries: MasterEntry[];
  total: number;
  page: number;
  totalPages: number;
}

export default function HppMasterManager() {
  const [data, setData] = useState<FetchState>({ entries: [], total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [importResult, setImportResult] = useState<{
    inserted: number;
    warnings: string[];
    unmatchedOrderSkus: string[];
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchEntries = useCallback(async (p: number, query: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "20", q: query });
      const res = await fetch(`/api/hpp/master?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch {
      // Silent — data stays stale
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries(page, q);
  }, [page, q, fetchEntries]);

  async function handleImport(file: File) {
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/hpp/master", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setImportError(json.error ?? "Import gagal");
        return;
      }
      setImportResult(json);
      setPage(1);
      await fetchEntries(1, q);
    } catch {
      setImportError("Terjadi kesalahan saat import");
    } finally {
      setImporting(false);
    }
  }

  async function handleResolve(orderSku: string, masterEntryId: string) {
    await fetch("/api/hpp/master/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderSku, masterEntryId }),
    });
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImport(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleImport(file);
  }

  return (
    <div className="space-y-6">
      {/* Import area */}
      <div
        className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-zinc-500 transition-colors"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFilePick}
        />
        {importing ? (
          <div className="flex flex-col items-center gap-2 text-zinc-400">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Mengimport master HPP...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-500">
            <FileSpreadsheet className="w-8 h-8" />
            <p className="text-sm font-medium text-zinc-300">Import Master HPP</p>
            <p className="text-xs">Drag & drop atau klik untuk pilih file Excel (.xlsx/.xls)</p>
          </div>
        )}
      </div>

      {/* Import result */}
      {importError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          {importError}
        </div>
      )}
      {importResult && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-3 text-sm text-green-300">
          {importResult.inserted} produk berhasil diimport.
          {importResult.warnings.length > 0 && (
            <ul className="mt-1 text-xs text-yellow-300 list-disc list-inside">
              {importResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Unmatched panel */}
      {importResult && importResult.unmatchedOrderSkus.length > 0 && (
        <HppUnmatchedPanel
          unmatchedSkus={importResult.unmatchedOrderSkus}
          masterEntries={data.entries}
          onResolve={handleResolve}
          onDismiss={() => setImportResult((prev) => prev ? { ...prev, unmatchedOrderSkus: [] } : null)}
        />
      )}

      {/* Table header */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Cari SKU atau nama produk..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <span className="text-xs text-zinc-500 shrink-0">{data.total} produk</span>
        <button
          onClick={() => fetchEntries(page, q)}
          className="p-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/60">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">SKU</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Nama Produk</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">Master SKU</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">HPP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading && data.entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                </td>
              </tr>
            ) : data.entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500 text-sm">
                  {q ? "Tidak ada produk yang cocok" : "Belum ada data HPP master. Import file Excel untuk memulai."}
                </td>
              </tr>
            ) : (
              data.entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-zinc-300">{entry.sku || "-"}</td>
                  <td className="px-4 py-3 text-zinc-200">{entry.productName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">{entry.masterSku || "-"}</td>
                  <td className="px-4 py-3 text-right text-zinc-200 font-medium">{formatRupiah(entry.cost)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-xs text-zinc-500">
            {page} / {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages}
            className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/components/HppMasterManager.tsx
git commit -m "feat(ui): add HppMasterManager — import master HPP + table"
```

---

## Task 9: Update `hpp/page.tsx`

**Files:**
- Modify: `src/app/hpp/page.tsx`

- [ ] **Step 1: Read current file**

```bash
cat src/app/hpp/page.tsx
```

- [ ] **Step 2: Replace `HppManagerTabbed` with `HppMasterManager`**

Change the import:
```typescript
// Before:
import HppManagerTabbed from "@/components/HppManagerTabbed";
// After:
import HppMasterManager from "@/components/HppMasterManager";
```

Change the JSX:
```typescript
// Before:
<HppManagerTabbed />
// After:
<HppMasterManager />
```

Update the header doc:
```
 * Dependencies: HppMasterManager, AuthAreaLayout
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/app/hpp/page.tsx
git commit -m "feat(hpp): replace HppManagerTabbed with HppMasterManager"
```

---

## Task 10: Update `app-store.ts` — `loadHpp` to use `/api/hpp/master`

**Files:**
- Modify: `src/store/app-store.ts`

- [ ] **Step 1: Update `loadHpp` action (around line 239)**

Find:
```typescript
loadHpp: async () => {
  set({ hppLoading: true, hppError: null });
  try {
    const res = await fetch("/api/hpp");
    if (res.ok) {
      const data = await res.json();
      set({ hppEntries: data.entries ?? [], hppError: null });
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (e) {
    console.error("[loadHpp]", e);
    set({ hppError: "Gagal memuat data HPP" });
  } finally {
    set({ hppLoading: false });
  }
},
```

Replace with:
```typescript
loadHpp: async () => {
  set({ hppLoading: true, hppError: null });
  try {
    const res = await fetch("/api/hpp/master?limit=500");
    if (res.ok) {
      const data = await res.json();
      // Map HppMarketplaceEntry[] (with id) to HppEntry[] for reconcile engine
      const hppEntries: HppEntry[] = (data.entries ?? []).map((e: {
        sku: string; productName: string; masterProductName?: string;
        masterSku?: string; cost: number;
      }) => ({
        sku: e.sku,
        productName: e.productName,
        masterProductName: e.masterProductName,
        masterSku: e.masterSku,
        cost: e.cost,
      }));
      set({ hppEntries, hppError: null });
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (e) {
    console.error("[loadHpp]", e);
    set({ hppError: "Gagal memuat data HPP" });
  } finally {
    set({ hppLoading: false });
  }
},
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/store/app-store.ts
git commit -m "feat(store): loadHpp now fetches from /api/hpp/master"
```

---

## Task 11: Delete Deprecated Files

**Files to delete:**
- `src/components/HppManagerTabbed.tsx`
- `src/app/api/hpp/marketplace/route.ts`
- `src/app/api/hpp/marketplace/[id]/route.ts`
- `src/app/api/hpp/combined/route.ts`

- [ ] **Step 1: Verify nothing imports these files anymore**

```bash
grep -rn "HppManagerTabbed" src/ --include="*.tsx" --include="*.ts"
grep -rn "api/hpp/marketplace\|api/hpp/combined" src/ --include="*.tsx" --include="*.ts" | grep -v "api/hpp/marketplace/route\|api/hpp/marketplace/\[id\]\|api/hpp/combined/route"
```

Expected: no results (or only the route files themselves).

- [ ] **Step 2: Delete files**

```bash
rm src/components/HppManagerTabbed.tsx
rm src/app/api/hpp/marketplace/route.ts
rm "src/app/api/hpp/marketplace/[id]/route.ts"
rm src/app/api/hpp/combined/route.ts
```

Check if marketplace and combined dirs are now empty:
```bash
ls src/app/api/hpp/marketplace/
ls src/app/api/hpp/combined/
```

If only `[id]` dir remains under marketplace and it's empty:
```bash
rmdir "src/app/api/hpp/marketplace/[id]"
rmdir src/app/api/hpp/marketplace
rmdir src/app/api/hpp/combined
```

- [ ] **Step 3: Verify TypeScript compiles after deletion**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated HPP per-marketplace routes and component"
```

---

## Task 12: Final Build Verification

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 3: Manual smoke test**

1. Start dev server: `npm run dev`
2. Navigate to `/hpp`
3. Verify: page shows `HppMasterManager` (import area + empty table)
4. Import a test Excel file
5. Verify: table populates with HPP entries
6. Navigate to `/upload/result` (if upload data available)
7. Verify: HPP matching uses data from master import

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup after HPP master import feature"
```
