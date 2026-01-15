# Sensei - Testing Guide

## Testing Products Sync

### Prerequisites
- Control sheet setup complete
- All 3 data sheets created and configured
- API credentials configured via `setupScriptProperties()`

### Test 1: Small Sample Sync

1. Open Control sheet Apps Script editor
2. Create new file `ProductsSync.gs`
3. Paste contents from: `apps-script/ProductsSync.gs`
4. Save the script
5. Select function `testProductsSync` from dropdown
6. Click Run (▶️)
7. Check Execution log - should show:
   ```
   TEST MODE: Fetching only first page of products
   Fetched 10 test products
   Test upsert complete: X new, Y updated
   Test completed successfully in Zs
   ```
8. Open the Products sheet - should see 10 products with data

### Test 2: Run Test Again (Verify Update Logic)

1. Run `testProductsSync` again
2. Check log - should show:
   ```
   Fetched 10 test products
   Test upsert complete: 0 new, 10 updated
   ```
3. Verify that the products sheet still has 10 rows (no duplicates)
4. Check `last_updated` timestamp - should be newer

### Test 3: Full Products Sync

**WARNING: This will fetch all ~11,500 products and may take several minutes**

1. Select function `syncProducts` from dropdown
2. Click Run (▶️)
3. Watch the Execution log:
   ```
   Starting products sync...
   Fetching page 1...
   Fetching page 2...
   ...
   Fetched XXXX products from API
   Upsert complete: XXXX new, 0 updated
   Products sync completed successfully in XXs
   ```
4. Check Products sheet - should have ~11,500 rows
5. Check Control sheet > Sync_Log - should have a success entry
6. Check Control sheet > Config - `last_sync_products` should have current timestamp

## Troubleshooting

### Error: "API credentials not configured"
- Run `setupScriptProperties()` in Control sheet
- Enter your Fakturownia domain and API token

### Error: "Products sheet ID not configured"
- Check Control sheet > Config
- Make sure `products_sheet_id` has the correct Sheet ID

### Error: "API error: 401"
- Check your API token is correct
- Verify domain name (should be just the subdomain, e.g., "mo-filipowski")

### Error: "Exceeded maximum execution time"
- This happens if the full sync takes > 6 minutes
- The sync will need to be split into batches (we can implement this if needed)

### Slow Performance
- Full sync of 11,500 products typically takes 3-5 minutes
- This is normal due to:
  - API pagination (100 products per request = 115 requests)
  - Network latency
  - Writing to Google Sheets

## Verifying Data Quality

After a successful sync, spot-check a few products:

1. Pick a product you know exists in Fakturownia
2. Find it in the Products sheet (use Ctrl+F to search by SKU)
3. Verify:
   - product_id matches
   - sku is correct
   - name is correct
   - price matches
   - active status is correct
   - last_updated timestamp is recent

## Next Steps

Once products sync is working:
1. Implement warehouse documents sync
2. Implement sales documents sync
3. Set up automated daily triggers
4. Build initial reports/dashboards
