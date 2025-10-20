---
timestamp: 'Thu Oct 16 2025 01:19:32 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251016_011932.be1dbd74.md]]'
content_id: 34166cdfb90027011e7874a7c600dadd545cdb82a1504ab8d02ecbc1d83f517b
---

# response:

```typescript
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert";
// import { testDb } from "@utils/database.ts";
// import { ID } from "@utils/types.ts";
import { Reservation } from "../../../src/concepts/Reservation/inventoryreservation.ts";
// import * as path from "jsr:@std/mod";

// Helper functions for CSV manipulation in tests
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

// Temporary file paths (scoped to the test suite)
let inventoryCsvPath: string;
let usersCsvPath: string;

// Store original Date and console.log for restoration
let originalDate: DateConstructor;
let originalConsoleLog: typeof console.log;

Deno.test("Reservation System Test Suite", async (t) => {
  // --- Suite-level Setup: Create temporary files once ---
  originalDate = globalThis.Date; // Capture original Date constructor
  originalConsoleLog = console.log; // Capture original console.log

  inventoryCsvPath = await Deno.makeTempFile({
    prefix: "inventory_",
    suffix: ".csv",
  });
  usersCsvPath = await Deno.makeTempFile({ prefix: "users_", suffix: ".csv" });

  // --- Helper to reset file content and mocks for each test step ---
  const beforeEachStep = async () => {
    // Reset CSV files to their initial content for test isolation
    await writeCsvForTest(inventoryCsvPath, initialInventoryCsvContent);
    await writeCsvForTest(usersCsvPath, initialUsersCsvContent);
    // Restore global mocks to ensure clean state for the next test
    globalThis.Date = originalDate;
    console.log = originalConsoleLog;
  };

  // --- Individual test steps ---

  await t.step(
    "checkoutItem: successfully checks out an available item",
    async () => {
      await beforeEachStep();
      const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7); // 7 days duration

      const mockDate = new originalDate("2023-11-01T10:00:00Z");
      globalThis.Date = class extends originalDate {
        constructor(dateString?: string | number | Date) {
          if (dateString !== undefined && dateString !== null && dateString !== "") {
            super(dateString);
          } else {
            super(mockDate.toISOString()); 
          }
        }
      } as DateConstructor;

      await reservation.checkoutItem("user1", "Keyboard");

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

      // Verify inventory.csv
      const { rows } = await readCsvForTest(inventoryCsvPath);
      const keyboardRow = rows.find((r) => r[0] === "Keyboard"); // ItemName is 0th column
      assert(keyboardRow !== undefined);
      assertEquals(keyboardRow[2], "0"); // Available
      assertEquals(keyboardRow[3], "2023-11-08"); // LastCheckout (YYYY-MM-DD for 7 days from mockDate)
      assertEquals(keyboardRow[4], "user1"); // LastKerb
    },
  );

  await t.step("checkoutItem: throws error if item not found", async () => {
    await beforeEachStep();
    const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
    await assertRejects(
      () => reservation.checkoutItem("user1", "NonExistentItem"),
      Error,
      "Item not found: NonExistentItem",
    );
  });

  await t.step("checkoutItem: throws error if kerb not found", async () => {
    await beforeEachStep();
    const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
    await assertRejects(
      () => reservation.checkoutItem("nonexistent", "Keyboard"),
      Error,
      "Kerb not found: nonexistent",
    );
  });

  await t.step(
    "checkoutItem: throws error if kerb is not a resident",
    async () => {
      await beforeEachStep();
      const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
      await assertRejects(
        () => reservation.checkoutItem("user2", "Keyboard"),
        Error,
        "Kerb is not a resident: user2",
      );
      await assertRejects(
        () => reservation.checkoutItem("admin", "Keyboard"),
        Error,
        "Kerb is not a resident: admin",
      );
    },
  );

  await t.step(
    "checkoutItem: throws error if item already checked out (CSV)",
    async () => {
      await beforeEachStep();
      const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
      // Monitor is initially set to Available=0 in initialInventoryCsvContent
      await assertRejects(
        () => reservation.checkoutItem("user1", "Monitor"),
        Error,
        "Item already checked out: Monitor",
      );
    },
  );

  await t.step(
    "checkoutItem: throws error if item already checked out (in-memory)",
    async () => {
      await beforeEachStep();
      const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
      const mockDate = new originalDate("2023-11-01T10:00:00Z");
      globalThis.Date = class extends originalDate {
        constructor(dateString?: string | number | Date) {
          if (dateString !== undefined && dateString !== null && dateString !== "") {
            super(dateString);
          } else {
            super(mockDate.toISOString()); 
          }
        }
      } as DateConstructor;

      await reservation.checkoutItem("user1", "Laptop"); // First checkout

      await assertRejects(
        () => reservation.checkoutItem("user1", "Laptop"), // Second checkout of the same item
        Error,
        "Item already checked out: Laptop",
      );
    },
  );

  await t.step(
    "checkinItem: successfully checks in a reserved item",
    async () => {
      await beforeEachStep();
      const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7);
      const mockDate = new originalDate("2023-11-01T10:00:00Z");
      globalThis.Date = class extends originalDate {
        constructor(dateString?: string | number | Date) {
          if (dateString !== undefined && dateString !== null && dateString !== "") {
            super(dateString);
          } else {
            super(mockDate.toISOString()); 
          }
        }
      } as DateConstructor;

      await reservation.checkoutItem("user1", "Mouse"); // Checkout an item first

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

  await t.step("checkinItem: throws error if item not found", async () => {
    await beforeEachStep();
    const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
    await assertRejects(
      () => reservation.checkinItem("NonExistentItem"),
      Error,
      "Item not found: NonExistentItem",
    );
  });

  await t.step(
    "checkinItem: throws error if item not currently checked out (no in-memory reservation)",
    async () => {
      await beforeEachStep();
      const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
      // Keyboard is available in CSV, but not in reservation's in-memory map initially
      await assertRejects(
        () => reservation.checkinItem("Keyboard"),
        Error,
        "Item is not currently checked out: Keyboard",
      );
    },
  );

  await t.step("notifyCheckout: sends email for overdue items", async () => {
    await beforeEachStep();
    const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7);
    const mockDateCheckout = new originalDate("2023-11-01T10:00:00Z"); // Checkout date
    globalThis.Date = class extends originalDate {
      constructor(dateString?: string | number | Date) {
        if (dateString !== undefined && dateString !== null && dateString !== "") {
          super(dateString);
        } else {
          super(mockDateCheckout.toISOString()); 
        }
      }
    } as DateConstructor;

    await reservation.checkoutItem("user1", "Laptop");

    // Advance time to make item overdue (e.g., 8 days later)
    const mockDateOverdue = new originalDate("2023-11-09T10:00:00Z"); // Expiry date: 2023-11-08. So 2023-11-09 is overdue.
    globalThis.Date = class extends originalDate {
      constructor(dateString?: string | number | Date) {
        if (dateString !== undefined && dateString !== null && dateString !== "") {
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
    "notifyCheckout: does not send email for non-overdue items",
    async () => {
      await beforeEachStep();
      const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7);
      const mockDateCheckout = new originalDate("2023-11-01T10:00:00Z");
      globalThis.Date = class extends originalDate {
        constructor(dateString?: string | number | Date) {
          if (dateString !== undefined && dateString !== null && dateString !== "") {
            super(dateString);
          } else {
            super(mockDateCheckout.toISOString()); 
          }
        }
      } as DateConstructor;

      await reservation.checkoutItem("user1", "Laptop");

      // Advance time but not enough for it to be overdue (e.g., 5 days later)
      const mockDateNotOverdue = new originalDate("2023-11-06T10:00:00Z"); // Expiry is 2023-11-08. Still not overdue.
      globalThis.Date = class extends originalDate {
        constructor(dateString?: string | number | Date) {
          if (dateString !== undefined && dateString !== null && dateString !== "") {
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

  await t.step("notifyCheckout: handles multiple overdue items", async () => {
    await beforeEachStep();
    const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7);
    const mockDateCheckout = new originalDate("2023-11-01T10:00:00Z");
    globalThis.Date = class extends originalDate {
      constructor(dateString?: string | number | Date) {
        if (dateString !== undefined && dateString !== null && dateString !== "") {
          super(dateString);
        } else {
          super(mockDateCheckout.toISOString()); 
        }
      }
    } as DateConstructor;

    // Checkout two items
    await reservation.checkoutItem("user1", "Laptop");
    await reservation.checkoutItem("user1", "Keyboard");

    // Advance time to make both overdue
    const mockDateOverdue = new originalDate("2023-11-09T10:00:00Z");
    globalThis.Date = class extends originalDate {
      constructor(dateString?: string | number | Date) {
        if (dateString !== undefined && dateString !== null && dateString !== "") {
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

  // --- Suite-level Teardown: Remove temporary files and ensure mocks are reset ---
  // Ensure Date and console.log are reset before cleaning up files, as a safety measure
  // in case a test step failed to clean up its mocks in its finally block.
  globalThis.Date = originalDate;
  console.log = originalConsoleLog;

  await Deno.remove(inventoryCsvPath);
  await Deno.remove(usersCsvPath);
});
```
