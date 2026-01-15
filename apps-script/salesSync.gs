/**
 * Sensei - Sales Sync
 * Syncs sales documents (invoices/receipts) from Fakturownia with cost and margin data
 * Costs are looked up from the Warehouse sheet (no additional API calls needed)
 */

/**
 * Map Fakturownia document types to readable Polish names
 * Special case: Receipts starting with "ZP" are returns (Zwrot)
 */
function mapDocumentType(kind, documentNumber) {
  // Check if it's a ZP receipt (zwrot do paragonu)
  if (kind === 'receipt' && documentNumber && documentNumber.startsWith('ZP')) {
    return 'Zwrot';
  }

  const typeMap = {
    'vat': 'Faktura',
    'correction': 'Korekta',
    'receipt': 'Paragon',
    'bill': 'Nota'
  };

  return typeMap[kind] || kind; // Return original if not mapped
}

/**
 * Determine sales channel based on document type
 * Online: Faktura, Korekta
 * Offline: Paragon, Zwrot
 */
function getChannel(documentType) {
  const offlineTypes = ['Paragon', 'Zwrot'];
  return offlineTypes.includes(documentType) ? 'offline' : 'online';
}

/**
 * Clean payment type by removing appended amounts in parentheses
 * Example: "Google Pay (590,00)" -> "Google Pay"
 */
function cleanPaymentType(paymentType) {
  if (!paymentType) return '';
  // Remove anything in parentheses at the end, including the space before it
  return paymentType.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Check if document should be skipped (e.g., KP documents)
 */
function shouldSkipDocument(documentNumber) {
  if (!documentNumber) return false;
  // Skip KP documents (internal cost documents)
  return documentNumber.startsWith('KP');
}

function syncSales() {
  const startTime = new Date();
  const config = getConfig();
  const props = PropertiesService.getScriptProperties();
  const domain = props.getProperty('FAKTUROWNIA_DOMAIN');
  const apiToken = props.getProperty('FAKTUROWNIA_API_TOKEN');

  if (!domain || !apiToken) {
    throw new Error('API credentials not configured.');
  }

  if (!config.sales_sheet_id || !config.warehouse_sheet_id) {
    throw new Error('Sales and Warehouse sheet IDs must be configured in Config sheet.');
  }

  Logger.log('Starting sales sync...');

  try {
    const brands = getBrandMapping();
    Logger.log(`Loaded ${brands.length} brands from mapping`);

    const salesDocs = fetchAllSalesDocuments(domain, apiToken);
    Logger.log(`Fetched ${salesDocs.length} sales documents from API`);

    // Load warehouse data once for cost lookups
    const warehouseCostMap = loadWarehouseCostMap(config.warehouse_sheet_id);
    Logger.log(`Loaded ${Object.keys(warehouseCostMap).length} warehouse cost entries`);

    const result = upsertSalesDocuments(config.sales_sheet_id, salesDocs, warehouseCostMap, brands);
    Logger.log(`Upsert complete: ${result.new} new, ${result.updated} updated`);

    const duration = (new Date() - startTime) / 1000;
    setConfig('last_sync_sales', startTime.toISOString());
    logSync(startTime, 'sales', salesDocs.length, result.new, result.updated, 'success', null, duration);

    Logger.log(`Sales sync completed successfully in ${duration}s`);
    return result;

  } catch (error) {
    const duration = (new Date() - startTime) / 1000;
    logSync(startTime, 'sales', 0, 0, 0, 'failed', error.message, duration);
    throw error;
  }
}

function fetchAllSalesDocuments(domain, apiToken) {
  const allDocs = [];
  let page = 1;
  const perPage = 100;

  // Rate limiting: 950 calls/minute (safety margin under 1000/min limit)
  const delayBetweenPages = 100; // 100ms = ~600 calls/minute (conservative)

  while (true) {
    // Fetch invoices and receipts (income documents)
    const url = `https://${domain}.fakturownia.pl/invoices.json?` +
      `api_token=${apiToken}&page=${page}&per_page=${perPage}&include_positions=true&income=yes`;

    // Progress logging every 10 pages
    if (page % 10 === 0 || page === 1) {
      Logger.log(`Fetching sales documents page ${page}... (${allDocs.length} docs so far)`);
    }

    const response = withRetry(() => {
      return UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true
      });
    });

    if (response.getResponseCode() !== 200) {
      throw new Error(`API error: ${response.getResponseCode()} - ${response.getContentText()}`);
    }

    const docs = JSON.parse(response.getContentText());

    if (!Array.isArray(docs) || docs.length === 0) {
      break;
    }

    allDocs.push(...docs);

    if (docs.length < perPage) {
      break;
    }

    page++;

    // Rate limiting delay between pages
    if (page % 5 === 0) {
      Utilities.sleep(delayBetweenPages);
    }
  }

  Logger.log(`Completed fetching all sales documents: ${allDocs.length} total docs across ${page} pages`);
  return allDocs;
}

/**
 * Load warehouse cost data into memory for fast lookups
 * Returns map: document_id_product_id -> { costNet, warehouseDocId }
 */
function loadWarehouseCostMap(warehouseSheetId) {
  const ss = SpreadsheetApp.openById(warehouseSheetId);
  const sheet = ss.getSheetByName('Warehouse_Documents');

  if (!sheet) {
    throw new Error('Warehouse_Documents sheet not found');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('Warning: Warehouse sheet is empty');
    return {};
  }

  // Get all warehouse data (columns: document_id, ..., product_id, ..., purchase_price_net)
  const data = sheet.getRange(2, 1, lastRow - 1, 14).getValues();
  const costMap = {};
  let wzCount = 0;
  let skippedCount = 0;

  data.forEach(row => {
    const docId = row[0];           // document_id (col A)
    const docType = row[2];         // document_type (col C)
    const productId = row[6];       // product_id (col G)
    const costNet = row[10];        // purchase_price_net (col K)

    if (!docId || !productId) {
      skippedCount++;
      return; // Skip incomplete rows
    }

    // Only use WZ documents (outbound) for cost lookups
    if (docType !== 'wz') {
      skippedCount++;
      return;
    }

    wzCount++;
    const key = `${docId}_${productId}`;
    costMap[key] = {
      costNet: parseFloat(costNet || 0),
      warehouseDocId: docId
    };
  });

  Logger.log(`Warehouse map stats: ${wzCount} WZ entries added, ${skippedCount} rows skipped`);

  return costMap;
}

function upsertSalesDocuments(sheetId, salesDocs, warehouseCostMap, brands) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName('Sales_Documents');

  if (!sheet) {
    throw new Error('Sales_Documents sheet not found');
  }

  // Get existing data
  const lastRow = sheet.getLastRow();
  const existingData = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 25).getValues() : [];

  // Build map of existing sales (composite key: document_id + product_id -> row index)
  const existingMap = {};
  existingData.forEach((row, idx) => {
    if (row[0] && row[8]) {
      const key = `${row[0]}_${row[8]}`; // document_id_product_id
      existingMap[key] = idx + 2;
    }
  });

  let newCount = 0;
  let updatedCount = 0;
  const now = new Date().toISOString();

  const newRows = [];
  const updateOperations = [];

  // Process each sales document
  salesDocs.forEach((doc, index) => {
    // Progress logging every 500 documents
    if (index % 500 === 0 && index > 0) {
      Logger.log(`Processing documents: ${index}/${salesDocs.length} (${newCount} new, ${updatedCount} updated so far)`);
    }

    // Skip KP documents (internal cost documents)
    if (shouldSkipDocument(doc.number)) {
      return;
    }

    if (!doc.positions || doc.positions.length === 0) {
      return; // Skip documents without line items
    }

    // Map document type and determine channel (needed for each position)
    const documentType = mapDocumentType(doc.kind, doc.number);
    const channel = getChannel(documentType);
    const cleanedPaymentType = cleanPaymentType(doc.payment_type);

    // Process each line item
    doc.positions.forEach(position => {
      const productId = position.product_id || '';

      // Find warehouse document ID linked to this sale (from API response)
      // Field is 'warehouse_document_id' (singular), not 'warehouse_document_ids' (plural)
      const wzDocId = doc.warehouse_document_id || null;

      // Lookup cost from warehouse cost map
      let costData = null;
      if (wzDocId && productId) {
        const key = `${wzDocId}_${productId}`;
        costData = warehouseCostMap[key];
      }

      // Calculate margin
      const totalPriceNet = parseFloat(position.total_price_net || 0);
      const quantity = parseFloat(position.quantity || 0);
      let marginPln = null;
      let marginPercent = null;
      let costAvailable = false;

      if (costData && costData.costNet) {
        const totalCost = costData.costNet * quantity;
        marginPln = Math.round((totalPriceNet - totalCost) * 100) / 100; // Round to 2 decimals
        marginPercent = totalPriceNet > 0
          ? Math.round(((marginPln / totalPriceNet) * 100) * 100) / 100  // Round to 2 decimals
          : 0;
        costAvailable = true;
      }

      // Parse product name into brand, model, color, size
      // Handle both formats:
      // Old: "Brand Model - Color, Size" (e.g., "Xero Shoes Denver - Black, 45.5")
      // New: "Brand Model - Size - Color" (e.g., "Xero Shoes Denver - 45.5 - Black")
      const productName = position.name || '';
      let brand = '';
      let model = '';
      let size = '';
      let color = '';

      // First, extract brand
      brand = parseBrandFromProductName(productName, brands);
      const nameWithoutBrand = brand ? productName.substring(brand.length).trim().replace(/^-\s*/, '') : productName;

      if (nameWithoutBrand.includes(', ')) {
        // Old format: "Model - Color, Size"
        const parts = nameWithoutBrand.split(' - ');
        model = parts[0] || '';
        const remainingPart = parts[1] || '';
        const colorSizeParts = remainingPart.split(', ');
        color = colorSizeParts[0] || '';
        size = colorSizeParts[1] || '';
      } else {
        // New format: "Model - Size - Color"
        const parts = nameWithoutBrand.split(' - ');
        model = parts[0] || '';
        size = parts[1] || '';
        color = parts[2] || '';
      }

      const row = [
        doc.id,                                    // document_id (hidden)
        doc.number || '',                          // document_number
        documentType,                              // document_type (mapped to Polish, checks for ZP)
        doc.sell_date || '',                       // sell_date
        doc.issue_date || '',                      // issue_date
        cleanedPaymentType,                        // payment_type (cleaned, no amounts)
        channel,                                   // channel (online for Faktura/Korekta, offline for Paragon/Zwrot)
        doc.seller_name || '',                     // store_location (Department)
        productId,                                 // product_id (hidden)
        position.code || '',                       // sku
        productName,                               // product_name (full variant name)
        brand,                                     // brand
        model,                                     // model
        color,                                     // color
        size,                                      // size
        quantity,                                  // quantity
        parseFloat(position.price_net || 0),       // net_price (unit price)
        parseFloat(position.discount_percent || 0), // discount_percent
        parseFloat(position.tax || 0),             // vat_rate (hidden)
        wzDocId || '',                             // warehouse_doc_id (hidden)
        costData ? costData.costNet : '',          // actual_cost_net
        marginPln !== null ? marginPln : '',       // margin_pln
        marginPercent !== null ? marginPercent : '', // margin_percent
        costAvailable ? 'TRUE' : 'FALSE',          // cost_available
        now                                        // last_updated
      ];

      const key = `${doc.id}_${productId}`;
      const existingRowNum = existingMap[key];

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
  });

  // Batch write updates
  if (updateOperations.length > 0) {
    Logger.log(`Writing ${updateOperations.length} updates...`);
    updateOperations.forEach(op => {
      sheet.getRange(op.rowNum, 1, 1, 25).setValues([op.data]);
    });
  }

  // Batch append new rows
  if (newRows.length > 0) {
    Logger.log(`Appending ${newRows.length} new rows...`);
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, 25).setValues(newRows);
  }

  return { new: newCount, updated: updatedCount };
}


/**
 * Test function - sync sample sales documents with detailed debugging
 * @param {number} count - Number of sales documents to fetch (default: 5)
 */
function testSalesSync(count = 5) {
  const startTime = new Date();
  const config = getConfig();
  const props = PropertiesService.getScriptProperties();
  const domain = props.getProperty('FAKTUROWNIA_DOMAIN');
  const apiToken = props.getProperty('FAKTUROWNIA_API_TOKEN');

  Logger.log(`TEST MODE: Fetching ${count} most recent sales documents`);

  try {
    const allDocs = [];
    const perPage = 100;
    let page = 1;

    // Fetch pages until we have enough documents
    while (allDocs.length < count) {
      const url = `https://${domain}.fakturownia.pl/invoices.json?` +
        `api_token=${apiToken}&page=${page}&per_page=${perPage}&include_positions=true&income=yes`;

      const response = UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true
      });

      if (response.getResponseCode() !== 200) {
        throw new Error(`API error: ${response.getResponseCode()} - ${response.getContentText()}`);
      }

      const docs = JSON.parse(response.getContentText());

      if (!Array.isArray(docs) || docs.length === 0) {
        break;
      }

      allDocs.push(...docs);
      page++;

      if (docs.length < perPage || allDocs.length >= count) {
        break;
      }
    }

    // Trim to exact count
    const docsToSync = allDocs.slice(0, count);
    Logger.log(`Fetched ${docsToSync.length} test documents`);

    // Log unique document types
    const uniqueTypes = {};
    docsToSync.forEach(doc => {
      if (doc.kind) {
        uniqueTypes[doc.kind] = (uniqueTypes[doc.kind] || 0) + 1;
      }
    });
    Logger.log('Document types in batch:');
    Object.keys(uniqueTypes).forEach(type => {
      Logger.log(`  ${type}: ${uniqueTypes[type]}`);
    });

    // Load warehouse cost map
    const warehouseCostMap = loadWarehouseCostMap(config.warehouse_sheet_id);
    Logger.log(`Loaded ${Object.keys(warehouseCostMap).length} warehouse cost entries`);

    const result = upsertSalesDocuments(config.sales_sheet_id, docsToSync, warehouseCostMap);
    Logger.log(`Test upsert complete: ${result.new} new, ${result.updated} updated`);

    const duration = (new Date() - startTime) / 1000;
    Logger.log(`Test completed successfully in ${duration}s`);

    return {
      success: true,
      documents: docsToSync.length,
      new: result.new,
      updated: result.updated
    };

  } catch (error) {
    Logger.log(`Test failed: ${error.message}`);
    throw error;
  }
}
