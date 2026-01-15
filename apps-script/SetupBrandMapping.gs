/**
 * One-time setup for Brand_Mapping sheet
 * Run this to create the Brand_Mapping tab in Control sheet
 */

function createBrandMappingSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Check if Brand_Mapping already exists
  let brandMappingSheet = ss.getSheetByName('Brand_Mapping');

  if (brandMappingSheet) {
    Logger.log('Brand_Mapping sheet already exists');
    return;
  }

  // Create the sheet
  brandMappingSheet = ss.insertSheet('Brand_Mapping');

  // Set headers
  const headers = ['brand_name', 'display_name'];
  brandMappingSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  brandMappingSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  brandMappingSheet.getRange(1, 1, 1, headers.length).setBackground('#9c27b0');
  brandMappingSheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');

  // Format columns
  brandMappingSheet.setColumnWidth(1, 200); // brand_name
  brandMappingSheet.setColumnWidth(2, 150); // display_name
  brandMappingSheet.setFrozenRows(1);

  // Add example data
  const exampleData = [
    ['Xero Shoes', 'Xero'],
    ['Koel Barefoot', 'Koel'],
    ['Vivobarefoot', 'Vivobarefoot']
  ];
  brandMappingSheet.getRange(2, 1, exampleData.length, 2).setValues(exampleData);

  // Add instructions
  brandMappingSheet.getRange('D1').setValue('Instructions:');
  brandMappingSheet.getRange('D1').setFontWeight('bold');
  brandMappingSheet.getRange('D2').setValue('brand_name: Text to match in product names (e.g., "Xero Shoes")');
  brandMappingSheet.getRange('D3').setValue('display_name: Short name to use in reports (e.g., "Xero")');
  brandMappingSheet.getRange('D4').setValue('Order matters: longer/more specific brand names should come first');

  Logger.log('Brand_Mapping sheet created successfully!');
  Logger.log('Example data added - update with your actual brands');
}
