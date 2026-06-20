# Plan: Delete Per SKU in Order Detail Modal

## Context
User wants to add delete action per SKU in the order detail modal on `/upload/result` page. Currently:
- Full order deletion exists (`handleDeleteOrder`)
- HPP mapping removal exists (`handleRemoveHppForSku`) - only removes HPP, doesn't remove SKU from calculations
- Need: ability to DELETE a SKU from an order so it's excluded from revenue/HPP/profit calculations

## Approach

### 1. Add `handleDeleteSkuFromOrder` function
- Filter out the specific SKU's `lineItem` from the order's line items
- Recalculate the order's totals: revenue, qty, hpp, grossProfit, netProfit, fees (proportional)
- Update the `uploadPreviewReport` with modified order
- Sync with saved report if applicable
- Close modal if last SKU deleted (delete whole order instead)

### 2. Add delete button in SKU breakdown section
- In the modal's SKU detail section, add "Hapus SKU" button per SKU
- Show confirmation dialog before delete
- Visual feedback (mutate state, update totals)

### 3. Ensure global sync
- When SKU deleted, recalculate marketplace summary
- Update `totalRevenue`, `totalHpp`, `totalGrossProfit`, `totalPlatformFees`, `totalNetProfit`
- Call `syncSavedReportIfNeeded()` to persist changes

## Files to Modify
- `src/app/upload/result/page.tsx`

## Key Changes

### New State/Function
```typescript
// State for SKU deletion confirmation
const [deletingSkuOrderId, setDeletingSkuOrderId] = useState<string | null>(null);

// Handler to delete specific SKU from an order
const handleDeleteSkuFromOrder = async (
  order: EnrichedOrder,
  skuDetail: { sku: string; products: string[] }
) => {
  // 1. Find or construct line items for this order
  // 2. Filter out the matching SKU line
  // 3. If no lines remain, delete the whole order
  // 4. Recalculate order totals proportionally
  // 5. Update report and sync
};
```

### UI Changes
- Add Trash2 button per SKU in modal breakdown section
- Confirmation dialog before delete
- Update modal summary after deletion

## Implementation Steps
- [ ] Add `handleDeleteSkuFromOrder` function
- [ ] Add delete button in SKU breakdown section
- [ ] Add confirmation dialog
- [ ] Update modal summary reactively after SKU deletion
- [ ] Test end-to-end: delete SKU → totals update → global report syncs