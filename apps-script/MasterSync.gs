/**
 * Sensei - Master Sync
 * Orchestrates all sync operations in the correct order
 * Order: Products -> Warehouse -> Sales (ensures warehouse data exists for margin calculations)
 */

/**
 * Main sync function - runs all syncs in correct order
 * This should be the function called by the daily trigger
 */
function syncAll() {
  const startTime = new Date();
  Logger.log('=== MASTER SYNC STARTED ===');
  Logger.log(`Start time: ${startTime.toISOString()}`);

  const results = {
    products: null,
    warehouse: null,
    sales: null,
    success: true,
    errors: []
  };

  try {
    // 1. Sync Products
    Logger.log('\n--- Step 1: Syncing Products ---');
    try {
      results.products = syncProducts();
      Logger.log(`Products sync: ${results.products.new} new, ${results.products.updated} updated`);
    } catch (error) {
      Logger.log(`ERROR in products sync: ${error.message}`);
      results.errors.push(`Products: ${error.message}`);
      results.success = false;
    }

    // 2. Sync Warehouse (critical for margin calculations)
    Logger.log('\n--- Step 2: Syncing Warehouse Documents ---');
    try {
      results.warehouse = syncWarehouse();
      Logger.log(`Warehouse sync: ${results.warehouse.new} new, ${results.warehouse.updated} updated`);
    } catch (error) {
      Logger.log(`ERROR in warehouse sync: ${error.message}`);
      results.errors.push(`Warehouse: ${error.message}`);
      results.success = false;
      // Don't continue to sales if warehouse fails (no cost data for margins)
      throw new Error('Warehouse sync failed - aborting sales sync');
    }

    // 3. Sync Sales (depends on warehouse data)
    Logger.log('\n--- Step 3: Syncing Sales Documents ---');
    try {
      results.sales = syncSales();
      Logger.log(`Sales sync: ${results.sales.new} new, ${results.sales.updated} updated`);
    } catch (error) {
      Logger.log(`ERROR in sales sync: ${error.message}`);
      results.errors.push(`Sales: ${error.message}`);
      results.success = false;
    }

  } catch (error) {
    Logger.log(`\nFATAL ERROR: ${error.message}`);
    results.success = false;
  }

  const duration = (new Date() - startTime) / 1000;
  Logger.log(`\n=== MASTER SYNC COMPLETED ===`);
  Logger.log(`Duration: ${duration}s`);
  Logger.log(`Status: ${results.success ? 'SUCCESS' : 'FAILED'}`);

  if (results.errors.length > 0) {
    Logger.log(`Errors: ${results.errors.join(', ')}`);
  }

  return results;
}

/**
 * Test function - runs master sync with limited data
 * @param {number} productCount - Number of products to sync (default: 200)
 * @param {number} warehouseCount - Number of warehouse docs to sync (default: 200)
 * @param {number} salesCount - Number of sales docs to sync (default: 200)
 */
function testMasterSync(productCount = 200, warehouseCount = 200, salesCount = 200) {
  const startTime = new Date();
  Logger.log('=== TEST MASTER SYNC STARTED ===');
  Logger.log(`Syncing: ${productCount} products, ${warehouseCount} warehouse docs, ${salesCount} sales docs`);

  const results = {
    products: null,
    warehouse: null,
    sales: null,
    success: true,
    errors: []
  };

  try {
    // 1. Test Products Sync
    Logger.log(`\n--- Step 1: Testing Products Sync (${productCount} products) ---`);
    try {
      results.products = testProductsSync(productCount);
      Logger.log(`Products: ${results.products.new} new, ${results.products.updated} updated`);
    } catch (error) {
      Logger.log(`ERROR: ${error.message}`);
      results.errors.push(`Products: ${error.message}`);
      results.success = false;
    }

    // 2. Test Warehouse Sync
    Logger.log(`\n--- Step 2: Testing Warehouse Sync (${warehouseCount} documents) ---`);
    try {
      results.warehouse = testWarehouseSync(warehouseCount);
      Logger.log(`Warehouse: ${results.warehouse.new} new, ${results.warehouse.updated} updated`);
      Logger.log(`Warehouse rows created: ${results.warehouse.rows}`);
    } catch (error) {
      Logger.log(`ERROR: ${error.message}`);
      results.errors.push(`Warehouse: ${error.message}`);
      results.success = false;
      throw new Error('Warehouse sync failed - aborting sales sync');
    }

    // 3. Test Sales Sync
    Logger.log(`\n--- Step 3: Testing Sales Sync (${salesCount} documents) ---`);
    try {
      results.sales = testSalesSync(salesCount);
      Logger.log(`Sales: ${results.sales.new} new, ${results.sales.updated} updated`);
    } catch (error) {
      Logger.log(`ERROR: ${error.message}`);
      results.errors.push(`Sales: ${error.message}`);
      results.success = false;
    }

  } catch (error) {
    Logger.log(`\nFATAL ERROR: ${error.message}`);
    results.success = false;
  }

  const duration = (new Date() - startTime) / 1000;
  Logger.log(`\n=== TEST MASTER SYNC COMPLETED ===`);
  Logger.log(`Duration: ${duration}s (${Math.round(duration / 60)} minutes)`);
  Logger.log(`Status: ${results.success ? 'SUCCESS' : 'FAILED'}`);

  if (results.errors.length > 0) {
    Logger.log(`Errors: ${results.errors.join(', ')}`);
  }

  return results;
}
