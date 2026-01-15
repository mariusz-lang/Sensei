# Apps Script Files Reference

## Core Sync Files

### Setup.gs
**Purpose**: Initial setup, configuration management, warehouse mapping
- Creates Google Sheets structure (4 data sheets + 1 control sheet)
- Initializes headers and formatting
- Stores API credentials in Script Properties
- Contains warehouse mapping lookup function

### ProductsSync.gs
**Purpose**: Sync products from Fakturownia
- Fetches all products (paginated, 100 per page)
- Stores: product_id, name, code, price, tax, quantity, category, timestamps
- Upsert logic based on product_id
- ~11,500 products total

### WarehouseSync.gs
**Purpose**: Sync warehouse documents from Fakturownia
- Fetches warehouse documents (WZ, PZ, MM types)
- Explodes documents into individual product rows
- Currency conversion (EUR/USD → PLN)
- Warehouse name mapping via lookup table
- Rate limiting: 900 calls/minute
- ~116k document rows total

### salesSync.gs
**Purpose**: Sync sales documents with margin calculation
- Fetches invoices and receipts (Faktura, Paragon, Korekta, Zwrot)
- Loads warehouse cost map into memory
- Calculates margins using WZ document costs
- Parses product names into model/color/size
- Handles dual format: "Model - Color, Size" (old) and "Model - Size - Color" (new)
- ~150k sales rows total

### MasterSync.gs
**Purpose**: Orchestrates all syncs in correct order
- `syncAll()` - Runs Products → Warehouse → Sales sequentially
- Ensures data dependencies are met
- Logs sync duration and statistics
- Use this for daily automated syncs

## Batch Processing Files

### BatchSyncV2.gs
**Purpose**: Cursor-based batch sync for large datasets
- `syncWarehouseBatchV2(batchSize)` - Sync warehouse in batches
- `syncSalesBatchV2(batchSize)` - Sync sales in batches
- Tracks page position using Script Properties
- Resumes from last position on next run
- Default: 5000 docs per batch (can be adjusted)

**When to use**: For initial historical data loads or catching up after long gaps

### UnifiedAutoSync.gs
**Purpose**: Self-triggering automated sync system
- `startUnifiedAutoSync()` - Starts automated sync (run once)
- `stopUnifiedAutoSync()` - Stops automated sync
- `checkUnifiedSyncStatus()` - Check progress
- Creates trigger that runs every 5 minutes
- Alternates between warehouse and sales batches
- Automatically stops when complete

**When to use**: For overnight historical data loads requiring multiple hours

**⚠️ Important**: Not recommended for daily syncs due to alternating strategy. Use `MasterSync.syncAll()` instead.

### RecalculateMargins.gs
**Purpose**: Recalculate margins using existing sheet data
- `recalculateMissingMargins()` - Update only rows with cost_available=FALSE (recommended)
- `recalculateAllMargins()` - Recalculate all rows (thorough)
- No API calls - pure Google Sheets operations
- Useful after warehouse data updates

**When to use**:
- After completing warehouse sync when sales were synced with incomplete warehouse data
- After fixing data issues in warehouse sheet
- After bulk updates to warehouse documents

## Utility Files

### CleanupSheets.gs
**Purpose**: Wipe sheet contents before full sync
- `wipeAllSheets()` - Clear all data sheets
- `wipeProductsOnly()` - Clear only products
- `wipeWarehouseOnly()` - Clear only warehouse
- `wipeSalesOnly()` - Clear only sales
- Preserves headers, only clears data rows

**When to use**: Before running full historical re-sync

## Daily Automation Setup

**Recommended approach for daily syncs:**

1. Set up time-based trigger in Apps Script:
   - Function: `syncAll`
   - Event source: Time-driven
   - Type: Day timer
   - Time: 2:00 AM - 3:00 AM

2. Or use a simple daily sync function:
```javascript
function dailySync() {
  Logger.log('Starting daily sync at ' + new Date());
  syncAll();
  Logger.log('Daily sync completed at ' + new Date());
}
```

**Do NOT use** `UnifiedAutoSync` for daily syncs - it's designed for large historical loads, not incremental updates.

## Script Properties

The following properties are stored in Script Properties (set via Setup.gs):

- `FAKTUROWNIA_DOMAIN` - Your Fakturownia domain (e.g., "yourcompany")
- `FAKTUROWNIA_API_TOKEN` - Your API token
- `warehouse_sync_cursor` - Current page for warehouse batch sync (auto-managed)
- `sales_sync_cursor` - Current page for sales batch sync (auto-managed)
- `unified_auto_sync_running` - Boolean flag for auto-sync status
- `unified_sync_mode` - Current mode (warehouse/sales) for auto-sync
- `unified_batch_count` - Number of batches completed in auto-sync

## Execution Limits

**Google Apps Script Limits:**
- Maximum execution time: 6 minutes
- Rate limit enforcement: Sleep delays between API calls
- Recommended batch sizes:
  - Warehouse: 2000-5000 documents
  - Sales: 2000-5000 documents
  - Products: Can sync all at once (~11.5k products takes ~2 minutes)

**Fakturownia API Limits:**
- Rate limit: 1000 calls/minute
- Our implementation: 900 calls/minute (safety margin)
- Delay between calls: 67ms (warehouse), 100ms every 5 pages (sales)

## Troubleshooting

### If sync fails mid-execution:
1. Check execution logs for error message
2. Batch sync automatically resumes from last cursor position
3. If needed, manually adjust cursor: `PropertiesService.getScriptProperties().setProperty('warehouse_sync_cursor', '100')`

### If margins are missing (cost_available=FALSE):
1. Ensure warehouse sync completed before sales sync
2. Run `recalculateMissingMargins()` to update based on current warehouse data
3. Check that warehouse documents exist for the referenced WZ IDs

### If sync is slow:
1. Check API rate limiting settings
2. Verify batch sizes aren't too small (causing excessive overhead)
3. Monitor execution time - should complete well under 6 minutes per batch

### If data looks incorrect:
1. Check sample documents manually via Fakturownia UI
2. Run diagnostic on specific document IDs
3. Verify field mappings match current API response structure
4. Check for data type mismatches (string vs number)
