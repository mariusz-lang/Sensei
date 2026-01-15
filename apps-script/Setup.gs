/**
 * Sensei - Setup Script
 * Run this once to initialize the Control sheet structure
 */

function setupControlSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Rename the first sheet to Config
  const firstSheet = ss.getSheets()[0];
  firstSheet.setName('Config');

  // Create Config sheet structure
  setupConfigSheet(firstSheet);

  // Create Sync_Log sheet
  const syncLogSheet = ss.insertSheet('Sync_Log');
  setupSyncLogSheet(syncLogSheet);

  // Create Warehouse_Mapping sheet
  const warehouseMappingSheet = ss.insertSheet('Warehouse_Mapping');
  setupWarehouseMappingSheet(warehouseMappingSheet);

  // Create Brand_Mapping sheet
  const brandMappingSheet = ss.insertSheet('Brand_Mapping');
  setupBrandMappingSheet(brandMappingSheet);

  Logger.log('Control sheet setup complete!');
  Logger.log('Next steps:');
  Logger.log('1. Create 3 new Google Sheets: "Sensei - Products", "Sensei - Warehouse", "Sensei - Sales"');
  Logger.log('2. Copy their Sheet IDs into the Config sheet');
  Logger.log('3. Fill in warehouse mappings in Warehouse_Mapping sheet');
  Logger.log('4. Run setupAllDataSheets() to configure the data sheets');
  Logger.log('5. Add API credentials via Project Settings > Script Properties');
}

function setupAllDataSheets() {
  const config = getConfig();

  if (!config.products_sheet_id || !config.warehouse_sheet_id || !config.sales_sheet_id) {
    throw new Error('Please fill in all Sheet IDs in the Config sheet first!');
  }

  Logger.log('Setting up Products sheet...');
  setupRemoteSheet(config.products_sheet_id, 'products');

  Logger.log('Setting up Warehouse sheet...');
  setupRemoteSheet(config.warehouse_sheet_id, 'warehouse');

  Logger.log('Setting up Sales sheet...');
  setupRemoteSheet(config.sales_sheet_id, 'sales');

  Logger.log('All data sheets configured successfully!');
  Logger.log('Check the Products, Warehouse, and Sales sheets - they should now have headers and formatting.');
}

function setupRemoteSheet(sheetId, type) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheets()[0];

  if (type === 'products') {
    sheet.setName('Products');
    const headers = ['product_id', 'sku', 'name', 'brand', 'model', 'manufacturer', 'category', 'cost', 'price', 'active', 'last_updated'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.getRange(1, 1, 1, headers.length).setBackground('#34a853');
    sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
    sheet.setColumnWidth(1, 100);  // product_id
    sheet.setColumnWidth(2, 150);  // sku
    sheet.setColumnWidth(3, 300);  // name
    sheet.setColumnWidth(4, 120);  // brand
    sheet.setColumnWidth(5, 200);  // model
    sheet.setColumnWidth(6, 120);  // manufacturer
    sheet.setColumnWidth(7, 120);  // category
    sheet.setColumnWidth(8, 80);   // cost
    sheet.setColumnWidth(9, 80);   // price
    sheet.setColumnWidth(10, 70);  // active
    sheet.setColumnWidth(11, 160); // last_updated
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(2);
  }
  else if (type === 'warehouse') {
    sheet.setName('Warehouse_Documents');
    const headers = ['document_id', 'document_number', 'document_type', 'issue_date', 'warehouse_id', 'warehouse_name', 'product_id', 'sku', 'product_name', 'quantity', 'purchase_price_net', 'purchase_price_gross', 'purchase_tax', 'last_updated'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.getRange(1, 1, 1, headers.length).setBackground('#fbbc04');
    sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 150);
    sheet.setColumnWidth(3, 120);
    sheet.setColumnWidth(4, 100);
    sheet.setColumnWidth(5, 100);
    sheet.setColumnWidth(6, 150);
    sheet.setColumnWidth(7, 100);
    sheet.setColumnWidth(8, 150);
    sheet.setColumnWidth(9, 250);
    sheet.setColumnWidth(10, 80);
    sheet.setColumnWidth(11, 120);
    sheet.setColumnWidth(12, 130);
    sheet.setColumnWidth(13, 100);
    sheet.setColumnWidth(14, 160);
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(3);
  }
  else if (type === 'sales') {
    sheet.setName('Sales_Documents');
    const headers = [
      'document_id', 'document_number', 'document_type', 'sell_date', 'issue_date',
      'payment_type', 'channel', 'store_location', 'product_id', 'sku', 'product_name',
      'brand', 'model', 'color', 'size', 'quantity', 'net_price', 'discount_percent',
      'vat_rate', 'warehouse_doc_id', 'actual_cost_net',
      'margin_pln', 'margin_percent', 'cost_available', 'last_updated'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.getRange(1, 1, 1, headers.length).setBackground('#ea4335');
    sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');

    // Set column widths
    sheet.setColumnWidth(1, 100);  // document_id
    sheet.setColumnWidth(2, 150);  // document_number
    sheet.setColumnWidth(3, 120);  // document_type
    sheet.setColumnWidth(4, 100);  // sell_date
    sheet.setColumnWidth(5, 100);  // issue_date
    sheet.setColumnWidth(6, 120);  // payment_type
    sheet.setColumnWidth(7, 80);   // channel
    sheet.setColumnWidth(8, 120);  // store_location
    sheet.setColumnWidth(9, 100);  // product_id
    sheet.setColumnWidth(10, 150); // sku
    sheet.setColumnWidth(11, 250); // product_name
    sheet.setColumnWidth(12, 120); // brand
    sheet.setColumnWidth(13, 200); // model
    sheet.setColumnWidth(14, 100); // color
    sheet.setColumnWidth(15, 70);  // size
    sheet.setColumnWidth(16, 80);  // quantity
    sheet.setColumnWidth(17, 110); // net_price
    sheet.setColumnWidth(18, 120); // discount_percent
    sheet.setColumnWidth(19, 70);  // vat_rate
    sheet.setColumnWidth(20, 130); // warehouse_doc_id
    sheet.setColumnWidth(21, 120); // actual_cost_net
    sheet.setColumnWidth(22, 100); // margin_pln
    sheet.setColumnWidth(23, 110); // margin_percent
    sheet.setColumnWidth(24, 110); // cost_available
    sheet.setColumnWidth(25, 160); // last_updated

    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(3);
  }
}

function setupConfigSheet(sheet) {
  // Clear existing content
  sheet.clear();

  // Set headers
  sheet.getRange('A1:B1').setValues([['Key', 'Value']]);
  sheet.getRange('A1:B1').setFontWeight('bold');
  sheet.getRange('A1:B1').setBackground('#4285f4');
  sheet.getRange('A1:B1').setFontColor('#ffffff');

  // Add configuration rows
  const configData = [
    ['products_sheet_id', ''],
    ['warehouse_sheet_id', ''],
    ['sales_sheet_id', ''],
    ['', ''],
    ['last_sync_products', ''],
    ['last_sync_warehouse', ''],
    ['last_sync_sales', ''],
    ['', ''],
    ['initial_load_complete', 'false'],
    ['sync_enabled', 'true']
  ];

  sheet.getRange(2, 1, configData.length, 2).setValues(configData);

  // Format
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 400);
  sheet.setFrozenRows(1);

  // Add instructions
  sheet.getRange('D1').setValue('Instructions:');
  sheet.getRange('D1').setFontWeight('bold');
  sheet.getRange('D2').setValue('1. Create three new Google Sheets');
  sheet.getRange('D3').setValue('2. Name them: "Sensei - Products", "Sensei - Warehouse", "Sensei - Sales"');
  sheet.getRange('D4').setValue('3. Copy each Sheet ID from the URL into the config above');
  sheet.getRange('D5').setValue('4. Run setupScriptProperties() to add API credentials');
}

function setupSyncLogSheet(sheet) {
  // Set headers
  const headers = [
    'Timestamp',
    'Endpoint',
    'Records Pulled',
    'Records New',
    'Records Updated',
    'Status',
    'Error Message',
    'Duration (seconds)'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#4285f4');
  sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');

  // Format columns
  sheet.setColumnWidth(1, 160); // Timestamp
  sheet.setColumnWidth(2, 120); // Endpoint
  sheet.setColumnWidth(3, 120); // Records Pulled
  sheet.setColumnWidth(4, 110); // Records New
  sheet.setColumnWidth(5, 130); // Records Updated
  sheet.setColumnWidth(6, 80);  // Status
  sheet.setColumnWidth(7, 300); // Error Message
  sheet.setColumnWidth(8, 130); // Duration

  sheet.setFrozenRows(1);
}

function setupWarehouseMappingSheet(sheet) {
  // Set headers
  const headers = ['warehouse_id', 'warehouse_name', 'display_name'];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#ff9900');
  sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');

  // Add example data
  const exampleData = [
    [122717, 'Warszawa magazyn', 'Warszawa - Kępna 17A'],
    [128475, 'Wrocław magazyn', 'Wrocław - Kościuszki 147']
  ];

  sheet.getRange(2, 1, exampleData.length, 3).setValues(exampleData);

  // Format columns
  sheet.setColumnWidth(1, 120); // warehouse_id
  sheet.setColumnWidth(2, 180); // warehouse_name
  sheet.setColumnWidth(3, 220); // display_name

  sheet.setFrozenRows(1);
}

function setupBrandMappingSheet(sheet) {
  // Set headers
  const headers = ['brand_name', 'display_name'];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#9c27b0');
  sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');

  // Format columns
  sheet.setColumnWidth(1, 200); // brand_name
  sheet.setColumnWidth(2, 150); // display_name

  sheet.setFrozenRows(1);

  // Add example data
  const exampleData = [
    ['Xero Shoes', 'Xero'],
    ['Koel Barefoot', 'Koel'],
    ['Vivobarefoot', 'Vivobarefoot']
  ];
  sheet.getRange(2, 1, exampleData.length, 2).setValues(exampleData);

  // Add instructions
  sheet.getRange('D1').setValue('Instructions:');
  sheet.getRange('D1').setFontWeight('bold');
  sheet.getRange('D2').setValue('brand_name: Text to match in product names (e.g., "Xero Shoes")');
  sheet.getRange('D3').setValue('display_name: Short name to use in reports (e.g., "Xero")');
  sheet.getRange('D4').setValue('Order matters: longer/more specific brand names should come first');
}

function getConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName('Config');

  if (!configSheet) {
    throw new Error('Config sheet not found. Run setupControlSheet() first.');
  }

  const data = configSheet.getRange('A2:B20').getValues();
  const config = {};

  data.forEach(row => {
    if (row[0]) {
      config[row[0]] = row[1];
    }
  });

  return config;
}

function setConfig(key, value) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName('Config');

  if (!configSheet) {
    throw new Error('Config sheet not found.');
  }

  const data = configSheet.getRange('A2:B20').getValues();

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === key) {
      configSheet.getRange(i + 2, 2).setValue(value);
      return;
    }
  }

  // If key not found, append it
  const lastRow = configSheet.getLastRow();
  configSheet.getRange(lastRow + 1, 1, 1, 2).setValues([[key, value]]);
}

function getBrandMapping() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const brandMappingSheet = ss.getSheetByName('Brand_Mapping');

  if (!brandMappingSheet) {
    throw new Error('Brand_Mapping sheet not found. Run setupControlSheet() first.');
  }

  const lastRow = brandMappingSheet.getLastRow();
  if (lastRow <= 1) {
    return [];
  }

  const data = brandMappingSheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const brands = data
    .filter(row => row[0] && row[0].trim().length > 0)
    .map(row => ({
      matchName: row[0].trim(),
      displayName: row[1] ? row[1].trim() : row[0].trim()
    }));

  return brands;
}

function parseBrandFromProductName(productName, brands) {
  if (!productName || !brands || brands.length === 0) {
    return '';
  }

  for (const brand of brands) {
    if (productName.startsWith(brand.matchName)) {
      return brand.displayName;
    }
  }

  return '';
}

function logSync(timestamp, endpoint, recordsPulled, recordsNew, recordsUpdated, status, errorMessage, durationSeconds) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = ss.getSheetByName('Sync_Log');

  if (!logSheet) {
    throw new Error('Sync_Log sheet not found.');
  }

  const row = [
    timestamp,
    endpoint,
    recordsPulled,
    recordsNew,
    recordsUpdated,
    status,
    errorMessage || '',
    durationSeconds
  ];

  logSheet.appendRow(row);

  // Color code status
  const lastRow = logSheet.getLastRow();
  const statusCell = logSheet.getRange(lastRow, 6);

  if (status === 'success') {
    statusCell.setBackground('#d9ead3');
  } else if (status === 'failed') {
    statusCell.setBackground('#f4cccc');
  } else {
    statusCell.setBackground('#fff2cc');
  }
}

function getWarehouseMapping() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mappingSheet = ss.getSheetByName('Warehouse_Mapping');

  if (!mappingSheet) {
    throw new Error('Warehouse_Mapping sheet not found. Run setupControlSheet() first.');
  }

  const lastRow = mappingSheet.getLastRow();
  if (lastRow <= 1) {
    return {}; // Empty mapping if no data
  }

  const data = mappingSheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const mapping = {};

  data.forEach(row => {
    const warehouseId = row[0];
    const warehouseName = row[1];
    if (warehouseId) {
      mapping[warehouseId] = warehouseName;
    }
  });

  return mapping;
}

/**
 * Helper function to add Warehouse_Mapping sheet to existing Control sheet
 * Run this if you already have a Control sheet but need to add the mapping
 */
function addWarehouseMappingSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Check if it already exists
  const existing = ss.getSheetByName('Warehouse_Mapping');
  if (existing) {
    Logger.log('Warehouse_Mapping sheet already exists!');
    return;
  }

  const mappingSheet = ss.insertSheet('Warehouse_Mapping');
  setupWarehouseMappingSheet(mappingSheet);

  Logger.log('Warehouse_Mapping sheet created successfully!');
  Logger.log('Fill in your warehouse IDs and names in the sheet.');
}
