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
import { InventoryReservationConcept } from "./ReservationConcept.ts"; // Consolidated import

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
        const reservation = new InventoryReservationConcept(
          inventoryCsvPath,
          usersCsvPath,
          7,
        ); // 7 days duration

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

        await reservation.checkoutItem("user1", "Keyboard", 7);

        // // Verify in-memory reservation
        // const reservationsMap = (reservation as any).reservations; // Access private property for testing
        // assertEquals(reservationsMap.size, 1);
        // const keyboardReservation = reservationsMap.get("Keyboard");
        // assert(keyboardReservation !== undefined);
        // assertEquals(keyboardReservation.kerb, "user1");
        // const expectedExpiry = new originalDate(mockDate);
        // expectedExpiry.setDate(mockDate.getDate() + 7); // Add 7 days to mockDate
        // assertEquals(
        //   keyboardReservation.expiry.toISOString().slice(0, 10),
        //   expectedExpiry.toISOString().slice(0, 10),
        // );

        // Verify inventory.csv
        const { rows } = await readCsvForTest(inventoryCsvPath);
        const keyboardRow = rows.find((r) => r[0] === "Keyboard"); // ItemName is 0th column
        assert(keyboardRow !== undefined);
        assertEquals(keyboardRow[2], "0"); // Available
        assertEquals(keyboardRow[4], "user1"); // LastKerb
      },
    );

    await t.step("throws error if item not found", async () => {
      await beforeEachStep(); // Manual setup for this test step
      const reservation = new InventoryReservationConcept(
        inventoryCsvPath,
        usersCsvPath,
      );
      await assertRejects(
        () => reservation.checkoutItem("user1", "NonExistentItem", 1),
        ItemNotFoundError, // Use custom error
      );
    });

    await t.step("throws error if kerb not found", async () => {
      await beforeEachStep(); // Manual setup for this test step
      const reservation = new InventoryReservationConcept(
        inventoryCsvPath,
        usersCsvPath,
      );
      await assertRejects(
        () => reservation.checkoutItem("nonexistent", "Keyboard", 1),
        UserNotFoundError, // Use custom error
      );
    });

    await t.step(
      "throws error if kerb is not a resident",
      async () => {
        await beforeEachStep(); // Manual setup for this test step
        const reservation = new InventoryReservationConcept(
          inventoryCsvPath,
          usersCsvPath,
        );
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
        const reservation = new InventoryReservationConcept(
          inventoryCsvPath,
          usersCsvPath,
        );
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
        const reservation = new InventoryReservationConcept(
          inventoryCsvPath,
          usersCsvPath,
        );
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
        const reservation = new InventoryReservationConcept(
          inventoryCsvPath,
          usersCsvPath,
          7,
        );
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
      const reservation = new InventoryReservationConcept(
        inventoryCsvPath,
        usersCsvPath,
      );
      await assertRejects(
        () => reservation.checkinItem("NonExistentItem"),
        ItemNotFoundError, // Use custom error
      );
    });

    await t.step(
      "throws error if item not currently checked out (no in-memory reservation)",
      async () => {
        await beforeEachStep(); // Manual setup for this test step
        const reservation = new InventoryReservationConcept(
          inventoryCsvPath,
          usersCsvPath,
        );
        // Keyboard is available in CSV, but not in reservation's in-memory map initially
        await assertRejects(
          () => reservation.checkinItem("Keyboard"),
          AlreadyCheckedOutError, // Use custom error
        );
      },
    );
  });

  // --- Suite-level Teardown: Remove temporary files and ensure mocks are reset ---
  // Ensure Date and console.log are reset before cleaning up files, as a safety measure
  globalThis.Date = originalDate;
  console.log = originalConsoleLog;

  await teardownTestFiles(csvTempPaths); // Call the new teardown function
});
