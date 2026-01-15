# Fakturownia API Reference for Sensei

## Authentication

**Method**: API token as URL query parameter

```javascript
const API_TOKEN = PropertiesService.getScriptProperties().getProperty('FAKTUROWNIA_API_TOKEN');
const DOMAIN = PropertiesService.getScriptProperties().getProperty('FAKTUROWNIA_DOMAIN'); // e.g., 'mo-filipowski'

const baseUrl = `https://${DOMAIN}.fakturownia.pl`;
```

## Core Endpoints

### 1. Products

**List all products:**
```
GET /products.json?api_token=TOKEN&page=1&per_page=100
```

**Get single product:**
```
GET /products/{id}.json?api_token=TOKEN
```

**Response structure:**
```json
{
  "id": 123,
  "name": "Product Name",
  "code": "SKU-CODE",
  "price_gross": 100.00,
  "price_net": 81.30,
  "tax": 23,
  "quantity": 10,
  "category_id": 1,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### 2. Invoices (Sales Documents)

**List invoices with filtering:**
```
GET /invoices.json?api_token=TOKEN&period=more&date_from=2024-01-01&date_to=2024-01-31&include_positions=true&per_page=100&page=1
```

**Query parameters:**
- `kind` - Document type: `invoice`, `receipt`, `correction`
- `period` - `today`, `yesterday`, `week`, `month`, `quarter`, `year`, `more` (for custom date range)
- `date_from` / `date_to` - Date range (YYYY-MM-DD format, requires `period=more`)
- `search_date_type` - Which date to filter by: `issue_date`, `paid_date`, `transaction_date` (default: `issue_date`)
- `order` - Sort by: `updated_at`, `issue_date`, `number`, etc.
- `include_positions` - Include line items: `true`
- `per_page` - Max 100
- `page` - Page number (1-indexed)

**Response structure:**
```json
{
  "id": 456,
  "number": "FV/2024/01/001",
  "kind": "vat",
  "sell_date": "2024-01-15",
  "issue_date": "2024-01-15",
  "payment_type": "transfer",
  "client_id": 789,
  "price_gross": 246.00,
  "price_net": 200.00,
  "positions": [
    {
      "id": 111,
      "product_id": 123,
      "name": "Product Name",
      "quantity": 2,
      "price_gross": 123.00,
      "price_net": 100.00,
      "total_price_gross": 246.00,
      "tax": 23,
      "discount": "0"
    }
  ],
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### 3. Warehouse Documents

**List warehouse documents:**
```
GET /warehouse_documents.json?api_token=TOKEN&per_page=100&page=1
```

**Query parameters:**
- `kind` - Document type: `mm` (arrival), `pz` (inbound), `wz` (outbound), `wzk` (outbound correction)
- `invoice_id` - Filter by linked invoice
- `per_page` - Max 100
- `page` - Page number (1-indexed)

**Get single document:**
```
GET /warehouse_documents/{id}.json?api_token=TOKEN
```

**Response structure:**
```json
{
  "id": 789,
  "number": "MM/2024/001",
  "kind": "mm",
  "issue_date": "2024-01-15",
  "warehouse_id": 1,
  "warehouse_actions": [
    {
      "id": 1001,
      "product_id": 123,
      "product_name": "Product Name",
      "quantity": 10,
      "purchase_price_net": 50.00,
      "purchase_price_gross": 61.50,
      "purchase_tax": 23,
      "purchase_currency": "PLN"
    }
  ],
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

## Date Filtering for Incremental Sync

**Use `updated_at` for incremental sync:**

The API supports ordering by `updated_at` which can be used with date filtering:

```
GET /invoices.json?api_token=TOKEN&period=more&date_from=2024-01-15&date_to=2024-01-16&order=updated_at.desc
```

**Note**: The `date_from`/`date_to` filters work on `issue_date` by default. For truly incremental sync based on modification time, you may need to:
1. Pull all documents for a date range
2. Filter locally by `updated_at` timestamp
3. Or pull broader date ranges and rely on upsert logic

**Recommended approach**: Pull last 7 days of documents daily to catch any edits, use upsert logic to handle duplicates.

## Pagination Pattern

```javascript
async function fetchAllPages(endpoint, params) {
  const allRecords = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}${endpoint}?api_token=${API_TOKEN}&page=${page}&per_page=100&${params}`;

    const response = UrlFetchApp.fetch(url);
    const records = JSON.parse(response.getContentText());

    if (!Array.isArray(records) || records.length === 0) {
      break;
    }

    allRecords.push(...records);

    if (records.length < 100) {
      break; // Last page
    }

    page++;
  }

  return allRecords;
}
```

## Retry Logic

```javascript
function withRetry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (error) {
      const isRetryable = /429|500|502|503|timeout/i.test(error.message);

      if (isRetryable && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        Utilities.sleep(delay);
        continue;
      }

      throw error;
    }
  }
}
```

## Important Notes

1. **`updated_at` field**: All documents have this field tracking last modification
2. **Pagination**: Always use `per_page=100` (maximum), check if `length < 100` to detect last page
3. **Date format**: YYYY-MM-DD for all date parameters
4. **Include positions**: Always use `include_positions=true` for invoices to get line items
5. **Warehouse actions**: Nested in warehouse documents response as `warehouse_actions` array
6. **Document kinds**:
   - Invoices: `vat`, `proforma`, `receipt`, `correction`
   - Warehouse: `mm` (arrival), `pz` (inbound), `wz` (outbound), `wzk` (outbound correction)

## Reference Files

- Full API docs: `c:\Users\krato\Desktop\Vibecoding\Fakturownia API documentation.txt`
- Working examples: `c:\Users\krato\Desktop\Vibecoding\Behemoth\Code.gs`
