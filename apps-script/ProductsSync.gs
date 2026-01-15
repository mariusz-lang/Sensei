/**
 * Sensei - Products Sync
 * Syncs products from Fakturownia API to Products sheet
 */

function syncProducts() {
  const startTime = new Date();
  const config = getConfig();
  const props = PropertiesService.getScriptProperties();
  const domain = props.getProperty('FAKTUROWNIA_DOMAIN');
  const apiToken = props.getProperty('FAKTUROWNIA_API_TOKEN');

  if (!domain || !apiToken) {
    throw new Error('API credentials not configured. Run setupScriptProperties() first.');
  }

  if (!config.products_sheet_id) {
    throw new Error('Products sheet ID not configured in Config sheet.');
  }

  Logger.log('Starting products sync...');

  try {
    const brands = getBrandMapping();
    Logger.log(`Loaded ${brands.length} brands from mapping`);

    const products = fetchAllProducts(domain, apiToken);
    Logger.log(`Fetched ${products.length} products from API`);

    const result = upsertProducts(config.products_sheet_id, products, brands);
    Logger.log(`Upsert complete: ${result.new} new, ${result.updated} updated`);

    const duration = (new Date() - startTime) / 1000;
    setConfig('last_sync_products', startTime.toISOString());
    logSync(startTime, 'products', products.length, result.new, result.updated, 'success', null, duration);

    Logger.log(`Products sync completed successfully in ${duration}s`);
    return result;

  } catch (error) {
    const duration = (new Date() - startTime) / 1000;
    logSync(startTime, 'products', 0, 0, 0, 'failed', error.message, duration);
    throw error;
  }
}

function fetchAllProducts(domain, apiToken) {
  const allProducts = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `https://${domain}.fakturownia.pl/products.json?api_token=${apiToken}&page=${page}&per_page=${perPage}`;

    Logger.log(`Fetching page ${page}...`);

    const response = withRetry(() => {
      return UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true
      });
    });

    if (response.getResponseCode() !== 200) {
      throw new Error(`API error: ${response.getResponseCode()} - ${response.getContentText()}`);
    }

    const products = JSON.parse(response.getContentText());

    if (!Array.isArray(products) || products.length === 0) {
      break;
    }

    allProducts.push(...products);

    if (products.length < perPage) {
      break;
    }

    page++;
  }

  return allProducts;
}

function upsertProducts(sheetId, products, brands) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName('Products');

  if (!sheet) {
    throw new Error('Products sheet not found');
  }

  // Get existing data
  const lastRow = sheet.getLastRow();
  const existingData = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 10).getValues() : [];

  // Build map of existing products (product_id -> row index)
  const existingMap = {};
  existingData.forEach((row, idx) => {
    if (row[0]) { // product_id is in column 0
      existingMap[row[0]] = idx + 2; // +2 because: 0-indexed array + 1 for header row + 1 for actual row
    }
  });

  let newCount = 0;
  let updatedCount = 0;
  const now = new Date().toISOString();

  const newRows = [];
  const updateOperations = [];

  // Process each product
  products.forEach(product => {
    const productName = product.name || '';
    const brand = parseBrandFromProductName(productName, brands);
    const model = brand ? productName.substring(brand.length).trim().replace(/^-\s*/, '') : productName;

    const row = [
      product.id,
      product.code || '',
      product.name || '',
      brand,
      model,
      product.manufacturer || '',
      product.category_name || '',
      parseFloat(product.purchase_price_net || 0),
      parseFloat(product.price_gross || 0),
      product.available === true || product.available === 1 ? 'TRUE' : 'FALSE',
      now
    ];

    const existingRowNum = existingMap[product.id];

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
      sheet.getRange(op.rowNum, 1, 1, 11).setValues([op.data]);
    });
  }

  // Batch append new rows
  if (newRows.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, 11).setValues(newRows);
  }

  return { new: newCount, updated: updatedCount };
}

function withRetry(fn, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (error) {
      lastError = error;

      const message = error.message || '';
      const isRetryable = message.indexOf('429') >= 0 ||
                         message.indexOf('500') >= 0 ||
                         message.indexOf('502') >= 0 ||
                         message.indexOf('503') >= 0 ||
                         message.indexOf('timeout') >= 0;

      if (isRetryable && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        Logger.log(`Retry ${attempt}/${maxRetries} after ${delay}ms`);
        Utilities.sleep(delay);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

/**
 * Test function - sync a small sample of products
 * @param {number} count - Number of products to fetch (default: 10)
 */
function testProductsSync(count = 10) {
  const startTime = new Date();
  const config = getConfig();
  const props = PropertiesService.getScriptProperties();
  const domain = props.getProperty('FAKTUROWNIA_DOMAIN');
  const apiToken = props.getProperty('FAKTUROWNIA_API_TOKEN');

  Logger.log(`TEST MODE: Fetching ${count} products`);

  try {
    const brands = getBrandMapping();
    Logger.log(`Loaded ${brands.length} brands from mapping`);

    const allProducts = [];
    const perPage = 100;
    let page = 1;

    // Fetch pages until we have enough products
    while (allProducts.length < count) {
      const url = `https://${domain}.fakturownia.pl/products.json?api_token=${apiToken}&page=${page}&per_page=${perPage}`;

      const response = UrlFetchApp.fetch(url, {
        method: 'get',
        muteHttpExceptions: true
      });

      if (response.getResponseCode() !== 200) {
        throw new Error(`API error: ${response.getResponseCode()}`);
      }

      const products = JSON.parse(response.getContentText());

      if (!Array.isArray(products) || products.length === 0) {
        break;
      }

      allProducts.push(...products);
      page++;

      if (products.length < perPage) {
        break;
      }
    }

    // Trim to exact count
    const productsToSync = allProducts.slice(0, count);
    Logger.log(`Fetched ${productsToSync.length} test products`);

    const result = upsertProducts(config.products_sheet_id, productsToSync, brands);
    Logger.log(`Test upsert complete: ${result.new} new, ${result.updated} updated`);

    const duration = (new Date() - startTime) / 1000;
    Logger.log(`Test completed successfully in ${duration}s`);

    return {
      success: true,
      products: productsToSync.length,
      new: result.new,
      updated: result.updated
    };

  } catch (error) {
    Logger.log(`Test failed: ${error.message}`);
    throw error;
  }
}
