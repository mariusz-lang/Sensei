/**
 * Add brand column to Sales and Products sheets and populate from existing data
 * Run this once to migrate existing data to new structure
 */

function addBrandColumnToSales() {
  const config = getConfig();
  const salesSheetId = config.sales_sheet_id;

  if (!salesSheetId) {
    throw new Error('Sales sheet ID not configured');
  }

  Logger.log('Loading brand mapping...');
  const brands = getBrandMapping();
  Logger.log(`Loaded ${brands.length} brands`);

  const ss = SpreadsheetApp.openById(salesSheetId);
  const sheet = ss.getSheetByName('Sales_Documents');

  if (!sheet) {
    throw new Error('Sales_Documents sheet not found');
  }

  // Insert brand column after product_name (column 12)
  Logger.log('Inserting brand column at position 12...');
  sheet.insertColumnAfter(11);

  // Update header
  sheet.getRange(1, 12).setValue('brand');
  sheet.getRange(1, 12).setFontWeight('bold');
  sheet.getRange(1, 12).setBackground('#ea4335');
  sheet.getRange(1, 12).setFontColor('#ffffff');
  sheet.setColumnWidth(12, 120);

  // Get all product names (column 11)
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('No data to process');
    return;
  }

  Logger.log(`Processing ${lastRow - 1} rows...`);

  const productNames = sheet.getRange(2, 11, lastRow - 1, 1).getValues();
  const brandValues = productNames.map(row => {
    const productName = row[0] || '';
    const brand = parseBrandFromProductName(productName, brands);
    return [brand];
  });

  // Write brand values
  Logger.log('Writing brand values...');
  sheet.getRange(2, 12, brandValues.length, 1).setValues(brandValues);

  Logger.log('Done! Brand column added and populated.');
  Logger.log(`New structure has ${sheet.getLastColumn()} columns`);
}

function addBrandColumnToProducts() {
  const config = getConfig();
  const productsSheetId = config.products_sheet_id;

  if (!productsSheetId) {
    throw new Error('Products sheet ID not configured');
  }

  Logger.log('Loading brand mapping...');
  const brands = getBrandMapping();
  Logger.log(`Loaded ${brands.length} brands`);

  const ss = SpreadsheetApp.openById(productsSheetId);
  const sheet = ss.getSheetByName('Products');

  if (!sheet) {
    throw new Error('Products sheet not found');
  }

  // Current structure: product_id, sku, name, brand, category, cost, price, active, last_updated (9 cols)
  // We need: product_id, sku, name, brand, model, manufacturer, category, cost, price, active, last_updated (11 cols)

  // Check if brand column already exists
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.includes('brand')) {
    Logger.log('Brand column already exists in Products sheet');
    return;
  }

  // Insert brand column after name (column 4)
  Logger.log('Inserting brand column at position 4...');
  sheet.insertColumnAfter(3);

  // Insert model column after brand (column 5)
  Logger.log('Inserting model column at position 5...');
  sheet.insertColumnAfter(4);

  // Update headers
  sheet.getRange(1, 4).setValue('brand');
  sheet.getRange(1, 4).setFontWeight('bold');
  sheet.getRange(1, 4).setBackground('#34a853');
  sheet.getRange(1, 4).setFontColor('#ffffff');
  sheet.setColumnWidth(4, 120);

  sheet.getRange(1, 5).setValue('model');
  sheet.getRange(1, 5).setFontWeight('bold');
  sheet.getRange(1, 5).setBackground('#34a853');
  sheet.getRange(1, 5).setFontColor('#ffffff');
  sheet.setColumnWidth(5, 200);

  // Get all product names (column 3)
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('No data to process');
    return;
  }

  Logger.log(`Processing ${lastRow - 1} rows...`);

  const productNames = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
  const brandModelValues = productNames.map(row => {
    const productName = row[0] || '';
    const brand = parseBrandFromProductName(productName, brands);
    const model = brand ? productName.substring(brand.length).trim().replace(/^-\s*/, '') : productName;
    return [brand, model];
  });

  // Write brand and model values
  Logger.log('Writing brand and model values...');
  sheet.getRange(2, 4, brandModelValues.length, 2).setValues(brandModelValues);

  Logger.log('Done! Brand and model columns added and populated.');
  Logger.log(`New structure has ${sheet.getLastColumn()} columns`);
}

function addBrandColumnToBothSheets() {
  Logger.log('=== Adding brand columns to both sheets ===');

  Logger.log('\n1. Processing Products sheet...');
  addBrandColumnToProducts();

  Logger.log('\n2. Processing Sales sheet...');
  addBrandColumnToSales();

  Logger.log('\n=== Migration complete! ===');
}
