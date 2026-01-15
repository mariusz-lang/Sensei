/**
 * Sensei - Unified Automatic Sync
 * Single self-triggering system that syncs both warehouse and sales in alternating batches
 * Run startUnifiedAutoSync() once and it handles everything automatically
 */

/**
 * Start unified automatic sync
 * Alternates between warehouse and sales batches until both are complete
 * Run this once and forget - it will complete overnight
 */
function startUnifiedAutoSync() {
  const props = PropertiesService.getScriptProperties();

  // Check if auto-sync is already running
  const isRunning = props.getProperty('unified_auto_sync_running');
  if (isRunning === 'true') {
    Logger.log('Unified auto sync is already running!');
    Logger.log('Run checkUnifiedSyncStatus() to see progress');
    Logger.log('Run stopUnifiedAutoSync() to stop');
    return;
  }

  // Initialize sync state
  props.setProperty('unified_auto_sync_running', 'true');
  props.setProperty('unified_auto_sync_started', new Date().toISOString());
  props.setProperty('unified_sync_mode', 'warehouse'); // Start with warehouse
  props.setProperty('unified_batch_count', '0');

  // Delete existing triggers to avoid duplicates
  deleteAllTriggersForFunction('runUnifiedAutoBatch');

  // Create trigger to run every 5 minutes
  ScriptApp.newTrigger('runUnifiedAutoBatch')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('=== UNIFIED AUTO SYNC STARTED ===');
  Logger.log('Strategy: Alternating batches (Warehouse → Sales → Warehouse → Sales...)');
  Logger.log('Batch size: 2000 documents per batch');
  Logger.log('Frequency: Every 5 minutes');
  Logger.log('');
  Logger.log('Estimated totals:');
  Logger.log('  - Warehouse: ~43,000 docs (22 batches)');
  Logger.log('  - Sales: ~40,000 docs (20 batches)');
  Logger.log('  - Total batches: ~42 batches × 5 min = ~210 minutes (3.5 hours)');
  Logger.log('');
  Logger.log('Monitor with: checkUnifiedSyncStatus()');
  Logger.log('Stop with: stopUnifiedAutoSync()');

  // Run first batch immediately
  runUnifiedAutoBatch();
}

/**
 * Run one batch of unified sync (called by trigger)
 * Alternates between warehouse and sales automatically
 */
function runUnifiedAutoBatch() {
  const props = PropertiesService.getScriptProperties();

  // Check if we should still be running
  const isRunning = props.getProperty('unified_auto_sync_running');
  if (isRunning !== 'true') {
    Logger.log('Unified auto sync stopped by user');
    deleteAllTriggersForFunction('runUnifiedAutoBatch');
    return;
  }

  const currentMode = props.getProperty('unified_sync_mode') || 'warehouse';
  const batchCount = parseInt(props.getProperty('unified_batch_count') || '0');

  Logger.log(`\n=== UNIFIED AUTO BATCH #${batchCount + 1} ===`);
  Logger.log(`Mode: ${currentMode.toUpperCase()}`);

  try {
    let result;
    let switchMode = false;

    if (currentMode === 'warehouse') {
      // Run warehouse batch
      result = syncWarehouseBatchV2(2000);

      Logger.log(`Warehouse batch: ${result.synced} docs synced`);
      Logger.log(`Total warehouse synced: ${result.totalSynced}`);

      if (result.complete) {
        Logger.log('✓ Warehouse sync COMPLETE');
        switchMode = true; // Switch to sales
      } else {
        // Alternate to sales for next batch
        switchMode = true;
      }

    } else if (currentMode === 'sales') {
      // Run sales batch
      result = syncSalesBatchV2(2000);

      Logger.log(`Sales batch: ${result.synced} docs synced`);
      Logger.log(`Total sales synced: ${result.totalSynced}`);

      if (result.complete) {
        Logger.log('✓ Sales sync COMPLETE');
        switchMode = true; // Switch back to warehouse
      } else {
        // Alternate to warehouse for next batch
        switchMode = true;
      }
    }

    // Increment batch counter
    props.setProperty('unified_batch_count', (batchCount + 1).toString());

    // Check if both are complete
    const warehouseCursor = props.getProperty('warehouse_sync_cursor');
    const salesCursor = props.getProperty('sales_sync_cursor');

    if (!warehouseCursor && !salesCursor) {
      // Both syncs are complete!
      Logger.log('\n=== ALL SYNCS COMPLETE ===');
      const config = getConfig();
      const warehouseIds = getExistingWarehouseDocumentIds(config.warehouse_sheet_id);
      const salesIds = getExistingSalesDocumentIds(config.sales_sheet_id);

      Logger.log(`Total warehouse documents: ${warehouseIds.size}`);
      Logger.log(`Total sales documents: ${salesIds.size}`);

      const startTime = props.getProperty('unified_auto_sync_started');
      const duration = (new Date() - new Date(startTime)) / 1000 / 60; // minutes
      Logger.log(`Total duration: ${Math.round(duration)} minutes (${(duration / 60).toFixed(1)} hours)`);
      Logger.log(`Total batches: ${batchCount + 1}`);

      stopUnifiedAutoSync();
      return;
    }

    // Switch mode for next batch (alternate between warehouse and sales)
    if (switchMode) {
      const nextMode = currentMode === 'warehouse' ? 'sales' : 'warehouse';
      props.setProperty('unified_sync_mode', nextMode);
      Logger.log(`Next batch will be: ${nextMode.toUpperCase()}`);
    }

  } catch (error) {
    Logger.log(`ERROR in unified batch: ${error.message}`);
    Logger.log('Stack trace: ' + error.stack);
    // Don't stop on error - will retry in 5 minutes
  }
}

/**
 * Stop unified automatic sync
 */
function stopUnifiedAutoSync() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('unified_auto_sync_running', 'false');

  // Delete all triggers
  deleteAllTriggersForFunction('runUnifiedAutoBatch');

  Logger.log('=== UNIFIED AUTO SYNC STOPPED ===');
}

/**
 * Check status of unified automatic sync
 */
function checkUnifiedSyncStatus() {
  const props = PropertiesService.getScriptProperties();
  const config = getConfig();

  Logger.log('=== UNIFIED AUTO SYNC STATUS ===');

  // Overall status
  const isRunning = props.getProperty('unified_auto_sync_running') === 'true';
  const startTime = props.getProperty('unified_auto_sync_started');
  const currentMode = props.getProperty('unified_sync_mode') || 'warehouse';
  const batchCount = parseInt(props.getProperty('unified_batch_count') || '0');

  Logger.log(`\nOverall Status: ${isRunning ? 'RUNNING' : 'STOPPED'}`);
  if (startTime) {
    Logger.log(`Started: ${startTime}`);
    const elapsed = (new Date() - new Date(startTime)) / 1000 / 60;
    Logger.log(`Elapsed: ${Math.round(elapsed)} minutes (${(elapsed / 60).toFixed(1)} hours)`);
  }
  Logger.log(`Batches completed: ${batchCount}`);
  Logger.log(`Current mode: ${currentMode.toUpperCase()}`);

  // Warehouse progress
  const warehouseCursor = props.getProperty('warehouse_sync_cursor');
  const warehouseIds = getExistingWarehouseDocumentIds(config.warehouse_sheet_id);

  Logger.log(`\nWarehouse Documents:`);
  Logger.log(`  Synced: ${warehouseIds.size}`);
  Logger.log(`  Status: ${warehouseCursor ? `In progress (page ${warehouseCursor})` : 'COMPLETE'}`);
  if (warehouseCursor) {
    const progress = (warehouseIds.size / 43696) * 100;
    Logger.log(`  Progress: ~${progress.toFixed(1)}%`);
  }

  // Sales progress
  const salesCursor = props.getProperty('sales_sync_cursor');
  const salesIds = getExistingSalesDocumentIds(config.sales_sheet_id);

  Logger.log(`\nSales Documents:`);
  Logger.log(`  Synced: ${salesIds.size}`);
  Logger.log(`  Status: ${salesCursor ? `In progress (page ${salesCursor})` : 'COMPLETE'}`);
  if (salesCursor) {
    const progress = (salesIds.size / 40000) * 100;
    Logger.log(`  Progress: ~${progress.toFixed(1)}%`);
  }

  // Active triggers
  const triggers = ScriptApp.getProjectTriggers();
  const activeTriggers = triggers.filter(t => t.getHandlerFunction() === 'runUnifiedAutoBatch');

  Logger.log(`\nActive triggers: ${activeTriggers.length}`);

  // Estimates
  if (isRunning) {
    const remainingWarehouse = warehouseCursor ? Math.ceil((43696 - warehouseIds.size) / 2000) : 0;
    const remainingSales = salesCursor ? Math.ceil((40000 - salesIds.size) / 2000) : 0;
    const totalRemaining = remainingWarehouse + remainingSales;
    const estimatedMinutes = totalRemaining * 5;

    Logger.log(`\nEstimated remaining:`);
    Logger.log(`  Warehouse batches: ${remainingWarehouse}`);
    Logger.log(`  Sales batches: ${remainingSales}`);
    Logger.log(`  Total time: ~${estimatedMinutes} minutes (${(estimatedMinutes / 60).toFixed(1)} hours)`);
  }

  return {
    running: isRunning,
    batchCount: batchCount,
    currentMode: currentMode,
    warehouse: {
      synced: warehouseIds.size,
      complete: !warehouseCursor,
      cursor: warehouseCursor
    },
    sales: {
      synced: salesIds.size,
      complete: !salesCursor,
      cursor: salesCursor
    },
    triggers: activeTriggers.length
  };
}

/**
 * Reset unified sync completely (use if you want to start over)
 */
function resetUnifiedSync() {
  const props = PropertiesService.getScriptProperties();

  // Stop if running
  stopUnifiedAutoSync();

  // Reset all sync state
  props.deleteProperty('unified_auto_sync_running');
  props.deleteProperty('unified_auto_sync_started');
  props.deleteProperty('unified_sync_mode');
  props.deleteProperty('unified_batch_count');
  props.deleteProperty('warehouse_sync_cursor');
  props.deleteProperty('sales_sync_cursor');

  Logger.log('=== UNIFIED SYNC RESET ===');
  Logger.log('All state cleared. Ready for fresh start.');
  Logger.log('Run startUnifiedAutoSync() to begin.');
}

/**
 * Helper: Delete all triggers for a specific function
 */
function deleteAllTriggersForFunction(functionName) {
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
      deletedCount++;
    }
  });

  if (deletedCount > 0) {
    Logger.log(`Deleted ${deletedCount} existing triggers for ${functionName}`);
  }
}
