# Sensei - Retail Operations Intelligence System

## Project Overview

Internal operations intelligence tool for multibrand omnichannel retail store specializing in barefoot shoes. Centralizes data from Fakturownia and WooCommerce to provide actionable insights on inventory, sales, and business performance.

## Business Context

- **Current Setup**: 2 stores, expanding to 3 stores in 2 months
- **Business Model**: Multibrand omnichannel (ecom + physical stores)
- **Product Category**: Barefoot shoes

## Tech Stack

### Source Systems
- **WooCommerce** - Ecommerce platform
- **Fakturownia** - Stock management, invoices, receipts, POS
- **Google Workspace** - Data storage, processing, reporting

### Implementation Platform
- **Primary**: Google Sheets + Apps Script
- **Data Sync**: Daily automated pulls from APIs
- **Reporting**: Google Sheets dashboards

## Core Functionality (Priority Order - TBD)

### Stock Intelligence
- Track time since arrival (warehouse document date in Fakturownia)
- Calculate sales velocity by model
- Identify slow-moving vs fast-moving inventory
- Stock value by category (winter, summer, sandals, etc.)

### Automated Recommendations
- Reorder alerts for fast-selling items
- Discount recommendations for slow-moving items
- Inter-store transfer suggestions based on stock levels

### Sales Analytics
- Discount effectiveness analysis (velocity before/after)
- Return rate by model
- Popular size analysis by model/period
- Sales trends across channels

### Multi-Store Management
- Stock distribution across locations
- Transfer recommendations
- Location-specific performance

## Design Principles

### Simplicity First
- **Don't overengineer**: Simple beats complex
- **No fallbacks**: One correct path, no alternatives
- **One way**: Single approach for each task
- **Clarity over compatibility**: Clear code beats backward compatibility

### Error Handling
- **Throw errors**: Fail fast when preconditions aren't met
- **No backups**: Trust the primary mechanism
- **Simple > Complex**: Let TypeScript catch errors instead of excessive runtime checks

### Code Organization
- **Separation of concerns**: Each function has single responsibility
- **Minimal documentation**: Code should be self-explanatory
- **No document litter**: CLAUDE.md is the single source of truth - no README, no session summaries, no duplicate docs

## Development Methodology

### Surgical Approach
- **Surgical changes only**: Minimal, focused modifications
- **Evidence-based debugging**: Targeted logging only when needed
- **Fix root causes**: Address underlying issues, not symptoms
- **Collaborative process**: Work with user to identify efficient solutions

### Incremental Development
- Work piece by piece, task by task
- Build only what's needed now
- No hypothetical future features
- Each feature fully functional before moving to next

## Project Status

**Current Phase**: Full historical data loaded, ready for daily automation
**Last Updated**: 2026-01-15
**Next Task**: Set up automated daily triggers and build initial reports

### Completed
- ✅ Project setup and architecture design
- ✅ Google Sheets structure (4 sheets + 1 control sheet)
  - Control Sheet: Config, Sync_Log, Warehouse_Mapping, Brand_Mapping
  - Products Sheet: ~11.5k products (11 columns with brand/model split)
  - Warehouse Sheet: ~116k warehouse document rows (14 columns) - complete historical data
  - Sales Sheet: ~150k sales document rows (25 columns with brand/model/color/size split + margin data) - 2024+ data
- ✅ Products sync (tested successfully)
- ✅ Warehouse sync with currency conversion and warehouse name mapping (tested successfully)
- ✅ Sales sync with margin calculation (tested successfully)
- ✅ Master sync orchestration (syncAll function)
- ✅ Warehouse name mapping system (manual lookup table in Control sheet)
- ✅ Full historical data load via automated batch sync (completed overnight)
- ✅ Margin recalculation for existing sales data
- ✅ Color/Size parsing fix for old format products

### Implementation Files
1. **Setup.gs** - Initial setup, config management, warehouse mapping
2. **ProductsSync.gs** - Products sync from Fakturownia
3. **WarehouseSync.gs** - Warehouse documents sync with currency conversion
4. **salesSync.gs** - Sales documents sync with margin calculation
5. **MasterSync.gs** - Orchestrates all syncs in correct order
6. **BatchSyncV2.gs** - Cursor-based batch sync for large datasets
7. **UnifiedAutoSync.gs** - Self-triggering automated sync system
8. **RecalculateMargins.gs** - Recalculate margins using existing sheet data
9. **CleanupSheets.gs** - Utility to wipe sheet contents before full sync

### Key Implementation Details
- **Warehouse sync**:
  - Fetches list of document IDs, then individual documents to get `warehouse_actions`
  - Currency conversion: EUR/USD to PLN using `purchase_exchange_currency_rate`
  - Warehouse name mapping: Uses static lookup table from Warehouse_Mapping sheet (no API calls)
  - Composite key: `document_id_product_id` for upsert logic
  - Rate limiting: 950 calls/minute with ~63ms delays to stay under API limit (1000/min)

- **Sales sync**:
  - Loads all warehouse costs into memory once (no duplicate API calls)
  - Margin calculation pulls costs from Warehouse sheet using WZ document ID + product ID
  - Document type mapping: Faktura, Paragon, Zwrot, Korekta
  - Channel detection: online (Faktura, Korekta) vs offline (Paragon, Zwrot)
  - Skips KP documents (internal cost documents)
  - Skips ZP/returns for margin calculation
  - **Dual product name format support**:
    - Old format (pre-2024): "Model - Color, Size" (e.g., "Xero Shoes Denver - Black, 45.5") - FIXED
    - New format (2024+): "Model - Size - Color" (e.g., "Xero Shoes Denver - 45.5 - Black")
    - Parsing logic checks for comma presence to determine format
  - **Historical data access**: Can fetch specific documents by ID (e.g., oldest doc ID: 271576442)
  - **API pagination limitations**: Date filtering via URL parameters (`issue_date_from`/`issue_date_to`) does NOT work reliably
    - Solution: Fetch by specific document ID for testing, or use full pagination for complete sync

- **Products sync**:
  - Paginated fetch (100 products per page)
  - Upsert logic based on product_id

- **Retry logic**:
  - All API calls wrapped in `withRetry()` function
  - Exponential backoff for 429/500/502/503 errors
  - Max 3 attempts

### Recent Work (2026-01-15 Session)
**Focus**: Full historical data load and margin calculation troubleshooting

**Completed**:
1. Built automated batch sync system to handle large datasets
   - Created `BatchSyncV2.gs` with cursor-based pagination (tracks page position between runs)
   - Created `UnifiedAutoSync.gs` with self-triggering system (runs every 5 minutes automatically)
   - Alternating batch strategy: Warehouse → Sales → Warehouse → Sales (2000 docs per batch)
   - Successfully synced ~116k warehouse documents and ~150k sales rows overnight (~3.5 hours)

2. Fixed color/size parsing for old format products
   - Corrected from "Model - Size, Color" to "Model - Color, Size"
   - Updated parsing logic in salesSync.gs to match actual data format

3. Diagnosed and resolved margin calculation issues
   - **Root cause**: Sales were synced while warehouse data was still loading (alternating batches)
   - Sales rows had `warehouse_document_id` populated but `cost_available = FALSE`
   - Cost lookups failed because warehouse cost map was incomplete during sales sync
   - **Solution**: Created `RecalculateMargins.gs` to recalculate margins using existing sheet data
   - No API calls needed - pure Google Sheets operations

4. Margin recalculation success
   - Built cost lookup map from complete warehouse data (46k WZ entries)
   - Updated all sales rows with correct cost and margin data
   - Achieved ~55% cost coverage (remaining are items without product_id or non-WZ documents)

**Key Findings**:
- Alternating batch sync causes timing issues - warehouse data must be complete before sales sync for accurate margins
- Google Apps Script has 6-minute execution limit - batch processing with cursor tracking is essential
- Margin recalculation via sheet operations is faster than re-syncing from API
- Product name format was actually "Color, Size" not "Size, Color" in old data

**Architecture Decisions**:
- Future daily syncs should run Warehouse FIRST, then Sales (not alternating)
- Margin recalculation tool available for fixing data issues without API re-sync
- Batch size of 2000 documents balances performance vs execution time limits

### Next Steps
1. Set up automated daily triggers (2 AM) using `syncAll()` - ensure proper order (Products → Warehouse → Sales)
2. Build initial reports (margin analysis, sales velocity, inventory aging)
3. Configure date filtering for margin calculations (April 2025+ as business requirement)

## Technical Notes

### API Integration
- Previous projects in parent folder contain working Fakturownia/WooCommerce API code
- Reference existing implementations when building data connectors

### Data Sync Strategy
- **Method**: Full sync (fetches all data on each run)
  - Future: Can be optimized to incremental sync based on `updated_at` timestamp
- **Frequency**: Daily at 2:00 AM (not yet configured)
- **Initial Load**: Full historical pull (~2.5 years of data)
- **Source of Truth**: Fakturownia for all sales and inventory data
- **Storage**: Split across 4 Google Sheets + 1 Control Sheet:
  - Control Sheet (master): Config, Sync_Log, Warehouse_Mapping
  - Products Sheet: ~11.5k products (9 columns)
  - Warehouse Sheet: ~25k warehouse document rows (14 columns)
  - Sales Sheet: ~150k sales document rows (24 columns with margin data)
- **Sync Order**: Products → Warehouse → Sales (ensures dependencies are met)

### Data Volume
- ~11,500 products
- ~25,000 historical warehouse document rows
- ~150,000 historical sales document rows
- Daily increments: 50-100 warehouse rows, 150-200 sales rows
- Total: ~186,500 rows (well within Google Sheets limits)

### Key Decisions
- Document deletions ignored (rare occurrence)
- No audit trail of edits (current state only)
- WooCommerce integration deferred
- Each document line item stored as separate row for analysis flexibility

### Margin Calculation
- **Cost source**: Always from warehouse documents (WZ), never product card
- **Reason**: Product card costs are static; actual purchase prices vary (discounts, price changes, currency fluctuations)
- **Implementation**:
  1. Warehouse sync stores all WZ documents with costs in PLN (currency-converted)
  2. Sales sync loads warehouse costs into memory map (key: `wz_id_product_id`)
  3. For each sale, lookup cost using WZ document ID + product ID
  4. Calculate margin if cost found
- **Currency conversion**: EUR/USD costs converted to PLN using `purchase_exchange_currency_rate` from warehouse_actions
- **Formula**:
  - `cost_pln = (total_purchase_price_net * exchange_rate) / quantity`
  - `margin_pln = sale_price_net - (cost_net * quantity)`
  - `margin_percent = (margin_pln / sale_price_net) * 100`
- **Missing costs**: Flagged with `cost_available = FALSE`, excluded from margin analysis
- **Returns/corrections**: Skip margin calculation (reverses original transaction)

### Warehouse Name Mapping
- **Purpose**: Map warehouse IDs to human-readable names
- **Implementation**: Static lookup table in Control sheet's `Warehouse_Mapping` tab
- **Structure**: 3 columns: `warehouse_id`, `warehouse_name`, `display_name`
- **Example data**:
  - 122717 → "Warszawa magazyn" → "Warszawa - Kępna 17A"
  - 128475 → "Wrocław magazyn" → "Wrocław - Kościuszki 147"
- **No API calls**: Mapping loaded once at sync start, pure in-memory lookup
- **Maintenance**: Manual updates when new warehouses/stores are added

### Brand Parsing
- **Purpose**: Split product names into brand, model, color, size for better analysis
- **Implementation**: Static lookup table in Control sheet's `Brand_Mapping` tab
- **Structure**: 2 columns: `brand_name` (match text), `display_name` (short name)
- **Example data**:
  - "Xero Shoes" → "Xero"
  - "Koel Barefoot" → "Koel"
  - "Vivobarefoot" → "Vivobarefoot"
- **Parsing logic**:
  - Check if product name starts with any `brand_name` in mapping (order matters - longer names first)
  - Use `display_name` as the brand value in sheets
  - Extract brand, remove from product name to get model
  - Parse color/size from remaining text (handles both old and new formats)
- **Example**: "Koel Barefoot Filas Merino - Black - 40" → brand: "Koel", model: "Filas Merino", color: "Black", size: "40"
- **Applied to**: Both Products sheet and Sales sheet
- **No API calls**: Mapping loaded once at sync start, pure in-memory lookup
- **Maintenance**: Manual updates when new brands are added

## Important Reminders

- Update this file regularly as project evolves
- Keep it current with decisions, architecture changes, and priorities
- This is the single source of truth for project context
- No lengthy implementation guides - keep it concise
