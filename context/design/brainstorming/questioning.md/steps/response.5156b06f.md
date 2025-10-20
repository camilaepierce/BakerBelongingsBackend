---
timestamp: 'Sun Oct 19 2025 18:50:04 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_185004.627cfd95.md]]'
content_id: 5156b06f741a5a575311d1def0c0936f57803da5b4cbd042b63aebf4427fa53d
---

# response:

The failing test case:

```typescript
  "attempting to double checkout the same item throws an error",
  async () => {
    await assertThrows(
      async () => {
        await r.checkoutItem(kerb, itemName, 1);
      },
      Error,
      `Item already checked out: ${itemName}`,
      "checkoutItem should throw when an item is already checked out",
    );
  },
);
```

This test suggests that the `checkoutItem` function is expected to throw a generic `Error` with a *very specific* message. When a test like this fails, it usually means one of the following:

1. **The error is not being thrown at all:** `checkoutItem` proceeds without indicating a problem.
2. **A different error type is thrown:** E.g., a custom error class, or just a string. `assertThrows` expects an `Error` instance.
3. **The error message does not match exactly:** Even a single character difference (extra space, different capitalization, punctuation) will cause the assertion to fail.
4. **The pre-condition for "double checkout" isn't met:** The item isn't correctly marked as checked out after the *first* checkout, so the second one might succeed unexpectedly.

### Addressing the Failing Test First

Before adding more error tests, ensure the existing failing test passes. Debug your `InventoryReservation`'s `checkoutItem` method:

1. **Verify initial checkout:** Make sure the first call to `r.checkoutItem(kerb, itemName, 1)` *successfully updates* the database to mark the item as unavailable (e.g., `available` becomes 0, `lastCheckout` and `lastKerb` are set).
2. **Verify double checkout logic:** When `checkoutItem` is called a second time for the same item, ensure it correctly checks the item's `available` status and `lastCheckout`/`lastKerb` fields.
3. **Verify error throwing:** Confirm that if the item is indeed already checked out, `checkoutItem` explicitly executes `throw new Error(`Item already checked out: ${itemName}`);`. Double-check the *exact* string literal used.

### General Strategy for "Improper Error Testing"

"Improper error testing" usually refers to tests that don't adequately cover all error conditions, don't assert the correct error types or messages, or don't ensure that failed operations leave the system in a consistent state.

To improve this, follow these steps:

1. **Define Custom Error Types:** Instead of generic `Error`, create specific error classes. This makes error handling more precise, maintainable, and testable.
2. **Comprehensive Scenario Coverage:** Test all expected failure modes.
3. **Assert Specific Error Types and Messages:** Validate both the type of error thrown and its informative message.
4. **Assert No Side Effects on Failure:** Ensure that if an operation fails, the system's state (e.g., database) remains unchanged or rolls back correctly.

### Suggested Enhancements & Test Cases for `InventoryReservation`'s `checkoutItem`

Here are suggestions, assuming `InventoryReservation` manages item checkouts:

***

#### 1. Introduce Custom Error Classes (Recommended Best Practice)

Create a dedicated file (e.g., `src/utils/errors.ts`):

```typescript
// src/utils/errors.ts

export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name; // Sets name to the class name (e.g., "ItemNotFoundError")
  }
}

export class ItemNotFoundError extends InventoryError {
  constructor(itemName: string) {
    super(`Item not found: ${itemName}`);
  }
}

export class ItemUnavailableError extends InventoryError {
  constructor(itemName: string, reason?: string) {
    super(`Item '${itemName}' is unavailable. ${reason || ""}`.trim());
  }
}

export class AlreadyCheckedOutError extends ItemUnavailableError {
  constructor(itemName: string, kerb: string) {
    super(
      itemName,
      kerb ? `It is currently checked out by ${kerb}.` : "It is already checked out.",
    );
  }
}

export class InsufficientQuantityError extends ItemUnavailableError {
  constructor(itemName: string, requested: number, available: number) {
    super(
      itemName,
      `Requested ${requested}, but only ${available} available.`,
    );
  }
}

export class InvalidQuantityError extends InventoryError {
  constructor(quantity: number) {
    super(`Quantity must be a positive number, received ${quantity}.`);
  }
}

export class UserNotFoundError extends InventoryError {
    constructor(kerb: string) {
        super(`User not found: ${kerb}`);
    }
}
```

Then, modify your `checkoutItem` implementation to throw these specific errors.

**Example `checkoutItem` (conceptual):**

```typescript
// src/services/InventoryReservation.ts (conceptual)
import { Db } from "npm:mongodb";
import {
  AlreadyCheckedOutError,
  InsufficientQuantityError,
  ItemNotFoundError,
  InvalidQuantityError,
  UserNotFoundError // If you validate users
} from "@utils/errors.ts"; // Import your custom errors

class InventoryReservation {
  constructor(private db: Db) {}

  async checkoutItem(
    kerb: string,
    itemName: string,
    quantity: number,
  ): Promise<void> {
    if (quantity <= 0) {
      throw new InvalidQuantityError(quantity);
    }

    // Optional: Check if user exists (if your system requires it)
    const user = await this.db.collection("users").findOne({ kerb });
    if (!user) {
        throw new UserNotFoundError(kerb);
    }

    const itemCollection = this.db.collection("items");
    const item = await itemCollection.findOne({ itemName });

    if (!item) {
      throw new ItemNotFoundError(itemName);
    }

    if (item.available < quantity) {
      throw new InsufficientQuantityError(itemName, quantity, item.available);
    }

    // This handles the "double checkout" scenario specifically for available: 0 or existing lastCheckout
    if (item.available === 0 || item.lastCheckout !== null) {
      throw new AlreadyCheckedOutError(itemName, item.lastKerb);
    }

    // If it reaches here, the checkout is valid. Perform the update.
    await itemCollection.updateOne(
      { _id: item._id },
      {
        $inc: { available: -quantity }, // Decrement available count
        $set: { lastCheckout: new Date(), lastKerb: kerb }, // Mark as checked out
      },
    );
  }
  // ... other methods
}
```

***

#### 2. Expanded Test Cases for `checkoutItem`

Here are the suggested test cases using custom error types and Deno's `assertThrows` (or a similar assertion utility you might have).

**Note:** Each `t.step` should include necessary setup (e.g., populating the database with specific items or users for that test case). The `testDb()` function from `database.ts` is excellent for providing a clean slate for each test suite.

```typescript
// In your test file (e.g., InventoryReservation.test.ts)

import { assertEquals } from "jsr:@std/assert";
import { assertThrows } from "jsr:@std/assert";
import { getDb, testDb, populateInitialData } from "@utils/database.ts"; // Assuming getDb for production, testDb for tests
import {
  AlreadyCheckedOutError,
  InsufficientQuantityError,
  ItemNotFoundError,
  InvalidQuantityError,
  UserNotFoundError, // If you implement user validation
} from "@utils/errors.ts"; // Import your custom errors

import { InventoryReservation } from "../src/services/InventoryReservation.ts"; // Assuming this is your service path

Deno.test("InventoryReservation checkoutItem error handling", async (t) => {
  let db: Db;
  let client: MongoClient;
  let r: InventoryReservation;
  let kerb: string; // A valid kerb for testing
  let itemName: string; // A valid item for testing

  // Setup for each test
  t.beforeEach(async () => {
    [db, client] = await testDb(); // Clean test DB for each test run
    await populateInitialData(db); // Repopulate with initial data
    r = new InventoryReservation(db);

    // Get a known existing kerb and item from the populated data for tests
    const testUser = await db.collection("users").findOne({});
    kerb = testUser?.kerb || "alice"; // Default if not found (should be via populateInitialData)

    const testItem = await db.collection("items").findOne({
      // Find an item that is available for checkout
      available: { $gt: 0 },
      lastCheckout: null,
    });
    itemName = testItem?.itemName || "Wireless Mouse"; // Default if not found
  });

  t.afterEach(async () => {
    await client.close(); // Close client after each test
  });

  // --- 1. Existing Failing Test (Refined with Custom Error) ---
  await t.step(
    "attempting to double checkout the same item throws an AlreadyCheckedOutError",
    async () => {
      // First, successfully check out the item
      await r.checkoutItem(kerb, itemName, 1);

      // Then, attempt to double checkout it
      await assertThrows(
        async () => {
          await r.checkoutItem(kerb, itemName, 1);
        },
        AlreadyCheckedOutError,
        `Item '${itemName}' is unavailable. It is currently checked out by ${kerb}.`,
        "checkoutItem should throw AlreadyCheckedOutError when item is already checked out by the same user",
      );

      // Assert no additional side effects (e.g., negative available count)
      const itemAfterAttempt = await db.collection("items").findOne({ itemName });
      assertEquals(itemAfterAttempt?.available, 0, "Item should still be unavailable (0)");
    },
  );

  // --- 2. Item Not Found Error ---
  await t.step(
    "attempting to checkout a non-existent item throws an ItemNotFoundError",
    async () => {
      const nonExistentItem = "NonExistentGadget_XYZ";
      await assertThrows(
        async () => {
          await r.checkoutItem(kerb, nonExistentItem, 1);
        },
        ItemNotFoundError,
        `Item not found: ${nonExistentItem}`,
        "checkoutItem should throw ItemNotFoundError for a non-existent item",
      );
    },
  );

  // --- 3. Insufficient Quantity Error (and No Side Effects) ---
  await t.step(
    "attempting to checkout more than available quantity throws InsufficientQuantityError and leaves state unchanged",
    async () => {
      const limitedItemName = "Keyboard"; // Assuming 'Keyboard' has `available: 2` initially
      const initialAvailable = 2; // Set this in your initial data or directly in the test setup

      // Ensure the item exists with a specific available count for this test
      await db.collection("items").updateOne(
        { itemName: limitedItemName },
        { $set: { available: initialAvailable, lastCheckout: null, lastKerb: null } },
        { upsert: true } // Create if not exists
      );

      // Get initial state to verify no side effects
      const itemBeforeAttempt = await db.collection("items").findOne({ itemName: limitedItemName });
      assertEquals(itemBeforeAttempt?.available, initialAvailable, "Pre-condition: item available count should be correct");

      await assertThrows(
        async () => {
          await r.checkoutItem(kerb, limitedItemName, initialAvailable + 1); // Request 3
        },
        InsufficientQuantityError,
        `Item '${limitedItemName}' is unavailable. Requested ${initialAvailable + 1}, but only ${initialAvailable} available.`,
        "checkoutItem should throw InsufficientQuantityError for insufficient quantity",
      );

      // Assert no side effects on error: available count should not have changed
      const itemAfterAttempt = await db.collection("items").findOne({ itemName: limitedItemName });
      assertEquals(itemAfterAttempt?.available, initialAvailable, "Item available count should remain unchanged after failed checkout");
    },
  );

  // --- 4. Invalid Quantity Errors (Zero and Negative) ---
  await t.step(
    "attempting to checkout a zero quantity throws InvalidQuantityError",
    async () => {
      await assertThrows(
        async () => {
          await r.checkoutItem(kerb, itemName, 0);
        },
        InvalidQuantityError,
        "Quantity must be a positive number, received 0.",
        "checkoutItem should throw InvalidQuantityError for zero quantity",
      );
    },
  );

  await t.step(
    "attempting to checkout a negative quantity throws InvalidQuantityError",
    async () => {
      await assertThrows(
        async () => {
          await r.checkoutItem(kerb, itemName, -1);
        },
        InvalidQuantityError,
        "Quantity must be a positive number, received -1.",
        "checkoutItem should throw InvalidQuantityError for negative quantity",
      );
    },
  );

  // --- 5. Double Checkout by a Different User ---
  await t.step(
    "attempting to double checkout an item by a different user throws AlreadyCheckedOutError",
    async () => {
      const otherKerb = "bob";
      // Ensure 'bob' user exists or is created for this test
      await db.collection("users").updateOne(
        { kerb: otherKerb },
        { $set: { first: "Bob", last: "Builder", role: "user" } },
        { upsert: true }
      );

      // First, check out the item with the initial kerb
      await r.checkoutItem(kerb, itemName, 1);

      // Then, attempt to check it out with a different kerb
      await assertThrows(
        async () => {
          await r.checkoutItem(otherKerb, itemName, 1);
        },
        AlreadyCheckedOutError,
        `Item '${itemName}' is unavailable. It is currently checked out by ${kerb}.`,
        "checkoutItem should throw AlreadyCheckedOutError when item is already checked out by another user",
      );
    },
  );

  // --- 6. User Not Found Error (if user validation is implemented) ---
  await t.step(
    "attempting to checkout with a non-existent kerb throws UserNotFoundError",
    async () => {
      const nonExistentKerb = "ghost_user";
      await assertThrows(
        async () => {
          await r.checkoutItem(nonExistentKerb, itemName, 1);
        },
        UserNotFoundError,
        `User not found: ${nonExistentKerb}`,
        "checkoutItem should throw UserNotFoundError when user does not exist",
      );
    },
  );
});
```
