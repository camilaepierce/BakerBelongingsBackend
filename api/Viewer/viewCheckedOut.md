# Viewer API: viewCheckedOut

**Endpoint:** `POST /api/viewer/viewCheckedOut`

**Description:** Returns all items that are currently checked out (where `available === false`).

**Parameters:** None

**Response:**
- `200 OK`: Array of checked out items
  - Content-Type: application/json
  - Schema:
    ```json
    [
      {
        "_id": "string",
        "itemName": "string",
        "lastCheckout": "string (date-time)",
        "available": false,
        "lastKerb": "string | null",
        "categories": ["string"],
        "tags": ["string"]
      }
    ]
    ```

**Example Response:**
```json
[
  {
    "_id": "abc123",
    "itemName": "Tent",
    "lastCheckout": "2025-10-20T14:00:00.000Z",
    "available": false,
    "lastKerb": "jdoe",
    "categories": ["camping"],
    "tags": ["outdoor", "shelter"]
  }
]
```

**Tags:** Viewer
