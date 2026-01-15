# Data Ingestion Architecture

## Overview

Daily incremental sync from Fakturownia API to Google Sheets, storing complete document history for analysis.

## Sync Strategy

### Incremental Updates
- **Method**: Query documents by `updated_at` timestamp
- **Frequency**: Daily at 2:00 AM
- **Initial Load**: Full historical pull (~2.5 years)
- **Subsequent Runs**: Pull only documents updated since last sync

### Safety Buffer
- Pull documents where `updated_at >= last_sync_timestamp - 1 hour`
- Small overlap prevents missing documents due to clock drift or timing issues

## Data Sources

### Fakturownia Endpoints Required

1. **Products** (`/products.json`)
   - All active and inactive products (~11,500 SKUs)
   - Fields: id, name, code (SKU), price, category, etc.

2. **Warehouse Documents** (`/warehouse_documents.json`)
   - Stock arrivals (MM), transfers (WZ/PZ), adjustments
   - Fields: id, kind, number, issue_date, warehouse_id, products, etc.

3. **Sales Documents** (`/invoices.json`)
   - Invoices (online sales), receipts (POS sales), corrections (returns)
   - Fields: id, kind, number, sell_date, payment_type, positions, etc.
   - Estimated volume: 2,500-5,000 documents/month

### Query Parameters
- `updated_from` - ISO timestamp of last sync
- `page` - Pagination (typically 100 records per page)
- `per_page` - Records per page

## Google Sheets Structure

### Main Workbook: "Sensei Data"

#### Sheet: Products
| Column | Type | Description |
|--------|------|-------------|
| product_id | number | Fakturownia product ID (primary key) |
| sku | text | Product code |
| name | text | Product name |
| brand | text | Brand/manufacturer |
| category | text | Product category |
| cost | number | Purchase cost |
| price | number | Retail price |
| active | boolean | Is product active |
| last_updated | datetime | Last sync timestamp |

#### Sheet: Warehouse_Documents
| Column | Type | Description |
|--------|------|-------------|
| document_id | number | Fakturownia document ID (primary key) |
| document_number | text | Human-readable number |
| document_type | text | MM (arrival), WZ (outbound), PZ (inbound) |
| issue_date | date | Document date |
| warehouse_id | number | Location/warehouse |
| warehouse_name | text | Location name |
| product_id | number | Product reference |
| sku | text | Product code |
| quantity | number | Quantity (positive or negative) |
| last_updated | datetime | Last sync timestamp |

**Note**: Warehouse documents contain multiple products - each product is stored as separate row

#### Sheet: Sales_Documents
| Column | Type | Description |
|--------|------|-------------|
| document_id | number | Fakturownia document ID (primary key) |
| document_number | text | Human-readable number |
| document_type | text | invoice, receipt, correction |
| sell_date | date | Sale date |
| issue_date | date | Issue date |
| payment_type | text | Payment method |
| channel | text | online/store |
| store_location | text | Store name (if applicable) |
| product_id | number | Product reference |
| sku | text | Product code |
| product_name | text | Product name |
| quantity | number | Quantity sold (negative for returns) |
| unit_price_net | number | Sale price per unit (net) |
| unit_price_gross | number | Sale price per unit (gross) |
| discount_percent | number | Discount applied |
| total_price_net | number | Line total (net) |
| total_price_gross | number | Line total (gross) |
| tax | number | Tax rate (%) |
| warehouse_doc_id | number | Linked WZ document ID |
| actual_cost_net | number | Real purchase cost (net, PLN) from WZ |
| margin_pln | number | Calculated margin (PLN) |
| margin_percent | number | Calculated margin (%) |
| cost_available | boolean | TRUE if cost data found, FALSE if missing |
| last_updated | datetime | Last sync timestamp |

**Note**: Sales documents contain multiple line items - each item is stored as separate row

**Margin Calculation Logic**:
- `margin_pln = total_price_net - (actual_cost_net * quantity)`
- `margin_percent = (margin_pln / total_price_net) * 100`
- If `cost_available = FALSE`, margin fields are empty (excluded from analysis)

#### Sheet: Sync_Log
| Column | Type | Description |
|--------|------|-------------|
| sync_timestamp | datetime | When sync ran |
| endpoint | text | Which API endpoint synced |
| records_pulled | number | Total records retrieved |
| records_new | number | New records inserted |
| records_updated | number | Existing records updated |
| status | text | success/failed/partial |
| error_message | text | Error details if failed |
| duration_seconds | number | Sync execution time |

#### Sheet: Config
| Column | Type | Description |
|--------|------|-------------|
| key | text | Setting name |
| value | text | Setting value |

**Config entries:**
- `last_sync_products` - Last successful product sync timestamp
- `last_sync_warehouse` - Last successful warehouse docs sync timestamp
- `last_sync_sales` - Last successful sales docs sync timestamp
- `initial_load_complete` - Boolean flag

## Sync Logic

### Pseudocode for Daily Sync

```javascript
function dailySync() {
  const config = getConfig();

  // Sync each endpoint
  syncProducts(config.last_sync_products);
  syncWarehouseDocs(config.last_sync_warehouse);
  syncSalesDocs(config.last_sync_sales);
}

function syncProducts(lastSync) {
  const startTime = new Date();
  const updatedFrom = new Date(lastSync.getTime() - 3600000); // -1 hour buffer

  try {
    let page = 1;
    let hasMore = true;
    let totalPulled = 0;
    let newRecords = 0;
    let updatedRecords = 0;

    while (hasMore) {
      const response = callFakturowniaAPI('/products.json', {
        updated_from: updatedFrom.toISOString(),
        page: page,
        per_page: 100
      });

      if (response.length === 0) {
        hasMore = false;
        break;
      }

      response.forEach(product => {
        const existing = findProductById(product.id);
        if (existing) {
          updateProduct(existing.row, product);
          updatedRecords++;
        } else {
          insertProduct(product);
          newRecords++;
        }
        totalPulled++;
      });

      page++;
    }

    // Update config with new timestamp
    setConfig('last_sync_products', startTime);

    // Log success
    logSync(startTime, 'products', totalPulled, newRecords, updatedRecords, 'success', null);

  } catch (error) {
    logSync(startTime, 'products', 0, 0, 0, 'failed', error.message);
    // Don't update last_sync timestamp - will retry next run
  }
}

// Similar functions for syncWarehouseDocs() and syncSalesDocs()
```

### Upsert Logic

1. **Fetch** updated documents from API
2. **Load** existing sheet data into memory (or use Apps Script ranges)
3. **For each document**:
   - Search for row with matching document_id
   - If found: update all columns in that row
   - If not found: append new row
4. **Update** last_sync timestamp only on complete success

### Initial Historical Load

Special one-time function:
- No `updated_from` filter (pulls all documents)
- Same upsert logic
- May need to run in batches due to Apps Script execution time limits (6 min/execution)
- Sets `initial_load_complete = true` flag when done

## Error Handling

### Failed Sync Recovery
- If sync fails mid-run, timestamp is NOT updated
- Next run will retry the same time range
- Upsert logic handles duplicate processing gracefully

### Partial Failures
- Each endpoint syncs independently
- If products succeed but warehouse docs fail, only warehouse will retry

### Rate Limiting
- Fakturownia API limits vary by plan
- Add delay between paginated requests if needed (e.g., 500ms)
- Log rate limit errors distinctly for monitoring

## Apps Script Triggers

### Daily Sync Trigger
- **Type**: Time-driven
- **Schedule**: Daily, 2:00 AM - 3:00 AM
- **Function**: `dailySync()`

### Manual Triggers (for development/testing)
- `manualSyncProducts()`
- `manualSyncWarehouseDocs()`
- `manualSyncSalesDocs()`
- `runInitialLoad()` (one-time historical load)

## Data Volume Estimates

### Products
- ~11,500 SKUs
- Daily updates: ~10-50 products (new arrivals, price changes)

### Warehouse Documents
- Historical: ~2,500 docs/year × 2.5 years = ~6,250 docs
- Each doc has ~3-5 products → ~25,000 rows
- Daily new: ~10-20 docs → ~50-100 rows

### Sales Documents
- Historical: ~3,500 docs/month × 30 months = ~105,000 docs
- Each doc has ~1-2 items → ~150,000 rows
- Daily new: ~100-150 docs → ~150-200 rows

**Total Google Sheets rows**: ~186,500 (well within 10M cell limit)

## Next Steps

1. Verify Fakturownia API endpoints and authentication method
2. Review existing API code in parent folders for reference
3. Build proof-of-concept sync script for Products endpoint
4. Test initial load with small dataset
5. Expand to all endpoints
6. Set up automated trigger

## Notes

- Document deletions in Fakturownia are ignored (rare occurrence per business requirement)
- No audit trail of edits needed - current state only
- WooCommerce integration deferred to later phase
- Additional product metadata (categories) will be added in future iteration
