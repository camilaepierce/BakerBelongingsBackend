---
timestamp: 'Mon Oct 20 2025 14:42:55 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251020_144255.901488c0.md]]'
content_id: bba2bbf116a10df12db63dd41e5f2506185d04c699328c03b3052d64a4b76371
---

# API Specification: Reservation Concept

**Purpose:** Keep track of when items will expire, and send emails to users with expired items.

***

## API Endpoints

### POST /api/Reservation/checkoutItem

**Description:** Records that an item has been checked out by a user, setting an expiry time.

**Requirements:**

* The provided `item` must refer to a valid item.
* The `kerb` must correspond to a resident with the appropriate role.

**Effects:**

* An expiry Date is set for the checked-out item.

**Request Body:**

```json
{
  "kerb": "String",
  "item": "String"
}
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

### POST /api/Reservation/notifyCheckout

**Description:** Triggers the process to send reminder emails to users for items that are overdue.

**Requirements:**

* true (This action can always be performed, and its effects depend on the state of reservations.)

**Effects:**

* Sends an email to the `kerb` associated with each overdue item, as a reminder to check the item back in.

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

### POST /api/Reservation/getInventoryData

**Description:** Retrieves the current inventory data for all items managed by the concept.

**Requirements:**

* true (This action can always be performed.)

**Effects:**

* Returns the current inventory, including details about each item.

**Request Body:**

```json
{}
```

**Success Response Body (Action):**

```json
{
  "items": [
    {
      "itemName": "String",
      "category": "String",
      "lastCheckout": "Date",
      "lastKerb": "String",
      "available": "Number"
    }
  ]
}
```

**Error Response Body:**

```json
{
  "error": "string"
}
```

***

### POST /api/Reservation/checkinItem

**Description:** Records that a previously checked-out item has been returned, making it available again.

**Requirements:**

* true (This action can always be performed.)

**Effects:**

* The item is marked as available. (Implicitly, `lastCheckout` and `lastKerb` are cleared, as per typical check-in behavior.)

**Request Body:**

```json
{
  "itemName": "String"
}
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
