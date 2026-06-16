# Performance Optimization Analysis

## Current Issues Found

### 1. API Routes - No Caching
- `/api/monthly-uploads` - no cache headers, no pagination
- `/api/stores` - no cache headers
- Every request hits database directly

### 2. Data Bank Page - No Pagination
- Loads ALL records at once (no LIMIT)
- No server-side pagination
- Client fetches all data on mount

### 3. Dashboard - Huge Bundle
- Single page.tsx is ~3700 lines
- No code splitting
- All chart components loaded eagerly
- Heavy useState/useEffect chains

### 4. Database Queries - Missing Optimizations
- No LIMIT clauses
- No pagination
- JOIN without proper indexing (potential)

### 5. Missing Suspense/Streaming
- No streaming SSR
- All data fetched synchronously on client

## Optimization Plan

### Phase 1: API Caching (Quick Wins)
1. Add `export const dynamic = 'force-dynamic'` to API routes
2. Add Cache-Control headers for public data
3. Add revalidateTag/revalidatePath where applicable

### Phase 2: Pagination
1. Add LIMIT and OFFSET to database queries
2. Implement server-side pagination in data-bank
3. Add page size limits (20, 50, 100)

### Phase 3: Code Splitting
1. Lazy load chart components in dashboard
2. Use React.lazy for heavy components
3. Add dynamic imports

### Phase 4: Database Optimization
1. Add proper indexes on userId, marketplace, period columns
2. Use LIMIT in all list queries
3. Implement cursor-based pagination for large datasets

## Priority Order
1. API Caching headers (easiest, biggest impact)
2. Add pagination to data-bank (medium effort, high impact)
3. Lazy load dashboard components (high effort, medium impact)
4. Database indexing (depends on schema changes)