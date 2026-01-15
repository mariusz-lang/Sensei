/**
 * Sensei - Recalculate Margins
 * Updates cost and margin data for sales rows using existing warehouse data
 * No API calls needed - all data is already in sheets
 */

/**
 * Recalculate costs and margins for all sales rows
 * Uses existing warehouse data to look up costs
 */
function recalculateAllMargins() {
  const startTime = new Date();
  const config = getConfig();

  Logger.log('=== RECALCULATING MARGINS ===');
  Logger.log('Loading warehouse cost map...');

  // Load warehouse cost map (same as sales sync does)
  const warehouseCostMap = loadWarehouseCostMap(config.warehouse_sheet_id);
  Logger.log(`Loaded ${Object.keys(warehouseCostMap).length} warehouse cost entries`);

  // Open sales sheet
  const ss = SpreadsheetApp.openById(config.sales_sheet_id);
  const sheet = ss.getSheetByName('Sales_Documents');

  if (!sheet) {
    throw new Error('Sales_Documents sheet not found');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('No sales data to process');
    return;
  }

  Logger.log(`Processing ${lastRow - 1} sales rows...`);

  // Get all sales data
  const data = sheet.getRange(2, 1, lastRow - 1, 24).getValues();

  // Column indices (0-based)
  const COL_QUANTITY = 14;          // quantity
  const COL_NET_PRICE = 15;         // net_price
  const COL_PRODUCT_ID = 8;         // product_id
  const COL_WZ_DOC_ID = 18;         // warehouse_doc_id
  const COL_ACTUAL_COST_NET = 19;   // actual_cost_net
  const COL_MARGIN_PLN = 20;        // margin_pln
  const COL_MARGIN_PERCENT = 21;    // margin_percent
  const COL_COST_AVAILABLE = 22;    // cost_available
  const COL_LAST_UPDATED = 23;      // last_updated

  let updatedCount = 0;
  let foundCostCount = 0;
  let missingCostCount = 0;
  const now = new Date().toISOString();

  // Process each row
  data.forEach((row, idx) => {
    if ((idx + 1) % 10000 === 0) {
      Logger.log(`Processing row ${idx + 1}/${data.length}...`);
    }

    const productId = row[COL_PRODUCT_ID];
    const wzDocId = row[COL_WZ_DOC_ID];
    const quantity = parseFloat(row[COL_QUANTITY] || 0);
    const totalPriceNet = parseFloat(row[COL_NET_PRICE] || 0) * quantity;

    // Lookup cost
    let costData = null;
    if (wzDocId && productId) {
      const key = `${wzDocId}_${productId}`;
      costData = warehouseCostMap[key];
    }

    // Calculate margin
    let actualCostNet = '';
    let marginPln = '';
    let marginPercent = '';
    let costAvailable = 'FALSE';

    if (costData && costData.costNet) {
      actualCostNet = costData.costNet;
      const totalCost = costData.costNet * quantity;
      marginPln = Math.round((totalPriceNet - totalCost) * 100) / 100;
      marginPercent = totalPriceNet > 0
        ? Math.round(((marginPln / totalPriceNet) * 100) * 100) / 100
        : 0;
      costAvailable = 'TRUE';
      foundCostCount++;
    } else {
      missingCostCount++;
    }

    // Check if values changed
    const oldCostAvail = row[COL_COST_AVAILABLE];
    if (oldCostAvail !== costAvailable) {
      // Update the row
      row[COL_ACTUAL_COST_NET] = actualCostNet;
      row[COL_MARGIN_PLN] = marginPln;
      row[COL_MARGIN_PERCENT] = marginPercent;
      row[COL_COST_AVAILABLE] = costAvailable;
      row[COL_LAST_UPDATED] = now;
      updatedCount++;
    }
  });

  // Write all changes back to sheet
  Logger.log(`Writing updates to sheet...`);
  sheet.getRange(2, 1, data.length, 24).setValues(data);

  const duration = (new Date() - startTime) / 1000;

  Logger.log('\n=== RECALCULATION COMPLETE ===');
  Logger.log(`Duration: ${Math.round(duration)}s (${Math.round(duration / 60)} min)`);
  Logger.log(`Total rows processed: ${data.length}`);
  Logger.log(`Rows updated: ${updatedCount}`);
  Logger.log(`With cost data: ${foundCostCount} (${(foundCostCount/data.length*100).toFixed(1)}%)`);
  Logger.log(`Missing cost data: ${missingCostCount} (${(missingCostCount/data.length*100).toFixed(1)}%)`);

  return {
    totalRows: data.length,
    updated: updatedCount,
    withCost: foundCostCount,
    missingCost: missingCostCount
  };
}

/**
 * Recalculate margins only for rows where cost_available is FALSE
 * More efficient - only updates rows that need it
 */
function recalculateMissingMargins() {
  const startTime = new Date();
  const config = getConfig();

  Logger.log('=== RECALCULATING MISSING MARGINS ===');
  Logger.log('Loading warehouse cost map...');

  const warehouseCostMap = loadWarehouseCostMap(config.warehouse_sheet_id);
  Logger.log(`Loaded ${Object.keys(warehouseCostMap).length} warehouse cost entries`);

  const ss = SpreadsheetApp.openById(config.sales_sheet_id);
  const sheet = ss.getSheetByName('Sales_Documents');

  if (!sheet) {
    throw new Error('Sales_Documents sheet not found');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('No sales data to process');
    return;
  }

  Logger.log(`Scanning ${lastRow - 1} sales rows for missing costs...`);

  const data = sheet.getRange(2, 1, lastRow - 1, 24).getValues();

  const COL_QUANTITY = 14;
  const COL_NET_PRICE = 15;
  const COL_PRODUCT_ID = 8;
  const COL_WZ_DOC_ID = 18;
  const COL_ACTUAL_COST_NET = 19;
  const COL_MARGIN_PLN = 20;
  const COL_MARGIN_PERCENT = 21;
  const COL_COST_AVAILABLE = 22;
  const COL_LAST_UPDATED = 23;

  let updatedCount = 0;
  let stillMissingCount = 0;
  const now = new Date().toISOString();

  const rowsToUpdate = [];

  data.forEach((row, idx) => {
    const costAvailable = row[COL_COST_AVAILABLE];

    // Only process rows where cost is currently FALSE
    if (costAvailable === 'FALSE' || costAvailable === false) {
      const productId = row[COL_PRODUCT_ID];
      const wzDocId = row[COL_WZ_DOC_ID];
      const quantity = parseFloat(row[COL_QUANTITY] || 0);
      const totalPriceNet = parseFloat(row[COL_NET_PRICE] || 0) * quantity;

      // Try to find cost
      let costData = null;
      if (wzDocId && productId) {
        const key = `${wzDocId}_${productId}`;
        costData = warehouseCostMap[key];
      }

      if (costData && costData.costNet) {
        // Found cost! Update the row
        const actualCostNet = costData.costNet;
        const totalCost = costData.costNet * quantity;
        const marginPln = Math.round((totalPriceNet - totalCost) * 100) / 100;
        const marginPercent = totalPriceNet > 0
          ? Math.round(((marginPln / totalPriceNet) * 100) * 100) / 100
          : 0;

        row[COL_ACTUAL_COST_NET] = actualCostNet;
        row[COL_MARGIN_PLN] = marginPln;
        row[COL_MARGIN_PERCENT] = marginPercent;
        row[COL_COST_AVAILABLE] = 'TRUE';
        row[COL_LAST_UPDATED] = now;

        rowsToUpdate.push(idx + 2); // +2 for header and 0-index
        updatedCount++;
      } else {
        stillMissingCount++;
      }
    }
  });

  // Write changes
  if (updatedCount > 0) {
    Logger.log(`Writing ${updatedCount} updates to sheet...`);
    sheet.getRange(2, 1, data.length, 24).setValues(data);
  }

  const duration = (new Date() - startTime) / 1000;

  Logger.log('\n=== RECALCULATION COMPLETE ===');
  Logger.log(`Duration: ${Math.round(duration)}s`);
  Logger.log(`Rows updated: ${updatedCount}`);
  Logger.log(`Still missing cost: ${stillMissingCount}`);

  if (rowsToUpdate.length <= 10) {
    Logger.log(`Updated rows: ${rowsToUpdate.join(', ')}`);
  }

  return {
    updated: updatedCount,
    stillMissing: stillMissingCount
  };
}
