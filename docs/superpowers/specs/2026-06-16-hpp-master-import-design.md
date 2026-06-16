# HPP Master Import Design

**Date:** 2026-06-16  
**Status:** Approved  
**Scope:** `/hpp` page, `/api/hpp/master`, reconcile engine, DB schema

---

## Problem

HPP saat ini dikelola per-marketplace (tab Shopee/Tokopedia/Lazada terpisah). SKU sebenarnya sama di semua marketplace, jadi maintenance HPP 3× lebih berat dari yang perlu. Tidak ada cara import dari file master produk.

---

## Decision

Hapus seluruh konsep HPP per-marketplace. Satu HPP master berlaku untuk semua marketplace. Import dari file Excel master produk (`Master_Product_2026.xlsx` atau format sama). SKU yang tidak cocok dengan order history ditampilkan untuk matching manual.

---

## Section 1: Database Schema

### Migration

```sql
-- Make marketplace nullable (NULL = global/master)
ALTER TABLE hpp_marketplace_entries
  MODIFY COLUMN marketplace ENUM('shopee','tokopedia','lazada') NULL DEFAULT NULL;

-- Table untuk manual SKU alias mapping
CREATE TABLE hpp_sku_aliases (
  id              VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id         VARCHAR(191) NOT NULL,
  order_sku       VARCHAR(191) NOT NULL,
  master_entry_id VARCHAR(36)  NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT NOW(),
  INDEX idx_user_order_sku (user_id, order_sku),
  FOREIGN KEY (master_entry_id) REFERENCES hpp_marketplace_entries(id) ON DELETE CASCADE
);
```

### Semantik

| `marketplace` value | Artinya |
|---|---|
| `'shopee'` / `'tokopedia'` / `'lazada'` | Entry lama (deprecated, tidak digunakan UI/reconcile) |
| `NULL` | HPP master — berlaku semua marketplace |

Data lama (`marketplace != NULL`) dibiarkan di DB, tidak dihapus, tidak digunakan.

### Query Lookup HPP

```sql
SELECT * FROM hpp_marketplace_entries
WHERE user_id = ?
  AND marketplace IS NULL
  AND sku = ?
LIMIT 1
```

Fallback via alias:
```sql
SELECT hme.* FROM hpp_sku_aliases a
JOIN hpp_marketplace_entries hme ON hme.id = a.master_entry_id
WHERE a.user_id = ? AND a.order_sku = ?
LIMIT 1
```

---

## Section 2: API Layer

### Endpoint Baru

#### `POST /api/hpp/master`

Import file Excel master. Replace semua HPP master user.

- Body: `multipart/form-data { file: File }`
- Parse dengan `productMaster.ts` (existing)
- Validate dengan `hppValidator.ts` (existing)
- `DELETE WHERE user_id = ? AND marketplace IS NULL`
- Bulk INSERT dengan `marketplace = NULL`
- Fetch SKU unik dari `monthly_uploads.parsed_json` (semua `fileType='order'` milik user) → extract field `sku` → identifikasi unmatched
- Response:

```json
{
  "inserted": 142,
  "warnings": [],
  "unmatchedOrderSkus": ["SKU-X", "SKU-Y"]
}
```

#### `GET /api/hpp/master`

List HPP master dengan pagination.

- Query: `?page&limit&q`
- Response: `{ entries, total, page, totalPages }`

#### `POST /api/hpp/master/resolve`

Simpan manual mapping SKU order → master entry.

- Body: `{ orderSku: string; masterEntryId: string }`
- INSERT ke `hpp_sku_aliases`
- Response: `{ ok: true }`

### Endpoint Dihapus

- `DELETE /api/hpp/marketplace` (dan semua sub-route)
- `DELETE /api/hpp/combined`

---

## Section 3: UI

### Component

| File | Action |
|---|---|
| `src/components/HppManagerTabbed.tsx` | **Hapus** |
| `src/components/HppMasterManager.tsx` | **Buat baru** |
| `src/components/HppUnmatchedPanel.tsx` | **Buat baru** |
| `src/app/hpp/page.tsx` | Update render `<HppMasterManager />` |

### Layout `HppMasterManager`

```
┌─────────────────────────────────────────────────┐
│  HPP Master                                      │
│                                                 │
│  [Drop zone atau pilih file Excel]              │
│  Format: Master_Product_2026.xlsx               │
│  [Tombol: Import Master HPP]                    │
│                                                 │
│  ┌─ Unmatched SKU Panel (muncul jika ada) ────┐ │
│  │ SKU "ABC-123" tidak ada di master          │ │
│  │ → [Dropdown cari produk master]  [Simpan]  │ │
│  │ [Skip semua]                               │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  Cari: [______________________]  142 produk     │
│                                                 │
│  ┌─ Tabel HPP Master ─────────────────────────┐ │
│  │ SKU │ Nama Produk │ Master SKU │ HPP (Rp)  │ │
│  │ ... │ ...         │ ...        │ ...       │ │
│  └────────────────────────────────────────────┘ │
│  ← 1 2 3 ... →                                  │
└─────────────────────────────────────────────────┘
```

### Flow Import

1. User drag & drop / pilih file
2. POST `/api/hpp/master`
3. Jika `unmatchedOrderSkus.length > 0` → tampilkan `HppUnmatchedPanel`
4. User resolve satu per satu via dropdown → POST `/api/hpp/master/resolve`
5. Atau klik "Skip semua" untuk tutup panel
6. Tabel refresh dengan data master baru

---

## Section 4: Reconcile Integration

### Perubahan State

`hppEntries: HppEntry[]` di `src/store/app-store.ts` **dihapus**.

### Flow Baru

1. Saat user masuk `/upload/result` → fetch `GET /api/hpp/master`
2. Map response ke `HppEntry[]`
3. Pass ke `reconcile()` seperti sebelumnya (interface tidak berubah)

### Lookup di Reconcile

`lookupHppMatchForLine()` di `upload/result/page.tsx`:

1. Normalize SKU order
2. Cari di HPP master (dari fetch API)
3. Jika tidak match → cari di alias map (fetch `hpp_sku_aliases` saat load page)
4. Return `hppMatched: true/false` dan `hpp` value

---

## Files Changed

| File | Action |
|---|---|
| `src/lib/db/schema.ts` | Update `hpp_marketplace_entries`, tambah `hpp_sku_aliases` |
| `src/lib/db/queries/hppMarketplace.ts` | Update queries untuk marketplace=NULL, tambah alias queries |
| `src/app/api/hpp/master/route.ts` | Buat baru |
| `src/app/api/hpp/master/resolve/route.ts` | Buat baru |
| `src/app/api/hpp/marketplace/route.ts` | Hapus |
| `src/app/api/hpp/marketplace/[id]/route.ts` | Hapus |
| `src/app/api/hpp/combined/route.ts` | Hapus |
| `src/components/HppMasterManager.tsx` | Buat baru |
| `src/components/HppUnmatchedPanel.tsx` | Buat baru |
| `src/components/HppManagerTabbed.tsx` | Hapus |
| `src/app/hpp/page.tsx` | Update |
| `src/store/app-store.ts` | Hapus `hppEntries` |
| `src/app/upload/result/page.tsx` | Update HPP fetch source |

---

## Migration Plan

1. Run `db:generate` untuk migration files
2. Run `db:migrate` di staging
3. Deploy API routes baru
4. Deploy UI baru
5. Data lama (`marketplace != NULL`) tetap di DB — tidak ada data loss
