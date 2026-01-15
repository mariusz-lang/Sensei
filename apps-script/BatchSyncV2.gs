/**
 * Sensei - Optimized Batch Sync Functions
 * Uses cursor-based pagination to avoid fetching all document IDs every run
 * Tracks progress using Script Properties between executions
 */

/**
 * Helper: Get set of already synced warehouse document IDs
 */
function getExistingWarehouseDocumentIds(sheetId) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName('Warehouse_Documents');

  if (!sheet) return new Set();

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return new Set();

  // Get document_id column (column A)
  const docIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const uniqueIds = new Set();

  docIds.forEach(row => {
    if (row[0]) uniqueIds.add(row[0]);
  });

  return uniqueIds;
}

/**
 * Helper: Get set of already synced sales document IDs
 */
function getExistingSalesDocumentIds(sheetId) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName('Sales_Documents');

  if (!sheet) return new Set();

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return new Set();

  // Get document_id column (column A)
  const docIds = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const uniqueIds = new Set();

  docIds.forEach(row => {
    if (row[0]) uniqueIds.add(row[0]);
  });

  return uniqueIds;
}

/**
 * Syncs warehouse documents in batches using cursor-based approach
 * Run this function repeatedly until it reports "All warehouse documents synced"
 *
 * @param {number} batchSize - Number of documents to process per run (default: 5000)
 */
function syncWarehouseBatchV2(batchSize = 5000) {
  const startTime = new Date();
  const config = getConfig();
  const props = PropertiesService.getScriptProperties();
  const domain = props.getProperty('FAKTUROWNIA_DOMAIN');
  const apiToken = props.getProperty('FAKTUROWNIA_API_TOKEN');

  Logger.log('=== WAREHOUSE BATCH SYNC V2 STARTED ===');
  Logger.log(`Batch size: ${batchSize} documents`);

  try {
    // Load warehouse mapping
    const warehouseMapping = getWarehouseMapping();
    Logger.log(`Loaded ${Object.keys(warehouseMapping).length} warehouse mappings`);

    // Get sync cursor (tracks which page we're on)
    const cursor = props.getProperty('warehouse_sync_cursor') || '1';
    const currentPage = parseInt(cursor);
    Logger.log(`Starting from page ${currentPage}`);

    // Get already synced document IDs from sheet (for deduplication)
    const syncedIds = getExistingWarehouseDocumentIds(config.warehouse_sheet_id);
    Logger.log(`Already synced: ${syncedIds.size} warehouse documents`);

    // Fetch batch of document IDs starting from cursor
    const batchDocIds = [];
    let page = currentPage;
    const perPage = 100;
    let reachedEnd = false;

    Logger.log('Fetching document IDs...');
    while (batchDocIds.length < batchSize) {
      const url = `https://${domain}.fakturownia.pl/warehouse_documents.json?api_token=${apiToken}&page=${page}&per_page=${perPage}`;
      const response = withRetry(() => UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true }));

      if (response.getResponseCode() !== 200) {
        throw new Error(`API error: ${response.getResponseCode()}`);
      }

      const documents = JSON.parse(response.getContentText());

      // Check if we've reached the end
      if (!Array.isArray(documents) || documents.length === 0) {
        reachedEnd = true;
        break;
      }

      documents.forEach(doc => {
        if (doc.id && batchDocIds.length < batchSize) {
          batchDocIds.push(doc.id);
        }
      });

      if (documents.length < perPage) {
        reachedEnd = true;
        break;
      }

      page++;
    }

    Logger.log(`Fetched ${batchDocIds.length} document IDs from pages ${currentPage} to ${page}`);

    // Filter out already-synced documents
    const unsyncedIds = batchDocIds.filter(id => !syncedIds.has(id));
    Logger.log(`Unsynced documents in this batch: ${unsyncedIds.length}`);

    if (unsyncedIds.length === 0 && reachedEnd) {
      Logger.log('All warehouse documents synced!');
      props.deleteProperty('warehouse_sync_cursor');
      return {
        complete: true,
        synced: 0,
        remaining: 0,
        message: 'All warehouse documents synced'
      };
    }

    // Fetch full details with rate limiting
    const fullDocuments = [];
    const delayMs = 67; // ~900 calls/minute

    Logger.log(`Fetching full details for ${unsyncedIds.length} documents...`);
    unsyncedIds.forEach((docId, index) => {
      if (index % 500 === 0 && index > 0) {
        Logger.log(`Fetching details: ${index}/${unsyncedIds.length}...`);
      }

      const url = `https://${domain}.fakturownia.pl/warehouse_documents/${docId}.json?api_token=${apiToken}`;
      const response = withRetry(() => UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true }));

      if (response.getResponseCode() === 200) {
        fullDocuments.push(JSON.parse(response.getContentText()));
      }

      Utilities.sleep(delayMs);
    });

    Logger.log(`Fetched ${fullDocuments.length} complete documents`);

    // Process and insert
    const rows = explodeWarehouseDocuments(fullDocuments, warehouseMapping);
    Logger.log(`Exploded into ${rows.length} rows`);

    const result = upsertWarehouseRows(config.warehouse_sheet_id, rows);

    // Update cursor for next run
    if (reachedEnd) {
      props.deleteProperty('warehouse_sync_cursor');
      Logger.log('Reached end of warehouse documents');
    } else {
      props.setProperty('warehouse_sync_cursor', page.toString());
      Logger.log(`Saved cursor: page ${page}`);
    }

    const duration = (new Date() - startTime) / 1000;
    const totalSynced = syncedIds.size + fullDocuments.length;

    Logger.log('\n=== WAREHOUSE BATCH SYNC V2 COMPLETED ===');
    Logger.log(`Duration: ${Math.round(duration)}s (${Math.round(duration / 60)} min)`);
    Logger.log(`Synced this batch: ${fullDocuments.length} documents (${rows.length} rows)`);
    Logger.log(`Total synced so far: ${totalSynced} documents`);
    Logger.log(`New: ${result.new}, Updated: ${result.updated}`);

    if (!reachedEnd) {
      Logger.log(`\n>>> Run syncWarehouseBatchV2() again to continue sync from page ${page}`);
    }

    return {
      complete: reachedEnd,
      synced: fullDocuments.length,
      totalSynced: totalSynced,
      totalRows: rows.length,
      new: result.new,
      updated: result.updated
    };

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    throw error;
  }
}

/**
 * Syncs sales documents in batches using cursor-based approach
 * Run this function repeatedly until it reports "All sales documents synced"
 *
 * @param {number} batchSize - Number of documents to process per run (default: 5000)
 */
function syncSalesBatchV2(batchSize = 5000) {
  const startTime = new Date();
  const config = getConfig();
  const props = PropertiesService.getScriptProperties();
  const domain = props.getProperty('FAKTUROWNIA_DOMAIN');
  const apiToken = props.getProperty('FAKTUROWNIA_API_TOKEN');

  Logger.log('=== SALES BATCH SYNC V2 STARTED ===');
  Logger.log(`Batch size: ${batchSize} documents`);

  try {
    // Get sync cursor
    const cursor = props.getProperty('sales_sync_cursor') || '1';
    const currentPage = parseInt(cursor);
    Logger.log(`Starting from page ${currentPage}`);

    // Get already synced document IDs
    const syncedIds = getExistingSalesDocumentIds(config.sales_sheet_id);
    Logger.log(`Already synced: ${syncedIds.size} sales documents`);

    // Fetch batch of sales documents starting from cursor
    const batchDocs = [];
    let page = currentPage;
    const perPage = 100;
    let reachedEnd = false;

    Logger.log('Fetching sales documents...');
    while (batchDocs.length < batchSize) {
      const url = `https://${domain}.fakturownia.pl/invoices.json?api_token=${apiToken}&page=${page}&per_page=${perPage}&include_positions=true&income=yes`;
      const response = withRetry(() => UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true }));

      if (response.getResponseCode() !== 200) {
        throw new Error(`API error: ${response.getResponseCode()}`);
      }

      const docs = JSON.parse(response.getContentText());

      // Check if we've reached the end
      if (!Array.isArray(docs) || docs.length === 0) {
        reachedEnd = true;
        break;
      }

      // Add all docs from this page
      docs.forEach(doc => {
        if (batchDocs.length < batchSize) {
          batchDocs.push(doc);
        }
      });

      if (docs.length < perPage) {
        reachedEnd = true;
        break;
      }

      page++;

      // Rate limiting
      if (page % 5 === 0) {
        Utilities.sleep(100);
      }
    }

    Logger.log(`Fetched ${batchDocs.length} sales documents from pages ${currentPage} to ${page}`);

    // Filter out already-synced documents
    const unsyncedDocs = batchDocs.filter(doc => !syncedIds.has(doc.id));
    Logger.log(`Unsynced documents in this batch: ${unsyncedDocs.length}`);

    if (unsyncedDocs.length === 0 && reachedEnd) {
      Logger.log('All sales documents synced!');
      props.deleteProperty('sales_sync_cursor');
      return {
        complete: true,
        synced: 0,
        remaining: 0,
        message: 'All sales documents synced'
      };
    }

    // Load warehouse cost map
    const warehouseCostMap = loadWarehouseCostMap(config.warehouse_sheet_id);
    Logger.log(`Loaded ${Object.keys(warehouseCostMap).length} warehouse cost entries`);

    // Process and insert
    const result = upsertSalesDocuments(config.sales_sheet_id, unsyncedDocs, warehouseCostMap);

    // Update cursor for next run
    if (reachedEnd) {
      props.deleteProperty('sales_sync_cursor');
      Logger.log('Reached end of sales documents');
    } else {
      props.setProperty('sales_sync_cursor', page.toString());
      Logger.log(`Saved cursor: page ${page}`);
    }

    const duration = (new Date() - startTime) / 1000;
    const totalSynced = syncedIds.size + unsyncedDocs.length;

    Logger.log('\n=== SALES BATCH SYNC V2 COMPLETED ===');
    Logger.log(`Duration: ${Math.round(duration)}s (${Math.round(duration / 60)} min)`);
    Logger.log(`Synced this batch: ${unsyncedDocs.length} documents`);
    Logger.log(`Total synced so far: ${totalSynced} documents`);
    Logger.log(`New rows: ${result.new}, Updated: ${result.updated}`);

    if (!reachedEnd) {
      Logger.log(`\n>>> Run syncSalesBatchV2() again to continue sync from page ${page}`);
    }

    return {
      complete: reachedEnd,
      synced: unsyncedDocs.length,
      totalSynced: totalSynced,
      new: result.new,
      updated: result.updated
    };

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    throw error;
  }
}

/**
 * Reset sync cursors (use if you need to start over)
 */
function resetSyncCursors() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('warehouse_sync_cursor');
  props.deleteProperty('sales_sync_cursor');
  Logger.log('Sync cursors reset. Next sync will start from page 1.');
}

/**
 * Check current sync progress
 */
function checkSyncProgress() {
  const props = PropertiesService.getScriptProperties();
  const config = getConfig();

  const warehouseCursor = props.getProperty('warehouse_sync_cursor') || 'Not started';
  const salesCursor = props.getProperty('sales_sync_cursor') || 'Not started';

  const warehouseIds = getExistingWarehouseDocumentIds(config.warehouse_sheet_id);
  const salesIds = getExistingSalesDocumentIds(config.sales_sheet_id);

  Logger.log('=== SYNC PROGRESS ===');
  Logger.log(`Warehouse: ${warehouseIds.size} documents synced, cursor at page ${warehouseCursor}`);
  Logger.log(`Sales: ${salesIds.size} documents synced, cursor at page ${salesCursor}`);

  return {
    warehouse: {
      synced: warehouseIds.size,
      cursor: warehouseCursor
    },
    sales: {
      synced: salesIds.size,
      cursor: salesCursor
    }
  };
}
