---
timestamp: 'Mon Oct 20 2025 22:01:44 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251020_220144.b07db10b.md]]'
content_id: 996601f5963d4e3cb26751b4cce862c9700ceac15ab526556332627de7b84a27
---

# API Specification: Viewer Concept

**Purpose:** Manage and query an inventory of items, including loading, saving, and AI-augmented search and recommendation functionalities.

***

## Data Structures

### Item

Represents an inventory item with its associated metadata.

```json
{
  "itemName": "string",
  "lastCheckout": "string | null", // ISO 8601 date string (e.g., "YYYY-MM-DD" or full timestamp)
  "available": "boolean",
  "lastKerb": "string",
  "categories": ["string"],
  "tags": ["string"]
}
```

***

## API Endpoints

### POST /api/Viewer/loadItems

**Description:** Loads inventory items from the configured CSV file (`inventory.csv` by default) into memory.

**Requirements:**

* The configured CSV file must exist and be readable.

**Effects:**

* The in-memory inventory `items` is populated with data parsed from the CSV file.

**Request Body:**

```json
{}
```

**Success Response Body (Action):**

```json
{}
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/saveItems

**Description:** Persists the current in-memory inventory items back to the configured CSV file, overwriting its content.

**Requirements:**

* The configured CSV file must be writable.

**Effects:**

* The current in-memory `items` are serialized into CSV format and written to the file.

**Request Body:**

```json
{}
```

**Success Response Body (Action):**

```json
{}
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/viewAvailable

**Description:** Returns a list of all inventory items that are currently marked as available.

**Requirements:**

* None explicitly defined.

**Effects:**

* Returns an array containing `Item` objects where the `available` property is `true`.

**Request Body:**

```json
{}
```

**Success Response Body (Query):**

```json
[
  {
    "itemName": "string",
    "lastCheckout": "string | null",
    "available": "boolean",
    "lastKerb": "string",
    "categories": ["string"],
    "tags": ["string"
    ]
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/viewItem

**Description:** Returns a single inventory item matching the given item name (case-insensitive).

**Requirements:**

* An item with the specified `itemName` must exist in the inventory.

**Effects:**

* Returns an array containing the `Item` object that exactly matches the `itemName`.

**Request Body:**

```json
{
  "itemName": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "itemName": "string",
    "lastCheckout": "string | null",
    "available": "boolean",
    "lastKerb": "string",
    "categories": ["string"],
    "tags": ["string"
    ]
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/viewCategory

**Description:** Returns a list of inventory items belonging to the specified category (case-insensitive).

**Requirements:**

* None explicitly defined.

**Effects:**

* Returns an array of `Item` objects that include the specified category in their `categories` list.

**Request Body:**

```json
{
  "category": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "itemName": "string",
    "lastCheckout": "string | null",
    "available": "boolean",
    "lastKerb": "string",
    "categories": ["string"],
    "tags": ["string"
    ]
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/viewTag

**Description:** Returns a list of inventory items associated with the specified tag (case-insensitive).

**Requirements:**

* None explicitly defined.

**Effects:**

* Returns an array of `Item` objects that include the specified tag in their `tags` list.

**Request Body:**

```json
{
  "tag": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "itemName": "string",
    "lastCheckout": "string | null",
    "available": "boolean",
    "lastKerb": "string",
    "categories": ["string"],
    "tags": ["string"
    ]
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/viewLastCheckedoutDate

**Description:** Returns the date (without time components) when the specified item was last checked out.

**Requirements:**

* An item with the specified `itemName` must exist in the inventory.
* The item must have a `lastCheckout` date recorded.

**Effects:**

* Returns an array containing a single object with the `lastCheckout` date formatted as an ISO 8601 date string (e.g., "YYYY-MM-DD").

**Request Body:**

```json
{
  "itemName": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "date": "string"
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/viewLastCheckedoutFull

**Description:** Returns the full date and time when the specified item was last checked out.

**Requirements:**

* An item with the specified `itemName` must exist in the inventory.
* The item must have a `lastCheckout` date recorded.

**Effects:**

* Returns an array containing a single object with the full `lastCheckout` `Date` object as an ISO 8601 string (e.g., "YYYY-MM-DDTHH:mm:ss.sssZ").

**Request Body:**

```json
{
  "itemName": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "date": "string"
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/viewAdjacent

**Description:** Uses an internal Large Language Model (LLM) to find and return a list of inventory items that are most similar or "adjacent" to a target item.

**Requirements:**

* An item with the specified `itemName` must exist in the inventory.

**Effects:**

* Returns an array of `Item` objects identified by the LLM as similar to the target item.

**Request Body:**

```json
{
  "itemName": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "itemName": "string",
    "lastCheckout": "string | null",
    "available": "boolean",
    "lastKerb": "string",
    "categories": ["string"],
    "tags": ["string"
    ]
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/viewAutocomplete

**Description:** Uses an internal LLM to suggest inventory item names that best match a given partial input prefix.

**Requirements:**

* None explicitly defined.

**Effects:**

* Returns an array of `Item` objects whose names match the LLM's autocomplete suggestions.

**Request Body:**

```json
{
  "prefix": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "itemName": "string",
    "lastCheckout": "string | null",
    "available": "boolean",
    "lastKerb": "string",
    "categories": ["string"],
    "tags": ["string"
    ]
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/recommendItems

**Description:** Uses an internal LLM to recommend inventory items for a user based on their stated interests, providing a one-sentence suggestion for each recommended item.

**Requirements:**

* None explicitly defined.

**Effects:**

* Returns an array of objects, each containing an `Item` and a `suggestion` string.

**Request Body:**

```json
{
  "interests": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "item": {
      "itemName": "string",
      "lastCheckout": "string | null",
      "available": "boolean",
      "lastKerb": "string",
      "categories": ["string"],
      "tags": ["string"]
    },
    "suggestion": "string"
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/parseCsvLine

**Description:** Parses a single CSV formatted string line into an array of string values, handling quotes and delimiters.

**Requirements:**

* The input `line` must be a string.

**Effects:**

* Returns an array of objects, where each object contains a `value` representing a parsed field from the CSV line.

**Request Body:**

```json
{
  "line": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "value": "string"
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/escapeCsv

**Description:** Escapes a given string according to CSV rules (enclosing in quotes, doubling internal quotes) if it contains commas, double quotes, or newlines.

**Requirements:**

* The input `s` must be a string.

**Effects:**

* Returns an array containing a single object with the `escapedString`.

**Request Body:**

```json
{
  "s": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "escapedString": "string"
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/formatDate

**Description:** Formats a Date object into an ISO date string (YYYY-MM-DD).

**Requirements:**

* The input `d` should be a valid ISO 8601 date string that can be parsed into a Date object.

**Effects:**

* Returns an array containing a single object with the `formattedDate` string.

**Request Body:**

```json
{
  "d": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "formattedDate": "string"
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/createAdjacentPrompt

**Description:** Generates an LLM prompt string designed to find adjacent or similar items based on a target item's details and the current inventory.

**Requirements:**

* The input `target` must be a valid `Item` object.

**Effects:**

* Returns an array containing a single object with the generated `prompt` string.

**Request Body:**

```json
{
  "target": {
    "itemName": "string",
    "lastCheckout": "string | null",
    "available": "boolean",
    "lastKerb": "string",
    "categories": ["string"],
    "tags": ["string"]
  }
}
```

**Success Response Body (Query):**

```json
[
  {
    "prompt": "string"
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/createAutocompletePrompt

**Description:** Generates an LLM prompt string designed for autocompleting item names based on a given partial input prefix and the available inventory names.

**Requirements:**

* The input `prefix` must be a string.

**Effects:**

* Returns an array containing a single object with the generated `prompt` string.

**Request Body:**

```json
{
  "prefix": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "prompt": "string"
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/createRecommendPrompt

**Description:** Generates an LLM prompt string designed for recommending inventory items based on user interests, using a sample of the inventory.

**Requirements:**

* The input `interests` must be a string.

**Effects:**

* Returns an array containing a single object with the generated `prompt` string.

**Request Body:**

```json
{
  "interests": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "prompt": "string"
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/extractNameListFromLLM

**Description:** Extracts a list of item names (strings) from a given LLM response text, assuming the text contains a JSON array of strings.

**Requirements:**

* The input `text` should contain a valid JSON array of strings.

**Effects:**

* Returns an array of objects, where each object contains a `name` representing an extracted item name.

**Request Body:**

```json
{
  "text": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "name": "string"
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Viewer/extractJson

**Description:** Extracts and parses the first JSON object or array found within a given text string.

**Requirements:**

* The input `text` must contain a parsable JSON structure (either `{...}` or `[...]`).

**Effects:**

* Returns an array containing a single object with the `jsonContent` (which can be any JSON type: object, array, string, number, boolean, null).

**Request Body:**

```json
{
  "text": "string"
}
```

**Success Response Body (Query):**

```json
[
  {
    "jsonContent": "any"
  }
]
```

**Error Response Body:**

```json
{
  "error": "string"
}
```
