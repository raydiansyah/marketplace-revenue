# Dashboard Optimization Plan

## Executive Summary

File `src/app/dashboard/page.tsx` saat ini:
- ~3700 baris kode
- Semua komponen di-import secara eager
- Semua logika kalkulasi ada di satu file
- tabel besar (HPP, Orders) tanpa virtualisasi

**Target**: Kurangi bundle size, TBT (Total Blocking Time), dan Lighthouse score tanpa ubah behavior bisnis.

---

## Quick Wins (Impact Tinggi, Risiko Rendah)

### 1. Dynamic Import Komponen Chart (HIGHEST IMPACT)

**File diubah**: `src/app/dashboard/page.tsx`

**Impact**: Chart libraries (likely Recharts atau similar) adalah terbesar di bundle. Dengan dynamic import, mereka di-load hanya saat needed.

**Implementasi**:
```tsx
// Sebelum (eager)
import RevenueBarChart from "@/components/charts/RevenueBarChart";
import FeePieChart from "@/components/charts/FeePieChart";
import MonthlyRevenueLineChart from "@/components/charts/MonthlyRevenueLineChart";

// Sesudah (lazy)
import dynamic from "next/dynamic";

const RevenueBarChart = dynamic(() => import("@/components/charts/RevenueBarChart"), {
  loading: () => <ChartSkeleton />,
});
const FeePieChart = dynamic(() => import("@/components/charts/FeePieChart"), {
  loading: () => <ChartSkeleton />,
});
const MonthlyRevenueLineChart = dynamic(() => import("@/components/charts/MonthlyRevenueLineChart"), {
  loading: () => <ChartSkeleton />,
});
```

**Risiko**: Rendah. Tidak ubah behavior, hanya timing load.

**Validasi**:
- `npm run build` → ✅
- Dev server → chart masih muncul
- Lighthouse: expect TBT drop 200-400ms

---

### 2. Lazy Load AiInsightPanel

**File diubah**: `src/app/dashboard/page.tsx`

**Impact**: AI panel likely heavy (LLM integration). Sekalian wrap dengan `dynamic` tidak seperti sekarang (baru Suspense).

**Implementasi**:
```tsx
const AiInsightPanel = dynamic(() => import("@/components/ai/AiInsightPanel"), {
  loading: () => <div className="h-32 animate-pulse rounded-xl bg-[var(--surface-muted)]" />,
  ssr: false, // AI insights tidak butuh SEO
});
```

**Risiko**: Rendah.

---

### 3. Extract Inline Components ke File Terpisah

**Observasi**: Beberapa komponen masih inline di `page.tsx`:
- `MarketplaceTable` (line ~3600)
- `OrderDetailTable` (line ~3680)
- `SaveReportCard` (line ~3600)

**File baru** (created):
- `src/components/dashboard/MarketplaceTable.tsx`
- `src/components/dashboard/OrderDetailTable.tsx`
- `src/components/dashboard/SaveReportCard.tsx`

**Risiko**: Medium - perlu preserve state management. Ekstrak langkah demi langkah.

**Implementasi urutan aman**:
1. Ekstrak `MarketplaceTable` dulu (paling simpel)
2. Ekstrak `SaveReportCard`
3. Ekstrak `OrderDetailTable` terakhir (paling kompleks)

**Validasi**: Cek setiap ekstrak tidak break UI.

---

### 4. Virtualisasi Tabel Besar (HPP + Orders)

**File diubah**: `src/components/dashboard/OrderDetailTable.tsx` (setelah ekstrak)

**Library**: `react-window` atau `@tanstack/react-virtual`

**Impact**: Jika ada 1000+ rows, rendering semua DOM node blocking. Virtualisasi hanya render visible rows.

**Implementasi**:
```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

const rowVirtualizer = useVirtualizer({
  count: orders.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 48,
});
```

**Risiko**: Medium - interaksi scroll/selection perlu di-test.

**Alternatif cepat** (tanpa virtualisasi):
- Gunakan server-side pagination untuk OrderDetailTable
- Saat ini sudah ada client-side pagination, tapi bisa di-migrate ke API pagination

---

### 5. Memoization Optimizations

**File diubah**: `src/app/dashboard/page.tsx`

**Observasi**: Banyak `useMemo` yang sudah ada, tapi bisa lebih agresif untuk:
- `sortedHppRows`
- `pagedHppRows`
- `allActiveMarketplaces`

**Quick check**:
```tsx
// Lebih strict dependency array
const filteredHppRows = useMemo(() => {
  return hppRows.filter(row => /* logic */);
}, [hppRows, deferredHppSearch, hppMin, hppMax, hppUsageFilter]);
```

**Risiko**: Rendah.

---

## Urutan Implementasi (Paling Aman)

| # | Task | File Diubah | Estimated Effort | Risk |
|---|------|-------------|-----------------|------|
| 1 | Dynamic import charts | page.tsx | 30 min | Very Low |
| 2 | Dynamic import AiInsightPanel | page.tsx | 15 min | Very Low |
| 3 | Create ChartSkeleton component | new file | 15 min | Very Low |
| 4 | Extract MarketplaceTable | new + page.tsx | 45 min | Low |
| 5 | Extract SaveReportCard | new + page.tsx | 45 min | Low |
| 6 | Extract OrderDetailTable | new + page.tsx | 60 min | Medium |
| 7 | Add react-virtual ke OrderDetailTable | OrderDetailTable.tsx | 60 min | Medium |
| 8 | Server-side pagination Orders API | api/reports + page.tsx | 90 min | Medium |

**Total estimated**: ~5-6 jam

---

## Risiko dan Mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Break functionality saat extract komponen | Ekstrak satu per satu, test setiap langkah |
| Animation jank saat lazy load | Pakai skeleton yang stabil (fixed height) |
| State management rusak | Pastikan props drilling jelas, atau gunakan context bila perlu |
| Lighthouse tidak improve | Pastikan dynamic import benar-benar delay chart load |

---

## Validasi Checklist

Setelah setiap step:

- [ ] `npm run build` berhasil
- [ ] Dev server berjalan, UI tidak error
- [ ] Charts/AI masih muncul dengan benar
- [ ] (Optional) Lighthouse CLI audit

```bash
# Install lighthouse jika belum
npm install -g lighthouse

# Audit
lighthouse http://localhost:3001/dashboard --preset=perf --view
```

**Target**: Lighthouse Performance > 80 (dari estimasi ~50 sekarang)

---

## Notes

- Tidak ada perubahan ke API endpoint behavior
- Tidak ada perubahan ke database schema
- Tidak ada perubahan ke bisnis logic (kalkulasi, filtering)
- Fokus ke: loading strategy + rendering optimization saja