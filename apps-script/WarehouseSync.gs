/**
 * Sensei - Warehouse Documents Sync
 * Syncs warehouse documents from Fakturownia API to Warehouse sheet
 * Each document contains multiple products (warehouse_actions) - each product becomes a separate row
 */

function syncWarehouse() {
  const startTime = new Date();
  const config = getConfig();
  const props = PropertiesService.getScriptProperties();
  const domain = props.getProperty('FAKTUROWNIA_DOMAIN');
  const apiToken = props.getProperty('FAKTUROWNIA_API_TOKEN');

  if (!domain || !apiToken) {
    throw new Error('API credentials not configured. Run setupScriptProperties() first.');
  }

  if (!config.warehouse_sheet_id) {
    throw new Error('Warehouse sheet ID not configured in Config sheet.');
  }

  Logger.log('Starting warehouse documents sync...');

  try {
    // Load warehouse mapping
    const warehouseMapping = getWarehouseMapping();
    Logger.log(`Loaded ${Object.keys(warehouseMapping).length} warehouse mappings`);

    const documents = fetchAllWarehouseDocuments(domain, apiToken);
    Logger.log(`Fetched ${documents.length} warehouse documents from API`);

    // Explode documents into rows (each warehouse_action becomes a row)
    const rows = explodeWarehouseDocuments(documents, warehouseMapping);
    Logger.log(`Exploded into ${rows.length} rows`);

    const result = upsertWarehouseRows(config.warehouse_sheet_id, rows);
    Logger.log(`Upsert complete: ${result.new} new, ${result.updated} updated`);

    const duration = (new Date() - startTime) / 1000;
    setConfig('last_sync_warehouse', startTime.toISOString());
    logSync(startTime, 'warehouse', rows.length, result.new, result.updated, 'success', null, duration);

    Logger.log(`Warehouse sync completed successfully in ${duration}s`);
    return result;

  } catch (error) {
    const duration = (new Date() - startTime) / 1000;
    logSync(startTime, 'warehouse', 0, 0, 0, 'failed', error.message, duration);
    throw error;
  }
}

function fetchAllWarehouseDocuments(domain, apiToken) {
  // First, get list of all warehouse document IDs
  const allDocIds = [];
  let page = 1;
  const perPage = 100;

  Logger.log('Fetching warehouse document IDs...');

  while (true) {
    const url = `https://${domain}.fakturownia.pl/warehouse_documents.json?api_token=${apiToken}&page=${page}&per_page=${perPage}`;

    const response = withRetry(() => {
      return UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true
      });
    });

    if (response.getResponseCode() !== 200) {
      throw new Error(`API error: ${response.getResponseCode()} - ${response.getContentText()}`);
    }

    const documents = JSON.parse(response.getContentText());

    if (!Array.isArray(documents) || documents.length === 0) {
      break;
    }

    // Extract just the IDs
    documents.forEach(doc => {
      if (doc.id) {
        allDocIds.push(doc.id);
      }
    });

    if (documents.length < perPage) {
      break;
    }

    page++;
  }

  Logger.log(`Found ${allDocIds.length} warehouse documents. Fetching full details...`);

  // Now fetch each document individually to get warehouse_actions
  // Rate limiting: Max 900 calls/minute (aggressive but safe)
  const fullDocuments = [];
  const maxCallsPerMinute = 900;
  const msPerMinute = 60000;
  const delayMs = Math.floor(msPerMinute / maxCallsPerMinute); // ~67ms per call

  let callCount = 0;
  let minuteStartTime = Date.now();

  allDocIds.forEach((docId, index) => {
    // Progress logging every 1000 docs
    if (index % 1000 === 0 && index > 0) {
      Logger.log(`Fetching details: ${index}/${allDocIds.length}...`);
    }

    const url = `https://${domain}.fakturownia.pl/warehouse_documents/${docId}.json?api_token=${apiToken}`;

    const response = withRetry(() => {
      return UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true
      });
    });

    callCount++;

    if (response.getResponseCode() === 200) {
      const fullDoc = JSON.parse(response.getContentText());
      fullDocuments.push(fullDoc);
    } else {
      Logger.log(`Warning: Failed to fetch document ${docId}`);
    }

    // Apply consistent delay after each call
    Utilities.sleep(delayMs);

    // Track and reset counter every minute
    const now = Date.now();
    if (now - minuteStartTime >= msPerMinute) {
      Logger.log(`Progress: ${index + 1}/${allDocIds.length} (${callCount} calls/min, ${fullDocuments.length} successful)`);
      callCount = 0;
      minuteStartTime = now;
    }
  });

  Logger.log(`Successfully fetched ${fullDocuments.length} complete warehouse documents`);
  return fullDocuments;
}

/**
 * Explode warehouse documents into rows
 * Each warehouse_action (product) becomes a separate row
 * Returns array of row objects with composite key
 */
function explodeWarehouseDocuments(documents, warehouseMapping) {
  const rows = [];
  const now = new Date().toISOString();

  documents.forEach(doc => {
    const warehouseActions = doc.warehouse_actions || [];

    if (warehouseActions.length === 0) {
      Logger.log(`Warning: Document ${doc.id} has no warehouse_actions`);
      return;
    }

    warehouseActions.forEach(action => {
      const quantity = parseFloat(action.quantity || 0);
      const totalCostNet = parseFloat(action.total_purchase_price_net || 0);
      const totalCostGross = parseFloat(action.total_purchase_price_gross || 0);

      // Convert from purchase currency (EUR/USD/etc) to PLN using exchange rate
      const purchaseCurrency = action.purchase_currency || 'PLN';
      const exchangeRate = parseFloat(action.purchase_exchange_currency_rate || 1);

      // If purchase currency is not PLN, convert it
      const totalCostNetPLN = purchaseCurrency !== 'PLN' ? totalCostNet * exchangeRate : totalCostNet;
      const totalCostGrossPLN = purchaseCurrency !== 'PLN' ? totalCostGross * exchangeRate : totalCostGross;

      // Calculate per-unit cost in PLN (handle division by zero)
      const unitCostNet = quantity !== 0 ? Math.abs(totalCostNetPLN / quantity) : 0;
      const unitCostGross = quantity !== 0 ? Math.abs(totalCostGrossPLN / quantity) : 0;

      // Look up warehouse name from mapping
      const warehouseId = doc.warehouse_id || '';
      const warehouseName = warehouseMapping[warehouseId] || '';

      rows.push({
        // Composite key for upsert
        key: `${doc.id}_${action.product_id}`,

        // Row data (14 columns matching Warehouse sheet)
        document_id: doc.id,
        document_number: doc.number || '',
        document_type: doc.kind || '',
        issue_date: doc.issue_date || '',
        warehouse_id: warehouseId,
        warehouse_name: warehouseName,
        product_id: action.product_id || '',
        sku: action.code || '',  // Use 'code' field, not 'product_code'
        product_name: action.product_name || '',
        quantity: quantity,
        purchase_price_net: unitCostNet,  // Per-unit cost in PLN
        purchase_price_gross: unitCostGross,  // Per-unit cost in PLN
        purchase_tax: parseFloat(action.purchase_tax || 0),
        last_updated: now
      });
    });
  });

  return rows;
}

function upsertWarehouseRows(sheetId, rows) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName('Warehouse_Documents');

  if (!sheet) {
    throw new Error('Warehouse_Documents sheet not found');
  }

  // Get existing data
  const lastRow = sheet.getLastRow();
  const existingData = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 14).getValues() : [];

  // Build map of existing rows (composite key: document_id_product_id -> row index)
  const existingMap = {};
  existingData.forEach((row, idx) => {
    if (row[0] && row[6]) { // document_id (col 0) and product_id (col 6)
      const key = `${row[0]}_${row[6]}`;
      existingMap[key] = idx + 2; // +2 because: 0-indexed array + 1 for header row + 1 for actual row
    }
  });

  let newCount = 0;
  let updatedCount = 0;

  const newRows = [];
  const updateOperations = [];

  // Process each row
  rows.forEach(rowData => {
    const row = [
      rowData.document_id,
      rowData.document_number,
      rowData.document_type,
      rowData.issue_date,
      rowData.warehouse_id,
      rowData.warehouse_name,
      rowData.product_id,
      rowData.sku,
      rowData.product_name,
      rowData.quantity,
      rowData.purchase_price_net,
      rowData.purchase_price_gross,
      rowData.purchase_tax,
      rowData.last_updated
    ];

    const existingRowNum = existingMap[rowData.key];

    if (existingRowNum) {
      // Queue update
      updateOperations.push({ rowNum: existingRowNum, data: row });
      updatedCount++;
    } else {
      // Queue new row
      newRows.push(row);
      newCount++;
    }
  });

  // Batch write updates
  if (updateOperations.length > 0) {
    updateOperations.forEach(op => {
      sheet.getRange(op.rowNum, 1, 1, 14).setValues([op.data]);
    });
  }

  // Batch append new rows
  if (newRows.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, 14).setValues(newRows);
  }

  return { new: newCount, updated: updatedCount };
}

/**
 * Test function - sync a small sample of warehouse documents
 * @param {number} count - Number of warehouse documents to fetch (default: 10)
 */
function testWarehouseSync(count = 10) {
  const startTime = new Date();
  const config = getConfig();
  const props = PropertiesService.getScriptProperties();
  const domain = props.getProperty('FAKTUROWNIA_DOMAIN');
  const apiToken = props.getProperty('FAKTUROWNIA_API_TOKEN');

  Logger.log(`TEST MODE: Fetching ${count} most recent warehouse documents`);

  try {
    // Load warehouse mapping
    const warehouseMapping = getWarehouseMapping();
    Logger.log(`Loaded ${Object.keys(warehouseMapping).length} warehouse mappings`);

    // Fetch list of document IDs
    const allDocIds = [];
    let page = 1;
    const perPage = 100;

    while (allDocIds.length < count) {
      const url = `https://${domain}.fakturownia.pl/warehouse_documents.json?api_token=${apiToken}&page=${page}&per_page=${perPage}`;

      const response = UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true
      });

      if (response.getResponseCode() !== 200) {
        throw new Error(`API error: ${response.getResponseCode()}`);
      }

      const documents = JSON.parse(response.getContentText());

      if (!Array.isArray(documents) || documents.length === 0) {
        break;
      }

      documents.forEach(doc => {
        if (doc.id && allDocIds.length < count) {
          allDocIds.push(doc.id);
        }
      });

      page++;

      if (documents.length < perPage) {
        break;
      }
    }

    Logger.log(`Fetched ${allDocIds.length} document IDs`);

    // Fetch full details for each document
    const fullDocuments = [];
    allDocIds.forEach((docId, index) => {
      if (index % 50 === 0 && index > 0) {
        Logger.log(`Fetching details: ${index}/${allDocIds.length}...`);
      }

      const detailUrl = `https://${domain}.fakturownia.pl/warehouse_documents/${docId}.json?api_token=${apiToken}`;

      const detailResponse = withRetry(() => {
        return UrlFetchApp.fetch(detailUrl, {
          method: 'get',
          muteHttpExceptions: true
        });
      });

      if (detailResponse.getResponseCode() === 200) {
        const fullDoc = JSON.parse(detailResponse.getContentText());
        fullDocuments.push(fullDoc);
      }
    });

    Logger.log(`Fetched ${fullDocuments.length} complete documents`);

    const rows = explodeWarehouseDocuments(fullDocuments, warehouseMapping);
    Logger.log(`Exploded into ${rows.length} rows`);

    const result = upsertWarehouseRows(config.warehouse_sheet_id, rows);
    Logger.log(`Test upsert complete: ${result.new} new, ${result.updated} updated`);

    const duration = (new Date() - startTime) / 1000;
    Logger.log(`Test completed successfully in ${duration}s`);

    return {
      success: true,
      documents: fullDocuments.length,
      rows: rows.length,
      new: result.new,
      updated: result.updated
    };

  } catch (error) {
    Logger.log(`Test failed: ${error.message}`);
    throw error;
  }
}
