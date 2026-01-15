/**
 * One-time script to generate brand performance report
 * Creates a Report sheet in Sales spreadsheet with brand metrics from 2025-03-26 to now
 */

function generateBrandReport() {
  const config = getConfig();
  const salesSheetId = config.sales_sheet_id;

  if (!salesSheetId) {
    throw new Error('Sales sheet ID not configured');
  }

  Logger.log('Generating brand performance report...');

  const ss = SpreadsheetApp.openById(salesSheetId);
  const salesSheet = ss.getSheetByName('Sales_Documents');

  if (!salesSheet) {
    throw new Error('Sales_Documents sheet not found');
  }

  // Get or create Report sheet
  let reportSheet = ss.getSheetByName('Report');
  if (reportSheet) {
    Logger.log('Report sheet already exists, clearing contents...');
    reportSheet.clear();
  } else {
    Logger.log('Creating Report sheet...');
    reportSheet = ss.insertSheet('Report');
  }

  // Read all sales data
  const lastRow = salesSheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('No sales data found');
    return;
  }

  Logger.log(`Reading ${lastRow - 1} sales rows...`);
  const data = salesSheet.getRange(2, 1, lastRow - 1, 25).getValues();

  // Column indices (0-based)
  const COL_SELL_DATE = 3;    // sell_date
  const COL_BRAND = 11;        // brand
  const COL_NET_PRICE = 16;    // net_price
  const COL_QUANTITY = 15;     // quantity
  const COL_MARGIN_PLN = 21;   // margin_pln
  const COL_MARGIN_PCT = 22;   // margin_percent
  const COL_COST_AVAILABLE = 23; // cost_available

  // Filter date range: 2025-03-26 to now
  const startDate = new Date('2025-03-26');
  const endDate = new Date();

  Logger.log(`Analyzing data from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

  // Aggregate by brand
  const brandStats = {};

  let skippedByDate = 0;
  data.forEach(row => {
    const sellDateStr = row[COL_SELL_DATE];
    if (!sellDateStr) return;

    const sellDate = new Date(sellDateStr);
    if (sellDate < startDate || sellDate > endDate) {
      skippedByDate++;
      return;
    }

    const brand = row[COL_BRAND] || 'Unknown';
    const netPrice = parseFloat(row[COL_NET_PRICE]) || 0;
    const quantity = parseFloat(row[COL_QUANTITY]) || 0;
    const marginPln = parseFloat(row[COL_MARGIN_PLN]) || 0;
    const marginPct = parseFloat(row[COL_MARGIN_PCT]) || 0;
    const costAvailable = row[COL_COST_AVAILABLE] === true;

    const revenue = netPrice * quantity;

    if (!brandStats[brand]) {
      brandStats[brand] = {
        totalRevenue: 0,
        totalMargin: 0,
        marginPctSum: 0,
        marginPctCount: 0,
        salesCount: 0
      };
    }

    brandStats[brand].totalRevenue += revenue;
    brandStats[brand].totalMargin += marginPln;
    brandStats[brand].salesCount++;

    // Only include margin % if cost is available, non-zero, and positive
    if (costAvailable && marginPct > 0) {
      brandStats[brand].marginPctSum += marginPct;
      brandStats[brand].marginPctCount++;
    }
  });

  // Calculate totals for share percentages
  let totalRevenueAll = 0;
  let totalMarginAll = 0;

  Object.values(brandStats).forEach(stats => {
    totalRevenueAll += stats.totalRevenue;
    totalMarginAll += stats.totalMargin;
  });

  // Convert to array and sort by total revenue descending
  const brandData = Object.keys(brandStats).map(brand => {
    const stats = brandStats[brand];
    const avgMarginPct = stats.marginPctCount > 0
      ? stats.marginPctSum / stats.marginPctCount
      : 0;

    const revenueShare = totalRevenueAll > 0
      ? (stats.totalRevenue / totalRevenueAll) * 100
      : 0;

    const marginShare = totalMarginAll > 0
      ? (stats.totalMargin / totalMarginAll) * 100
      : 0;

    return {
      brand: brand,
      totalRevenue: stats.totalRevenue,
      revenueShare: revenueShare,
      totalMargin: stats.totalMargin,
      marginShare: marginShare,
      avgMarginPct: avgMarginPct,
      salesCount: stats.salesCount
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);

  Logger.log(`Found ${brandData.length} brands`);
  Logger.log(`Total revenue: ${Math.round(totalRevenueAll * 100) / 100} PLN`);
  Logger.log(`Total margin: ${Math.round(totalMarginAll * 100) / 100} PLN`);

  // Write to Report sheet
  const headers = [
    'Brand',
    'Total Revenue (PLN)',
    'Revenue Share %',
    'Total Margin (PLN)',
    'Margin Share %',
    'Avg Margin %',
    'Sales Count'
  ];

  reportSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  reportSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  reportSheet.getRange(1, 1, 1, headers.length).setBackground('#4285f4');
  reportSheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');

  // Write data
  if (brandData.length > 0) {
    const rows = brandData.map(item => [
      item.brand,
      Math.round(item.totalRevenue * 100) / 100,
      Math.round(item.revenueShare * 100) / 100,
      Math.round(item.totalMargin * 100) / 100,
      Math.round(item.marginShare * 100) / 100,
      Math.round(item.avgMarginPct * 100) / 100,
      item.salesCount
    ]);

    reportSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

    // Format currency columns
    reportSheet.getRange(2, 2, rows.length, 1).setNumberFormat('#,##0.00 zł');
    reportSheet.getRange(2, 4, rows.length, 1).setNumberFormat('#,##0.00 zł');

    // Format percentage columns
    reportSheet.getRange(2, 3, rows.length, 1).setNumberFormat('0.00"%"');
    reportSheet.getRange(2, 5, rows.length, 1).setNumberFormat('0.00"%"');
    reportSheet.getRange(2, 6, rows.length, 1).setNumberFormat('0.00"%"');
  }

  // Set column widths
  reportSheet.setColumnWidth(1, 150); // Brand
  reportSheet.setColumnWidth(2, 150); // Total Revenue
  reportSheet.setColumnWidth(3, 120); // Revenue Share %
  reportSheet.setColumnWidth(4, 150); // Total Margin
  reportSheet.setColumnWidth(5, 120); // Margin Share %
  reportSheet.setColumnWidth(6, 120); // Avg Margin %
  reportSheet.setColumnWidth(7, 100); // Sales Count

  reportSheet.setFrozenRows(1);

  Logger.log('Report generated successfully!');
  Logger.log(`Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
  Logger.log(`Brands analyzed: ${brandData.length}`);
}
