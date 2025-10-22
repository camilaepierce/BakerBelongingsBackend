# Viewer API: viewExpired

**Endpoint:** `POST /api/viewer/viewExpired`

**Description:** Returns all items that have exceeded their expiry date (expiryDate < today).

**Parameters:** None

**Response:**
- `200 OK`: Array of expired items
  - Content-Type: application/json
  - Schema:
    ```json
    [
      {
        "_id": "string",
        "itemName": "string",
        "lastCheckout": "string (date-time)",
        "available": true,
        "lastKerb": "string | null",
        "categories": ["string"],
        "tags": ["string"],
        "expiryDate": "string (date-time)"
      }
    ]
    ```

**Example Response:**
```json
[
  {
    "_id": "abc123",
    "itemName": "Milk",
    "lastCheckout": "2025-10-10T14:00:00.000Z",
    "available": true,
    "lastKerb": "jdoe",
    "categories": ["food"],
    "tags": ["perishable"],
    "expiryDate": "2025-10-15T00:00:00.000Z"
  }
]
```

**Tags:** Viewer
