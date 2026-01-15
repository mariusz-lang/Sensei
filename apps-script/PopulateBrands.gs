/**
 * One-time script to populate brand column in Sales sheet
 * Run this after manually adding brand column at position 12
 */

function populateBrandsInSales() {
  const config = getConfig();
  const salesSheetId = config.sales_sheet_id;

  if (!salesSheetId) {
    throw new Error('Sales sheet ID not configured');
  }

  Logger.log('Loading brand mapping...');
  const brands = getBrandMapping();
  const brandList = brands.map(b => `"${b.matchName}" → "${b.displayName}"`).join(', ');
  Logger.log(`Loaded ${brands.length} brands: ${brandList}`);

  const ss = SpreadsheetApp.openById(salesSheetId);
  const sheet = ss.getSheetByName('Sales_Documents');

  if (!sheet) {
    throw new Error('Sales_Documents sheet not found');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('No data to process');
    return;
  }

  Logger.log(`Processing ${lastRow - 1} rows...`);

  // Get all product names (column 11)
  const productNames = sheet.getRange(2, 11, lastRow - 1, 1).getValues();

  // Parse brands
  const brandValues = productNames.map(row => {
    const productName = row[0] || '';
    const brand = parseBrandFromProductName(productName, brands);
    return [brand];
  });

  // Write brand values to column 12
  Logger.log('Writing brand values to column 12...');
  sheet.getRange(2, 12, brandValues.length, 1).setValues(brandValues);

  // Count populated brands
  const populatedCount = brandValues.filter(row => row[0]).length;
  Logger.log(`Done! Populated ${populatedCount} brands out of ${brandValues.length} rows`);
}

function populateBrandsInProducts() {
  const config = getConfig();
  const productsSheetId = config.products_sheet_id;

  if (!productsSheetId) {
    throw new Error('Products sheet ID not configured');
  }

  Logger.log('Loading brand mapping...');
  const brands = getBrandMapping();
  const brandList = brands.map(b => `"${b.matchName}" → "${b.displayName}"`).join(', ');
  Logger.log(`Loaded ${brands.length} brands: ${brandList}`);

  const ss = SpreadsheetApp.openById(productsSheetId);
  const sheet = ss.getSheetByName('Products');

  if (!sheet) {
    throw new Error('Products sheet not found');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('No data to process');
    return;
  }

  Logger.log(`Processing ${lastRow - 1} rows...`);

  // Get all product names (column 3)
  const productNames = sheet.getRange(2, 3, lastRow - 1, 1).getValues();

  // Parse brands and models
  const brandModelValues = productNames.map(row => {
    const productName = row[0] || '';
    const brand = parseBrandFromProductName(productName, brands);
    const model = brand ? productName.substring(brand.length).trim().replace(/^-\s*/, '') : productName;
    return [brand, model];
  });

  // Write to brand column (4) and model column (5)
  Logger.log('Writing brand values to column 4 and model values to column 5...');
  sheet.getRange(2, 4, brandModelValues.length, 2).setValues(brandModelValues);

  // Count populated brands
  const populatedCount = brandModelValues.filter(row => row[0]).length;
  Logger.log(`Done! Populated ${populatedCount} brands out of ${brandModelValues.length} rows`);
}
