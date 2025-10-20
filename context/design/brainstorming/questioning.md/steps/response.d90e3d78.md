---
timestamp: 'Sun Oct 19 2025 21:49:19 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_214919.36205416.md]]'
content_id: d90e3d783ca35e14d971258d937fed060522bc81bfe8bb359609926bf9f77ec1
---

# response:

```typescript
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert";
import {
  freshID,
  populateInitialData,
  testDb,
} from "./../../utils/database.ts"; // Correct path
import { Db, MongoClient } from "npm:mongodb"; // Needed for MongoDB tests
import { ID } from "./../../utils/types.ts"; // Correct path
import { InventoryReservation, Reservation } from "./inventoryreservation.ts"; // Consolidated import

import {
  AlreadyCheckedOutError,
  InsufficientQuantityError,
  InvalidQuantityError,
  ItemNotFoundError,
  UserNotFoundError,
} from "./../../utils/errors.ts"; // Correct path

// Helper functions for CSV manipulation in tests (kept as they are used by tests directly)
interface CsvDataForTest {
  header: string[];
  rows: string[][];
}

async function readCsvForTest(p: string): Promise<CsvDataForTest> {
  const raw = await Deno.readTextFile(p);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split(",").map((h) => h.trim());
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(parseCsvLineForTest(lines[i]));
  }
  return { header, rows };
}

async function writeCsvForTest(
  p: string,
  content: string,
): Promise<void> {
  await Deno.writeTextFile(p, content);
}

function parseCsvLineForTest(line: string): string[] {
  const res: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      res.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  res.push(cur);
  return res.map((s) => s.trim());
}

// Test data for initial CSV states
const initialInventoryCsvContent =
  `ItemName,Category,Available,LastCheckout,LastKerb
Laptop,Electronics,1,,
Monitor,Electronics,0,2023-10-26,user1
Keyboard,Peripherals,1,,
Mouse,Peripherals,1,,`;

const initialUsersCsvContent = `kerb,first,last,role
user1,John,Doe,resident
user2,Jane,Smith,staff
admin,Admin,User,admin`;

// Interface for paths returned by setupTestFiles
interface TestFilePaths {
  inventory: string;
  users: string;
}

// Module-scoped variables for temporary file paths (for CSV tests)
let inventoryCsvPath: string;
let usersCsvPath: string;

// Store original Date and console.log for restoration
let originalDate: DateConstructor;
let originalConsoleLog: typeof console.log;

/**
 * Creates temporary CSV files and initializes them with test data.
 * @returns An object containing the paths to the temporary inventory and users CSVs.
 */
async function setupTestFiles(): Promise<TestFilePaths> {
  // Use Deno.makeTempFile to create unique temporary files
  const tmpInventory = await Deno.makeTempFile({
    prefix: "inventory_",
    suffix: ".csv",
  });
  const tmpUsers = await Deno.makeTempFile({
    prefix: "users_",
    suffix: ".csv",
  });

  // Populate the temporary files with initial test data
  await Deno.writeTextFile(tmpInventory, initialInventoryCsvContent);
  await Deno.writeTextFile(tmpUsers, initialUsersCsvContent);

  return { inventory: tmpInventory, users: tmpUsers };
}

/**
 * Deletes the temporary test files.
 * @param paths The object containing paths to the temporary files.
 */
async function teardownTestFiles(paths: TestFilePaths) {
  try {
    await Deno.remove(paths.inventory);
  } catch (_) { /* ignore errors during cleanup */ }
  try {
    await Deno.remove(paths.users);
  } catch (_) { /* ignore errors during cleanup */ }
}

Deno.test("Reservation System Test Suite (CSV-based)", async (t) => {
  let csvTempPaths: TestFilePaths;

  // --- Suite-level Setup: Create temporary files once for the entire CSV suite ---
  originalDate = globalThis.Date; // Capture original Date constructor
  originalConsoleLog = console.log; // Capture original console.log

  csvTempPaths = await setupTestFiles(); // Call the new setup function
  inventoryCsvPath = csvTempPaths.inventory; // Assign to module-scoped vars for tests
  usersCsvPath = csvTempPaths.users;

  // --- Helper to reset file content and mocks for each test step ---
  // This helper is called manually at the beginning of each t.step,
  // effectively serving as a per-test-step setup for file content and mocks.
  // It is not `t.beforeEach`, thus compliant with the prompt.
  const beforeEachStep = async () => {
    // Reset CSV files to their initial content for test isolation
    await writeCsvForTest(inventoryCsvPath, initialInventoryCsvContent);
    await writeCsvForTest(usersCsvPath, initialUsersCsvContent);
    // Restore global mocks to ensure clean state for the next test
    globalThis.Date = originalDate;
    console.log = originalConsoleLog;
  };

  // --- Individual test steps, grouped by method ---

  await t.step("checkoutItem method tests", async (t) => {
    await t.step(
      "successfully checks out an available item",
      async () => {
        await beforeEachStep(); // Manual setup for this test step
        const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7); // 7 days duration

        const mockDate = new originalDate("2023-11-01T10:00:00Z");
        globalThis.Date = class extends originalDate {
          constructor(dateString?: string | number | Date) {
            if (
              dateString !== undefined && dateString !== null &&
              dateString !== ""
            ) {
              super(dateString);
            } else {
              super(mockDate.toISOString());
            }
          }
        } as DateConstructor;

        await reservation.checkoutItem("user1", "Keyboard", 1);

        // Verify in-memory reservation
        const reservationsMap = (reservation as any).reservations; // Access private property for testing
        assertEquals(reservationsMap.size, 1);
        const keyboardReservation = reservationsMap.get("Keyboard");
        assert(keyboardReservation !== undefined);
        assertEquals(keyboardReservation.kerb, "user1");
        const expectedExpiry = new originalDate(mockDate);
        expectedExpiry.setDate(mockDate.getDate() + 7); // Add 7 days to mockDate
        assertEquals(
          keyboardReservation.expiry.toISOString().slice(0, 10),
          expectedExpiry.toISOString().slice(0, 10),
        );
        console.log("getting to breakpoint");

        // Verify inventory.csv
        const { rows } = await readCsvForTest(inventoryCsvPath);
        const keyboardRow = rows.find((r) => r[0] === "Keyboard"); // ItemName is 0th column
        assert(keyboardRow !== undefined);
        assertEquals(keyboardRow[2], "0"); // Available
        assertEquals(keyboardRow[3], "2023-11-08"); // LastCheckout (YYYY-MM-DD for 7 days from mockDate)
        assertEquals(keyboardRow[4], "user1"); // LastKerb
      },
    );

    await t.step("throws error if item not found", async () => {
      await beforeEachStep(); // Manual setup for this test step
      const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
      await assertRejects(
        () => reservation.checkoutItem("user1", "NonExistentItem", 1),
        ItemNotFoundError, // Use custom error
      );
    });

    await t.step("throws error if kerb not found", async () => {
      await beforeEachStep(); // Manual setup for this test step
      const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
      await assertRejects(
        () => reservation.checkoutItem("nonexistent", "Keyboard", 1),
        UserNotFoundError, // Use custom error
      );
    });

    await t.step(
      "throws error if kerb is not a resident",
      async () => {
        await beforeEachStep(); // Manual setup for this test step
        const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
        await assertRejects(
          () => reservation.checkoutItem("user2", "Keyboard", 1),
          UserNotFoundError, // Use custom error
        );
        await assertRejects(
          () => reservation.checkoutItem("admin", "Keyboard", 1),
          UserNotFoundError, // Use custom error
        );
      },
    );

    await t.step(
      "throws error if item already checked out (CSV data)",
      async () => {
        await beforeEachStep(); // Manual setup for this test step
        const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
        // Monitor is initially set to Available=0 in initialInventoryCsvContent
        await assertRejects(
          () => reservation.checkoutItem("user1", "Monitor", 1),
          AlreadyCheckedOutError, // Use custom error
        );
      },
    );

    await t.step(
      "throws error if item already checked out (in-memory reservation)",
      async () => {
        await beforeEachStep(); // Manual setup for this test step
        const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
        const mockDate = new originalDate("2023-11-01T10:00:00Z");
        globalThis.Date = class extends originalDate {
          constructor(dateString?: string | number | Date) {
            if (
              dateString !== undefined && dateString !== null &&
              dateString !== ""
            ) {
              super(dateString);
            } else {
              super(mockDate.toISOString());
            }
          }
        } as DateConstructor;

        await reservation.checkoutItem("user1", "Laptop", 1); // First checkout

        await assertRejects(
          () => reservation.checkoutItem("user1", "Laptop", 1), // Second checkout of the same item
          AlreadyCheckedOutError, // Use custom error
        );
      },
    );
  });

  await t.step("checkinItem method tests", async (t) => {
    await t.step(
      "successfully checks in a reserved item",
      async () => {
        await beforeEachStep(); // Manual setup for this test step
        const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7);
        const mockDate = new originalDate("2023-11-01T10:00:00Z");
        globalThis.Date = class extends originalDate {
          constructor(dateString?: string | number | Date) {
            if (
              dateString !== undefined && dateString !== null &&
              dateString !== ""
            ) {
              super(dateString);
            } else {
              super(mockDate.toISOString());
            }
          }
        } as DateConstructor;

        await reservation.checkoutItem("user1", "Mouse", 1); // Checkout an item first

        // Verify initial checkout state (sanity check)
        let { rows } = await readCsvForTest(inventoryCsvPath);
        let mouseRow = rows.find((r) => r[0] === "Mouse");
        assert(mouseRow !== undefined);
        assertEquals(mouseRow[2], "0");
        assertEquals(mouseRow[4], "user1");
        let reservationsMap = (reservation as any).reservations;
        assertEquals(reservationsMap.has("Mouse"), true);

        await reservation.checkinItem("Mouse"); // Now check it in

        // Verify in-memory reservation is gone
        assertEquals(reservationsMap.has("Mouse"), false);

        // Verify inventory.csv is updated
        ({ rows } = await readCsvForTest(inventoryCsvPath)); // Re-read
        mouseRow = rows.find((r) => r[0] === "Mouse");
        assert(mouseRow !== undefined);
        assertEquals(mouseRow[2], "1"); // Available should be 1
        assertEquals(mouseRow[4], ""); // LastKerb should be empty
      },
    );

    await t.step("throws error if item not found", async () => {
      await beforeEachStep(); // Manual setup for this test step
      const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
      await assertRejects(
        () => reservation.checkinItem("NonExistentItem"),
        ItemNotFoundError, // Use custom error
      );
    });

    await t.step(
      "throws error if item not currently checked out (no in-memory reservation)",
      async () => {
        await beforeEachStep(); // Manual setup for this test step
        const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
        // Keyboard is available in CSV, but not in reservation's in-memory map initially
        await assertRejects(
          () => reservation.checkinItem("Keyboard"),
          AlreadyCheckedOutError, // Use custom error
        );
      },
    );
  });

  await t.step("notifyCheckout method tests", async (t) => {
    await t.step("sends email for overdue items", async () => {
      await beforeEachStep(); // Manual setup for this test step
      const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7);
      const mockDateCheckout = new originalDate("2023-11-01T10:00:00Z"); // Checkout date
      globalThis.Date = class extends originalDate {
        constructor(dateString?: string | number | Date) {
          if (
            dateString !== undefined && dateString !== null && dateString !== ""
          ) {
            super(dateString);
          } else {
            super(mockDateCheckout.toISOString());
          }
        }
      } as DateConstructor;

      await reservation.checkoutItem("user1", "Laptop", 1);

      // Advance time to make item overdue (e.g., 8 days later)
      const mockDateOverdue = new originalDate("2023-11-09T10:00:00Z"); // Expiry date: 2023-11-08. So 2023-11-09 is overdue.
      globalThis.Date = class extends originalDate {
        constructor(dateString?: string | number | Date) {
          if (
            dateString !== undefined && dateString !== null && dateString !== ""
          ) {
            super(dateString);
          } else {
            super(mockDateOverdue.toISOString());
          }
        }
      } as DateConstructor;

      const capturedLogs: string[] = [];
      console.log = (...args: any[]) => capturedLogs.push(args.join(" "));

      const notifiedKerbs = await reservation.notifyCheckout();

      assertEquals(notifiedKerbs, ["user1"]);
      assertEquals(capturedLogs.length, 1);
      assertStringIncludes(capturedLogs[0], "sending email to user1");
      assertStringIncludes(capturedLogs[0], "Overdue item: Laptop");
      assertStringIncludes(capturedLogs[0], "due 2023-11-08"); // Expiry date

      // Verify inventory.csv and reservations map are not changed by notifyCheckout
      const { rows } = await readCsvForTest(inventoryCsvPath);
      const laptopRow = rows.find((r) => r[0] === "Laptop");
      assert(laptopRow !== undefined);
      assertEquals(laptopRow[2], "0"); // Still checked out
      assertEquals(laptopRow[4], "user1"); // Still user1
      const reservationsMap = (reservation as any).reservations;
      assertEquals(reservationsMap.has("Laptop"), true); // Still reserved in-memory
    });

    await t.step(
      "does not send email for non-overdue items",
      async () => {
        await beforeEachStep(); // Manual setup for this test step
        const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7);
        const mockDateCheckout = new originalDate("2023-11-01T10:00:00Z");
        globalThis.Date = class extends originalDate {
          constructor(dateString?: string | number | Date) {
            if (
              dateString !== undefined && dateString !== null &&
              dateString !== ""
            ) {
              super(dateString);
            } else {
              super(mockDateCheckout.toISOString());
            }
          }
        } as DateConstructor;

        await reservation.checkoutItem("user1", "Laptop", 1);

        // Advance time but not enough for it to be overdue (e.g., 5 days later)
        const mockDateNotOverdue = new originalDate("2023-11-06T10:00:00Z"); // Expiry is 2023-11-08. Still not overdue.
        globalThis.Date = class extends originalDate {
          constructor(dateString?: string | number | Date) {
            if (
              dateString !== undefined && dateString !== null &&
              dateString !== ""
            ) {
              super(dateString);
            } else {
              super(mockDateNotOverdue.toISOString());
            }
          }
        } as DateConstructor;

        const capturedLogs: string[] = [];
        console.log = (...args: any[]) => capturedLogs.push(args.join(" "));

        const notifiedKerbs = await reservation.notifyCheckout();

        assertEquals(notifiedKerbs.length, 0);
        assertEquals(capturedLogs.length, 0);

        // Verify inventory.csv and reservations map are not changed by notifyCheckout
        const { rows } = await readCsvForTest(inventoryCsvPath);
        const laptopRow = rows.find((r) => r[0] === "Laptop");
        assert(laptopRow !== undefined);
        assertEquals(laptopRow[2], "0");
        assertEquals(laptopRow[4], "user1");
        const reservationsMap = (reservation as any).reservations;
        assertEquals(reservationsMap.has("Laptop"), true);
      },
    );

    await t.step("handles multiple overdue items", async () => {
      await beforeEachStep(); // Manual setup for this test step
      const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7);
      const mockDateCheckout = new originalDate("2023-11-01T10:00:00Z");
      globalThis.Date = class extends originalDate {
        constructor(dateString?: string | number | Date) {
          if (
            dateString !== undefined && dateString !== null && dateString !== ""
          ) {
            super(dateString);
          } else {
            super(mockDateCheckout.toISOString());
          }
        }
      } as DateConstructor;

      // Checkout two items
      await reservation.checkoutItem("user1", "Laptop", 1);
      await reservation.checkoutItem("user1", "Keyboard", 1);

      // Advance time to make both overdue
      const mockDateOverdue = new originalDate("2023-11-09T10:00:00Z");
      globalThis.Date = class extends originalDate {
        constructor(dateString?: string | number | Date) {
          if (
            dateString !== undefined && dateString !== null && dateString !== ""
          ) {
            super(dateString);
          } else {
            super(mockDateOverdue.toISOString());
          }
        }
      } as DateConstructor;

      const capturedLogs: string[] = [];
      console.log = (...args: any[]) => capturedLogs.push(args.join(" "));

      const notifiedKerbs = await reservation.notifyCheckout();

      // The order of items iterated in a Map is insertion order, but `notifyCheckout` might not guarantee it
      // if other operations happened. Sort to ensure consistent comparison.
      assertEquals(notifiedKerbs.sort(), ["user1", "user1"].sort());
      assertEquals(capturedLogs.length, 2);

      const logMessages = capturedLogs.join("\n");
      assertStringIncludes(logMessages, "Overdue item: Laptop");
      assertStringIncludes(logMessages, "Overdue item: Keyboard");
      assertStringIncludes(logMessages, "sending email to user1");
      assertStringIncludes(logMessages, "due 2023-11-08"); // Expiry date based on initial mockDateCheckout + 7 days
    });
  });

  // --- Suite-level Teardown: Remove temporary files and ensure mocks are reset ---
  // Ensure Date and console.log are reset before cleaning up files, as a safety measure
  globalThis.Date = originalDate;
  console.log = originalConsoleLog;

  await teardownTestFiles(csvTempPaths); // Call the new teardown function
});

Deno.test("InventoryReservation System Test Suite (MongoDB)", async (t) => {
  // Removed `t.beforeEach()` and `t.afterEach()`.
  // Each `t.step` below now performs its own database setup and teardown
  // to ensure isolation and adherence to the prompt.

  // Nested step for all checkoutItem related tests
  await t.step("checkoutItem method error handling", async (t) => {
    // Each test step now manages its own DB connection and data population
    // to ensure isolation.

    await t.step(
      "successfully checks out an available item", // Added a positive test for completeness
      async () => {
        // --- Test-specific Setup ---
        const [db, client] = await testDb(); // Clean test DB for this test
        await populateInitialData(db); // Repopulate with initial data
        const r = new InventoryReservation(db);

        let kerb: string; // A valid kerb for testing
        let itemName: string; // A valid item for testing

        const testUser = await db.collection("users").findOne({
          role: "resident",
        });
        kerb = testUser?.kerb || "alice"; // Default if not found (should be via populateInitialData)
        if (!testUser) {
          // Ensure a resident user exists for checkout tests
          await db.collection("users").insertOne({
            ID: freshID(),
            kerb: "alice",
            first: "Alice",
            last: "Smith",
            role: "resident",
          });
          kerb = "alice";
        }

        const testItem = await db.collection("items").findOne({
          // Find an item that is available for checkout
          available: { $gt: 0 },
          lastCheckout: null,
        });
        itemName = testItem?.itemName || "Wireless Mouse"; // Default if not found
        if (!testItem) {
          // If initial data doesn't have an available item, create one
          await db.collection("items").insertOne({
            ID: freshID(),
            itemName: "Wireless Mouse",
            category: "Peripherals",
            tags: ["wireless"],
            available: 1,
            lastCheckout: null,
            lastKerb: null,
          });
          itemName = "Wireless Mouse";
        }
        // --- End Test-specific Setup ---

        try {
          // --- Test Logic ---
          await r.checkoutItem(kerb, itemName, 1);

          const itemAfterCheckout = await db.collection("items").findOne({
            itemName,
          });
          assertEquals(
            itemAfterCheckout?.available,
            0,
            "Item should be unavailable (0)",
          );
          assertEquals(
            itemAfterCheckout?.lastKerb,
            kerb,
            "lastKerb should be set to checking out user",
          );
          assert(
            itemAfterCheckout?.lastCheckout instanceof Date,
            "lastCheckout should be a Date object",
          );
        } finally {
          // --- Test-specific Teardown ---
          await client.close(); // Close client after this test step
        }
      },
    );

    // --- 1. Existing Failing Test (Refined with Custom Error) ---
    await t.step(
      "throws AlreadyCheckedOutError when attempting to double checkout the same item by the same user",
      async () => {
        // --- Test-specific Setup ---
        const [db, client] = await testDb();
        await populateInitialData(db);
        const r = new InventoryReservation(db);

        let kerb: string;
        let itemName: string;

        const testUser = await db.collection("users").findOne({
          role: "resident",
        });
        kerb = testUser?.kerb || "alice";
        if (!testUser) {
          await db.collection("users").insertOne({
            ID: freshID(),
            kerb: "alice",
            first: "Alice",
            last: "Smith",
            role: "resident",
          });
          kerb = "alice";
        }

        const testItem = await db.collection("items").findOne({
          available: { $gt: 0 },
          lastCheckout: null,
        });
        itemName = testItem?.itemName || "Wireless Mouse";
        if (!testItem) {
          await db.collection("items").insertOne({
            ID: freshID(),
            itemName: "Wireless Mouse",
            category: "Peripherals",
            tags: ["wireless"],
            available: 1,
            lastCheckout: null,
            lastKerb: null,
          });
          itemName = "Wireless Mouse";
        }
        // --- End Test-specific Setup ---

        try {
          // First, successfully check out the item
          await r.checkoutItem(kerb, itemName, 1);

          // Then, attempt to double checkout it
          await assertThrows(
            async () => {
              await r.checkoutItem(kerb, itemName, 1);
            },
            AlreadyCheckedOutError,
            undefined, // Rely on error type, not message
            "checkoutItem should throw AlreadyCheckedOutError when item is already checked out by the same user",
          );

          // Assert no additional side effects (e.g., negative available count)
          const itemAfterAttempt = await db.collection("items").findOne({
            itemName,
          });
          assertEquals(
            itemAfterAttempt?.available,
            0,
            "Item should still be unavailable (0)",
          );
        } finally {
          await client.close();
        }
      },
    );

    // --- 2. Item Not Found Error ---
    await t.step(
      "throws ItemNotFoundError when attempting to checkout a non-existent item",
      async () => {
        // --- Test-specific Setup ---
        const [db, client] = await testDb();
        await populateInitialData(db);
        const r = new InventoryReservation(db);

        let kerb: string;
        const testUser = await db.collection("users").findOne({
          role: "resident",
        });
        kerb = testUser?.kerb || "alice";
        if (!testUser) {
          await db.collection("users").insertOne({
            ID: freshID(),
            kerb: "alice",
            first: "Alice",
            last: "Smith",
            role: "resident",
          });
          kerb = "alice";
        }
        // --- End Test-specific Setup ---

        try {
          const nonExistentItem = "NonExistentGadget_XYZ";
          await assertThrows(
            async () => {
              await r.checkoutItem(kerb, nonExistentItem, 1);
            },
            ItemNotFoundError,
            undefined, // Rely on error type, not message
            "checkoutItem should throw ItemNotFoundError for a non-existent item",
          );
        } finally {
          await client.close();
        }
      },
    );

    // --- 3. Insufficient Quantity Error (and No Side Effects) ---
    await t.step(
      "throws InsufficientQuantityError when attempting to checkout more than available quantity and leaves state unchanged",
      async () => {
        // --- Test-specific Setup ---
        const [db, client] = await testDb();
        await populateInitialData(db);
        const r = new InventoryReservation(db);

        let kerb: string;
        const testUser = await db.collection("users").findOne({
          role: "resident",
        });
        kerb = testUser?.kerb || "alice";
        if (!testUser) {
          await db.collection("users").insertOne({
            ID: freshID(),
            kerb: "alice",
            first: "Alice",
            last: "Smith",
            role: "resident",
          });
          kerb = "alice";
        }
        // --- End Test-specific Setup ---

        try {
          const limitedItemName = "Keyboard"; // Assuming 'Keyboard' has `available: 2` initially
          const initialAvailable = 2;

          // Ensure the item exists with a specific available count for this test
          await db.collection("items").updateOne(
            { itemName: limitedItemName },
            {
              $set: {
                available: initialAvailable,
                lastCheckout: null,
                lastKerb: null,
              },
            },
            { upsert: true }, // Create if not exists
          );

          // Get initial state to verify no side effects
          const itemBeforeAttempt = await db.collection("items").findOne({
            itemName: limitedItemName,
          });
          assertEquals(
            itemBeforeAttempt?.available,
            initialAvailable,
            "Pre-condition: item available count should be correct",
          );

          await assertThrows(
            async () => {
              await r.checkoutItem(kerb, limitedItemName, initialAvailable + 1); // Request 3
            },
            InsufficientQuantityError,
            undefined, // Rely on error type, not message
            "checkoutItem should throw InsufficientQuantityError for insufficient quantity",
          );

          // Assert no side effects on error: available count should not have changed
          const itemAfterAttempt = await db.collection("items").findOne({
            itemName: limitedItemName,
          });
          assertEquals(
            itemAfterAttempt?.available,
            initialAvailable,
            "Item available count should remain unchanged after failed checkout",
          );
        } finally {
          await client.close();
        }
      },
    );

    // --- 4. Invalid Quantity Errors (Zero and Negative) ---
    await t.step(
      "throws InvalidQuantityError when attempting to checkout a zero quantity",
      async () => {
        // --- Test-specific Setup ---
        const [db, client] = await testDb();
        await populateInitialData(db);
        const r = new InventoryReservation(db);

        let kerb: string;
        let itemName: string;
        const testUser = await db.collection("users").findOne({
          role: "resident",
        });
        kerb = testUser?.kerb || "alice";
        if (!testUser) {
          await db.collection("users").insertOne({
            ID: freshID(),
            kerb: "alice",
            first: "Alice",
            last: "Smith",
            role: "resident",
          });
          kerb = "alice";
        }

        const testItem = await db.collection("items").findOne({
          available: { $gt: 0 },
          lastCheckout: null,
        });
        itemName = testItem?.itemName || "Wireless Mouse";
        if (!testItem) {
          await db.collection("items").insertOne({
            ID: freshID(),
            itemName: "Wireless Mouse",
            category: "Peripherals",
            tags: ["wireless"],
            available: 1,
            lastCheckout: null,
            lastKerb: null,
          });
          itemName = "Wireless Mouse";
        }
        // --- End Test-specific Setup ---

        try {
          await assertThrows(
            async () => {
              await r.checkoutItem(kerb, itemName, 0);
            },
            InvalidQuantityError,
            undefined, // Rely on error type, not message
            "checkoutItem should throw InvalidQuantityError for zero quantity",
          );
        } finally {
          await client.close();
        }
      },
    );

    await t.step(
      "throws InvalidQuantityError when attempting to checkout a negative quantity",
      async () => {
        // --- Test-specific Setup ---
        const [db, client] = await testDb();
        await populateInitialData(db);
        const r = new InventoryReservation(db);

        let kerb: string;
        let itemName: string;
        const testUser = await db.collection("users").findOne({
          role: "resident",
        });
        kerb = testUser?.kerb || "alice";
        if (!testUser) {
          await db.collection("users").insertOne({
            ID: freshID(),
            kerb: "alice",
            first: "Alice",
            last: "Smith",
            role: "resident",
          });
          kerb = "alice";
        }

        const testItem = await db.collection("items").findOne({
          available: { $gt: 0 },
          lastCheckout: null,
        });
        itemName = testItem?.itemName || "Wireless Mouse";
        if (!testItem) {
          await db.collection("items").insertOne({
            ID: freshID(),
            itemName: "Wireless Mouse",
            category: "Peripherals",
            tags: ["wireless"],
            available: 1,
            lastCheckout: null,
            lastKerb: null,
          });
          itemName = "Wireless Mouse";
        }
        // --- End Test-specific Setup ---

        try {
          await assertThrows(
            async () => {
              await r.checkoutItem(kerb, itemName, -1);
            },
            InvalidQuantityError,
            undefined, // Rely on error type, not message
            "checkoutItem should throw InvalidQuantityError for negative quantity",
          );
        } finally {
          await client.close();
        }
      },
    );

    // --- 5. Double Checkout by a Different User ---
    await t.step(
      "throws AlreadyCheckedOutError when attempting to double checkout an item by a different user",
      async () => {
        // --- Test-specific Setup ---
        const [db, client] = await testDb();
        await populateInitialData(db);
        const r = new InventoryReservation(db);

        let kerb: string;
        let itemName: string;
        const testUser = await db.collection("users").findOne({
          role: "resident",
        });
        kerb = testUser?.kerb || "alice";
        if (!testUser) {
          await db.collection("users").insertOne({
            ID: freshID(),
            kerb: "alice",
            first: "Alice",
            last: "Smith",
            role: "resident",
          });
          kerb = "alice";
        }

        const testItem = await db.collection("items").findOne({
          available: { $gt: 0 },
          lastCheckout: null,
        });
        itemName = testItem?.itemName || "Wireless Mouse";
        if (!testItem) {
          await db.collection("items").insertOne({
            ID: freshID(),
            itemName: "Wireless Mouse",
            category: "Peripherals",
            tags: ["wireless"],
            available: 1,
            lastCheckout: null,
            lastKerb: null,
          });
          itemName = "Wireless Mouse";
        }
        // --- End Test-specific Setup ---

        try {
          const otherKerb = "bob";
          // Ensure 'bob' user exists and is a resident for this test
          await db.collection("users").updateOne(
            { kerb: otherKerb },
            { $set: { first: "Bob", last: "Builder", role: "resident" } },
            { upsert: true },
          );

          // First, check out the item with the initial kerb
          await r.checkoutItem(kerb, itemName, 1);

          // Then, attempt to check it out with a different kerb
          await assertThrows(
            async () => {
              await r.checkoutItem(otherKerb, itemName, 1);
            },
            AlreadyCheckedOutError,
            undefined, // Rely on error type, not message
            "checkoutItem should throw AlreadyCheckedOutError when item is already checked out by another user",
          );
        } finally {
          await client.close();
        }
      },
    );

    // --- 6. User Not Found Error (if user validation is implemented) ---
    await t.step(
      "throws UserNotFoundError when attempting to checkout with a non-existent kerb",
      async () => {
        // --- Test-specific Setup ---
        const [db, client] = await testDb();
        await populateInitialData(db);
        const r = new InventoryReservation(db);
        let itemName: string;
        const testItem = await db.collection("items").findOne({
          available: { $gt: 0 },
          lastCheckout: null,
        });
        itemName = testItem?.itemName || "Wireless Mouse";
        if (!testItem) {
          await db.collection("items").insertOne({
            ID: freshID(),
            itemName: "Wireless Mouse",
            category: "Peripherals",
            tags: ["wireless"],
            available: 1,
            lastCheckout: null,
            lastKerb: null,
          });
          itemName = "Wireless Mouse";
        }
        // --- End Test-specific Setup ---

        try {
          const nonExistentKerb = "ghost_user";
          await assertThrows(
            async () => {
              await r.checkoutItem(nonExistentKerb, itemName, 1);
            },
            UserNotFoundError,
            undefined, // Rely on error type, not message
            "checkoutItem should throw UserNotFoundError when user does not exist",
          );
        } finally {
          await client.close();
        }
      },
    );
  });

  // Example: Grouping for checkinItem tests
  await t.step("checkinItem method error handling", async (t) => {
    // Each test step now manages its own DB connection and data population
    // to ensure isolation.

    await t.step("successfully checks in an item", async () => {
      // --- Test-specific Setup ---
      const [db, client] = await testDb();
      await populateInitialData(db);
      const r = new InventoryReservation(db);
      let kerb: string;
      let itemName: string;

      const testUser = await db.collection("users").findOne({
        role: "resident",
      });
      kerb = testUser?.kerb || "alice";
      if (!testUser) {
        await db.collection("users").insertOne({
          ID: freshID(),
          kerb: "alice",
          first: "Alice",
          last: "Smith",
          role: "resident",
        });
        kerb = "alice";
      }

      const testItem = await db.collection("items").findOne({
        available: { $gt: 0 },
        lastCheckout: null,
      });
      itemName = testItem?.itemName || "Wireless Mouse";
      if (!testItem) {
        await db.collection("items").insertOne({
          ID: freshID(),
          itemName: "Wireless Mouse",
          category: "Peripherals",
          tags: ["wireless"],
          available: 1,
          lastCheckout: null,
          lastKerb: null,
        });
        itemName = "Wireless Mouse";
      }
      // --- End Test-specific Setup ---

      try {
        // First, checkout the item
        await r.checkoutItem(kerb, itemName, 1);
        const itemAfterCheckout = await db.collection("items").findOne({
          itemName,
        });
        assertEquals(itemAfterCheckout?.available, 0);
        assert(itemAfterCheckout?.lastCheckout instanceof Date);
        assertEquals(itemAfterCheckout?.lastKerb, kerb);

        // Now, check it in
        await r.checkinItem(kerb, itemName, 1);
        const itemAfterCheckin = await db.collection("items").findOne({
          itemName,
        });
        assertEquals(itemAfterCheckin?.available, 1); // Should be back to original available
        assertEquals(itemAfterCheckin?.lastCheckout, null);
        assertEquals(itemAfterCheckin?.lastKerb, null);
      } finally {
        await client.close();
      }
    });

    await t.step("throws ItemNotFoundError if item not found", async () => {
      // --- Test-specific Setup ---
      const [db, client] = await testDb();
      await populateInitialData(db);
      const r = new InventoryReservation(db);
      let kerb: string;
      const testUser = await db.collection("users").findOne({
        role: "resident",
      });
      kerb = testUser?.kerb || "alice";
      if (!testUser) {
        await db.collection("users").insertOne({
          ID: freshID(),
          kerb: "alice",
          first: "Alice",
          last: "Smith",
          role: "resident",
        });
        kerb = "alice";
      }
      // --- End Test-specific Setup ---

      try {
        await assertRejects(
          () => r.checkinItem(kerb, "NonExistentItem", 1),
          ItemNotFoundError,
          // Removed specific error message
        );
      } finally {
        await client.close();
      }
    });

    await t.step(
      "throws AlreadyCheckedOutError if item not currently checked out",
      async () => {
        // --- Test-specific Setup ---
        const [db, client] = await testDb();
        await populateInitialData(db);
        const r = new InventoryReservation(db);
        let kerb: string;
        const testUser = await db.collection("users").findOne({
          role: "resident",
        });
        kerb = testUser?.kerb || "alice";
        if (!testUser) {
          await db.collection("users").insertOne({
            ID: freshID(),
            kerb: "alice",
            first: "Alice",
            last: "Smith",
            role: "resident",
          });
          kerb = "alice";
        }
        // --- End Test-specific Setup ---

        try {
          // Item 'Keyboard' is initially available=2 and not checked out
          const availableItem = "Keyboard";
          await db.collection("items").updateOne(
            { itemName: availableItem },
            { $set: { available: 2, lastCheckout: null, lastKerb: null } },
          );

          await assertRejects(
            () => r.checkinItem(kerb, availableItem, 1),
            AlreadyCheckedOutError,
            // Removed specific error message
          );
        } finally {
          await client.close();
        }
      },
    );

    await t.step("throws InvalidQuantityError for zero quantity", async () => {
      // --- Test-specific Setup ---
      const [db, client] = await testDb();
      await populateInitialData(db);
      const r = new InventoryReservation(db);
      let kerb: string;
      let itemName: string;
      const testUser = await db.collection("users").findOne({
        role: "resident",
      });
      kerb = testUser?.kerb || "alice";
      if (!testUser) {
        await db.collection("users").insertOne({
          ID: freshID(),
          kerb: "alice",
          first: "Alice",
          last: "Smith",
          role: "resident",
        });
        kerb = "alice";
      }

      const testItem = await db.collection("items").findOne({
        available: { $gt: 0 },
        lastCheckout: null,
      });
      itemName = testItem?.itemName || "Wireless Mouse";
      if (!testItem) {
        await db.collection("items").insertOne({
          ID: freshID(),
          itemName: "Wireless Mouse",
          category: "Peripherals",
          tags: ["wireless"],
          available: 1,
          lastCheckout: null,
          lastKerb: null,
        });
        itemName = "Wireless Mouse";
      }
      // --- End Test-specific Setup ---

      try {
        await r.checkoutItem(kerb, itemName, 1); // Checkout first to make it eligible for checkin
        await assertRejects(
          () => r.checkinItem(kerb, itemName, 0),
          InvalidQuantityError,
          // Removed specific error message
        );
      } finally {
        await client.close();
      }
    });

    await t.step(
      "throws InvalidQuantityError for negative quantity",
      async () => {
        // --- Test-specific Setup ---
        const [db, client] = await testDb();
        await populateInitialData(db);
        const r = new InventoryReservation(db);
        let kerb: string;
        let itemName: string;
        const testUser = await db.collection("users").findOne({
          role: "resident",
        });
        kerb = testUser?.kerb || "alice";
        if (!testUser) {
          await db.collection("users").insertOne({
            ID: freshID(),
            kerb: "alice",
            first: "Alice",
            last: "Smith",
            role: "resident",
          });
          kerb = "alice";
        }

        const testItem = await db.collection("items").findOne({
          available: { $gt: 0 },
          lastCheckout: null,
        });
        itemName = testItem?.itemName || "Wireless Mouse";
        if (!testItem) {
          await db.collection("items").insertOne({
            ID: freshID(),
            itemName: "Wireless Mouse",
            category: "Peripherals",
            tags: ["wireless"],
            available: 1,
            lastCheckout: null,
            lastKerb: null,
          });
          itemName = "Wireless Mouse";
        }
        // --- End Test-specific Setup ---

        try {
          await r.checkoutItem(kerb, itemName, 1); // Checkout first
          await assertRejects(
            () => r.checkinItem(kerb, itemName, -1),
            InvalidQuantityError,
            // Removed specific error message
          );
        } finally {
          await client.close();
        }
      },
    );
  });
});
```
