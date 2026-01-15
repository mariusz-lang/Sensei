# Sensei Setup Guide

## Step 1: Setup Control Sheet

1. Open your Control sheet: https://docs.google.com/spreadsheets/d/1qAMd77SzMc8ajX7fd9ScTXnEEw1TAfuH0KT78Zw2fSk/edit

2. Go to **Extensions > Apps Script**

3. Delete any default code in the editor

4. Create a new file called `Setup.gs` and paste the contents from:
   `apps-script/Setup.gs`

5. Click the **Save** icon (💾)

6. In the function dropdown at the top, select `setupControlSheet`

7. Click **Run** (▶️)

8. **Authorize the script** when prompted:
   - Click "Review permissions"
   - Choose your Google account
   - Click "Advanced" → "Go to Untitled project (unsafe)"
   - Click "Allow"

9. Check the **Execution log** at the bottom - should say "Control sheet setup complete!"

10. Go back to your spreadsheet - you should now see two sheets: `Config` and `Sync_Log`

## Step 2: Create Data Sheets

Create 3 new Google Sheets (File > New > Google Sheets):

1. **Sensei - Products**
2. **Sensei - Warehouse**
3. **Sensei - Sales**

For each sheet, copy its Sheet ID from the URL:
```
https://docs.google.com/spreadsheets/d/{SHEET_ID_HERE}/edit
```

Paste these IDs into the Control sheet's `Config` tab:
- Row 2: `products_sheet_id`
- Row 3: `warehouse_sheet_id`
- Row 4: `sales_sheet_id`

## Step 3: Configure All Data Sheets

Back in the **Control sheet**:

1. Make sure all 3 Sheet IDs are filled in the Config sheet
2. In the Apps Script editor, select function `setupAllDataSheets`
3. Click **Run** (▶️)
4. Wait for it to complete (will configure all 3 sheets automatically)
5. You'll see a success alert when done

This will remotely configure all three data sheets with proper headers, formatting, and column widths.

## Step 4: Configure API Credentials

1. In the Control sheet's Apps Script editor, click **⚙️ Project Settings** (gear icon in left sidebar)
2. Scroll down to **Script Properties** section
3. Click **Add script property**
4. Add first property:
   - Property: `FAKTUROWNIA_DOMAIN`
   - Value: `mo-filipowski` (your subdomain)
5. Click **Add script property** again
6. Add second property:
   - Property: `FAKTUROWNIA_API_TOKEN`
   - Value: (paste your API token)
7. Click **Save project**

## Verification

Your Control sheet's Config should now have:
- ✅ All 3 Sheet IDs filled in
- ✅ Last sync timestamps (empty for now)
- ✅ Initial load complete: `false`
- ✅ Sync enabled: `true`

## Next Steps

Once setup is complete, you're ready to:
1. Test the sync functions
2. Run initial historical data load
3. Set up daily automated sync triggers

## Troubleshooting

**"Script not found" error**: Make sure you saved the script (💾 icon)

**Authorization errors**: You need to authorize the script to access your Google Sheets

**Can't find Sheet ID**: Look in the URL bar - it's the long string between `/d/` and `/edit`

**Config values not saving**: Make sure the key names match exactly (case-sensitive)
