/**
 * Sensei - Cleanup Script
 * Wipes all data from Products, Warehouse, and Sales sheets
 * Run this before full historical sync to start fresh
 */

/**
 * Wipes all data from all three data sheets
 * WARNING: This deletes all rows except headers. Cannot be undone!
 */
function wipeAllDataSheets() {
  const config = getConfig();

  if (!config.products_sheet_id || !config.warehouse_sheet_id || !config.sales_sheet_id) {
    throw new Error('Sheet IDs not configured in Config sheet');
  }

  Logger.log('=== WIPING ALL DATA SHEETS ===');
  Logger.log('WARNING: This will delete all data from Products, Warehouse, and Sales sheets');

  const results = {
    products: 0,
    warehouse: 0,
    sales: 0
  };

  // Wipe Products sheet
  Logger.log('\n--- Wiping Products sheet ---');
  try {
    results.products = wipeSheet(config.products_sheet_id, 'Products');
    Logger.log(`Deleted ${results.products} product rows`);
  } catch (error) {
    Logger.log(`ERROR wiping Products: ${error.message}`);
    throw error;
  }

  // Wipe Warehouse sheet
  Logger.log('\n--- Wiping Warehouse sheet ---');
  try {
    results.warehouse = wipeSheet(config.warehouse_sheet_id, 'Warehouse_Documents');
    Logger.log(`Deleted ${results.warehouse} warehouse rows`);
  } catch (error) {
    Logger.log(`ERROR wiping Warehouse: ${error.message}`);
    throw error;
  }

  // Wipe Sales sheet
  Logger.log('\n--- Wiping Sales sheet ---');
  try {
    results.sales = wipeSheet(config.sales_sheet_id, 'Sales_Documents');
    Logger.log(`Deleted ${results.sales} sales rows`);
  } catch (error) {
    Logger.log(`ERROR wiping Sales: ${error.message}`);
    throw error;
  }

  Logger.log('\n=== CLEANUP COMPLETED ===');
  Logger.log(`Total rows deleted: ${results.products + results.warehouse + results.sales}`);
  Logger.log('All sheets are now empty and ready for full sync');

  return results;
}

/**
 * Wipes all data rows from a specific sheet (keeps header row)
 * @param {string} sheetId - The Google Sheet ID
 * @param {string} sheetName - The sheet tab name
 * @returns {number} Number of rows deleted
 */
function wipeSheet(sheetId, sheetName) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in spreadsheet ${sheetId}`);
  }

  const lastRow = sheet.getLastRow();

  // If only header row exists (row 1), nothing to delete
  if (lastRow <= 1) {
    Logger.log(`  Sheet "${sheetName}" is already empty (only header row)`);
    return 0;
  }

  // Clear data instead of deleting rows (Google Sheets limitation)
  // This clears all data but keeps the rows in place
  const numCols = sheet.getLastColumn();
  const dataRows = lastRow - 1;

  if (dataRows > 0) {
    sheet.getRange(2, 1, dataRows, numCols).clearContent();
    Logger.log(`  Cleared ${dataRows} rows from "${sheetName}"`);
  }

  return dataRows;
}

/**
 * Wipe only Products sheet
 */
function wipeProductsOnly() {
  const config = getConfig();
  Logger.log('Wiping Products sheet only...');
  const deleted = wipeSheet(config.products_sheet_id, 'Products');
  Logger.log(`Deleted ${deleted} rows`);
  return deleted;
}

/**
 * Wipe only Warehouse sheet
 */
function wipeWarehouseOnly() {
  const config = getConfig();
  Logger.log('Wiping Warehouse sheet only...');
  const deleted = wipeSheet(config.warehouse_sheet_id, 'Warehouse_Documents');
  Logger.log(`Deleted ${deleted} rows`);
  return deleted;
}

/**
 * Wipe only Sales sheet
 */
function wipeSalesOnly() {
  const config = getConfig();
  Logger.log('Wiping Sales sheet only...');
  const deleted = wipeSheet(config.sales_sheet_id, 'Sales_Documents');
  Logger.log(`Deleted ${deleted} rows`);
  return deleted;
}
