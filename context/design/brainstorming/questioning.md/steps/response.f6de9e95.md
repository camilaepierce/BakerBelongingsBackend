---
timestamp: 'Wed Oct 15 2025 15:31:47 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251015_153147.8d921cc6.md]]'
content_id: f6de9e956a152acb05c1e30d39c657f6c0221e259e42fa064d033e0b462d1a82
---

# response:

The following test suite implements comprehensive tests for the `Reservation` class. It uses Deno's built-in testing utilities (`Deno.test`, `assertEquals`, `assertRejects`, `assertStringIncludes`, `assert`) and mocks `Date` and `console.log` for controlled testing environments. Temporary CSV files are created for each test run to ensure isolation.

**To run these tests:**

1. **Save the provided `inventoryreservation.ts` file** in `src/concepts/Reservation/inventoryreservation.ts`.
2. **Create dummy files** `src/concepts/Reservation/gemini-llm.ts` and `src/concepts/Reservation/inventoryviewer.ts` to satisfy imports in `inventoryreservation.ts` (as they are not part of the `Reservation` concept being tested).
   * `src/concepts/Reservation/gemini-llm.ts`:
     ```typescript
     // Dummy file to satisfy import in inventoryreservation.ts
     export class GeminiLLM {}
     ```
   * `src/concepts/Reservation/inventoryviewer.ts`:
     ```typescript
     // Dummy file to satisfy import in inventoryreservation.ts
     export interface Item {
       itemName: string;
       category: string;
       available: boolean;
       lastCheckout?: string;
       lastKerb?: string;
     }
     export class InventoryViewer {}
     ```
3. **Save the test code** below as `test/concepts/Reservation/inventoryreservation_test.ts`.
4. **Run the tests** from your terminal:
   ```bash
   deno test --allow-read --allow-write --allow-env test/concepts/Reservation/inventoryreservation_test.ts
   ```
   (The `--allow-env` is typically needed for `Deno.makeTempFile` on some systems, though `--allow-read --allow-write` are the primary permissions.)

***

### `src/concepts/Reservation/inventoryreservation.ts` (Modified)

I've removed the unused imports `GeminiLLM` and `InventoryViewer` from the `inventoryreservation.ts` to prevent compilation issues, as they are not part of the `Reservation` class's direct functionality under test and were causing module not found errors. The `Item` interface is still defined directly in `inventoryreservation.ts` for type safety in `checkoutItem`.

```typescript
import { promises as fs } from "fs";
import * as path from "path";

// Removed: import { GeminiLLM } from "./gemini-llm";
// Removed: import { InventoryViewer, Item } from "./inventoryviewer";

// Item interface needed for method signature and internal use
export interface Item {
  itemName: string;
  category: string;
  available: boolean;
  lastCheckout?: string;
  lastKerb?: string;
}

/**
 * Reservation
 * - Operates directly on CSV files (inventory.csv and users.csv)
 * - Keeps an in-memory map of current reservations (itemName -> {kerb, expiry})
 * - Does not access InventoryViewer internals (representation independent)
 */
export class Reservation {
  private inventoryPath: string;
  private usersPath: string;
  private reservations: Map<string, { kerb: string; expiry: Date }> = new Map();
  private defaultDays: number;

  constructor(
    inventoryCsvPath?: string,
    usersCsvPath?: string,
    defaultDurationDays = 14,
  ) {
    this.inventoryPath = inventoryCsvPath ??
      path.resolve(__dirname, "inventory.csv");
    this.usersPath = usersCsvPath ?? path.resolve(__dirname, "users.csv");
    this.defaultDays = defaultDurationDays;
  }

  /**
   * Checkout an item for a kerb (kerb must be a resident).
   * item can be an Item object or an itemName string.
   * Effects: sets Available=0, sets LastCheckout to the expiry date (ISO Y-M-D), sets LastKerb to the kerb,
   * and records an in-memory expiry for notifyCheckout.
   */
  async checkoutItem(
    kerb: string,
    item: string | Item,
    durationDays?: number,
  ): Promise<void> {
    const itemName = typeof item === "string" ? item : item.itemName;
    const user = await this.findUser(kerb);
    if (!user) throw new Error(`Kerb not found: ${kerb}`);
    if (!user.role || user.role.toLowerCase() !== "resident") {
      throw new Error(`Kerb is not a resident: ${kerb}`);
    }

    const { header, rows } = await this.readCsv(this.inventoryPath);
    const idxItemName = this.colIndex(header, "ItemName");
    const idxAvailable = this.colIndex(header, "Available");
    const idxLastCheckout = this.colIndex(header, "LastCheckout");
    const idxLastKerb = this.colIndex(header, "LastKerb");

    if (idxItemName < 0) {
      throw new Error("inventory.csv missing ItemName column");
    }

    const rowIdx = rows.findIndex((r) =>
      (r[idxItemName] || "").toLowerCase() === itemName.toLowerCase()
    );
    if (rowIdx === -1) throw new Error(`Item not found: ${itemName}`);
    // If the inventory row indicates the item is not available, treat as already checked out
    if (idxAvailable >= 0) {
      const availVal = (rows[rowIdx][idxAvailable] || "").toString().trim();
      if (availVal === "0" || availVal.toLowerCase() === "false") {
        throw new Error(`Item already checked out: ${itemName}`);
      }
    }

    // Also guard against double-reserving in-memory
    if (this.reservations.has(itemName)) {
      const rec = this.reservations.get(itemName)!;
      // Only throw if the existing reservation is still active
      if (rec && rec.expiry > new Date()) { 
        throw new Error(`Item already checked out: ${itemName}`);
      }
    }
    const days = durationDays ?? this.defaultDays;
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);

    if (idxAvailable >= 0) rows[rowIdx][idxAvailable] = "0";
    if (idxLastCheckout >= 0) {
      rows[rowIdx][idxLastCheckout] = expiry.toISOString().slice(0, 10);
    }
    if (idxLastKerb >= 0) rows[rowIdx][idxLastKerb] = kerb;

    await this.writeCsv(this.inventoryPath, header, rows);

    this.reservations.set(itemName, { kerb, expiry });
  }

  /**
   * Check an item back in. Removes in-memory reservation and marks item Available=1 in inventory.csv
   */
  async checkinItem(item: string | Item): Promise<void> {
    const itemName = typeof item === "string" ? item : item.itemName;
    const { header, rows } = await this.readCsv(this.inventoryPath);
    const idxItemName = this.colIndex(header, "ItemName");
    const idxAvailable = this.colIndex(header, "Available");
    const idxLastKerb = this.colIndex(header, "LastKerb");

    if (idxItemName < 0) {
      throw new Error("inventory.csv missing ItemName column");
    }

    const rowIdx = rows.findIndex((r) =>
      (r[idxItemName] || "").toLowerCase() === itemName.toLowerCase()
    );
    if (rowIdx === -1) throw new Error(`Item not found: ${itemName}`);

    // Only allow checkin if we have a reservation recorded
    if (!this.reservations.has(itemName)) {
      throw new Error(`Item is not currently checked out: ${itemName}`);
    }

    if (idxAvailable >= 0) rows[rowIdx][idxAvailable] = "1";
    if (idxLastKerb >= 0) rows[rowIdx][idxLastKerb] = "";

    await this.writeCsv(this.inventoryPath, header, rows);

    this.reservations.delete(itemName);
  }

  /**
   * Notify users with expired reservations. For now this is a stub that logs the message and returns the list
   * of kerbs that were notified. It does not remove reservations (that is handled by checkinItem).
   */
  async notifyCheckout(): Promise<string[]> {
    const now = new Date();
    const notified: string[] = [];
    for (const [itemName, rec] of Array.from(this.reservations.entries())) {
      if (rec.expiry <= now) {
        // best-effort: find user and send a notification
        await this.sendEmail(
          rec.kerb,
          `Overdue item: ${itemName}`,
          `Please return ${itemName} which was due ${
            rec.expiry.toISOString().slice(0, 10)
          }.`,
        );
        notified.push(rec.kerb);
      }
    }
    return notified;
  }

  /* ======= CSV + user helpers (self-contained) ======= */
  private async readCsv(
    p: string,
  ): Promise<{ header: string[]; rows: string[][] }> {
    const raw = await fs.readFile(p, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { header: [], rows: [] };
    const header = lines[0].split(",").map((h) => h.trim());
    const rows: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
      rows.push(this.parseCsvLine(lines[i]));
    }
    return { header, rows };
  }

  private async writeCsv(
    p: string,
    header: string[],
    rows: string[][],
  ): Promise<void> {
    const lines: string[] = [header.join(",")];
    for (const r of rows) {
      lines.push(r.map((c) => this.escapeCsv(c ?? "")).join(","));
    }
    await fs.writeFile(p, lines.join("\n"), "utf8");
  }

  private parseCsvLine(line: string): string[] {
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

  private escapeCsv(s: string): string {
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  private colIndex(header: string[], name: string): number {
    return header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  }

  private async findUser(
    kerb: string,
  ): Promise<
    { kerb: string; first?: string; last?: string; role?: string } | null
  > {
    const raw = await fs.readFile(this.usersPath, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return null;
    const header = lines[0].split(",").map((h) => h.trim());
    const rows = lines.slice(1).map((l) => this.parseCsvLine(l));
    const idxKerb = this.colIndex(header, "kerb");
    const idxFirst = this.colIndex(header, "first");
    const idxLast = this.colIndex(header, "last");
    const idxRole = this.colIndex(header, "role");
    if (idxKerb < 0) return null;
    const row = rows.find((r) =>
      (r[idxKerb] || "").toLowerCase() === kerb.toLowerCase()
    );
    if (!row) return null;
    return {
      kerb: row[idxKerb] || "",
      first: row[idxFirst] || "",
      last: row[idxLast] || "",
      role: row[idxRole] || "",
    };
  }

  private async sendEmail(
    kerb: string,
    subject: string,
    body: string,
  ): Promise<void> {
    // stubbed email sender; in real deployments replace with actual email transport
    console.log(`Reservation: sending email to ${kerb} — ${subject}\n${body}`);
  }
}

```

### `test/concepts/Reservation/inventoryreservation_test.ts`

```typescript
import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assert,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Reservation } from "../../../src/concepts/Reservation/inventoryreservation.ts";
import * as path from "https://deno.land/std@0.208.0/path/mod.ts";

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
const initialInventoryCsvContent = `ItemName,Category,Available,LastCheckout,LastKerb
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

  await t.step("checkoutItem: successfully checks out an available item", async () => {
    await beforeEachStep();
    const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7); // 7 days duration

    const mockDate = new originalDate("2023-11-01T10:00:00Z");
    globalThis.Date = class extends originalDate {
      constructor(dateString?: string | number | Date) {
        return dateString ? super(dateString) : mockDate;
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
    assertEquals(keyboardReservation.expiry.toISOString().slice(0, 10), expectedExpiry.toISOString().slice(0, 10));

    // Verify inventory.csv
    const { rows } = await readCsvForTest(inventoryCsvPath);
    const keyboardRow = rows.find((r) => r[0] === "Keyboard"); // ItemName is 0th column
    assert(keyboardRow !== undefined);
    assertEquals(keyboardRow[2], "0"); // Available
    assertEquals(keyboardRow[3], "2023-11-08"); // LastCheckout (YYYY-MM-DD for 7 days from mockDate)
    assertEquals(keyboardRow[4], "user1"); // LastKerb
  });

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

  await t.step("checkoutItem: throws error if kerb is not a resident", async () => {
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
  });

  await t.step("checkoutItem: throws error if item already checked out (CSV)", async () => {
    await beforeEachStep();
    const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
    // Monitor is initially set to Available=0 in initialInventoryCsvContent
    await assertRejects(
      () => reservation.checkoutItem("user1", "Monitor"),
      Error,
      "Item already checked out: Monitor",
    );
  });

  await t.step("checkoutItem: throws error if item already checked out (in-memory)", async () => {
    await beforeEachStep();
    const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
    const mockDate = new originalDate("2023-11-01T10:00:00Z");
    globalThis.Date = class extends originalDate {
      constructor(dateString?: string | number | Date) {
        return dateString ? super(dateString) : mockDate;
      }
    } as DateConstructor;

    await reservation.checkoutItem("user1", "Laptop"); // First checkout

    await assertRejects(
      () => reservation.checkoutItem("user1", "Laptop"), // Second checkout of the same item
      Error,
      "Item already checked out: Laptop",
    );
  });

  await t.step("checkinItem: successfully checks in a reserved item", async () => {
    await beforeEachStep();
    const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7);
    const mockDate = new originalDate("2023-11-01T10:00:00Z");
    globalThis.Date = class extends originalDate {
      constructor(dateString?: string | number | Date) {
        return dateString ? super(dateString) : mockDate;
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
  });

  await t.step("checkinItem: throws error if item not found", async () => {
    await beforeEachStep();
    const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
    await assertRejects(
      () => reservation.checkinItem("NonExistentItem"),
      Error,
      "Item not found: NonExistentItem",
    );
  });

  await t.step("checkinItem: throws error if item not currently checked out (no in-memory reservation)", async () => {
    await beforeEachStep();
    const reservation = new Reservation(inventoryCsvPath, usersCsvPath);
    // Keyboard is available in CSV, but not in reservation's in-memory map initially
    await assertRejects(
      () => reservation.checkinItem("Keyboard"),
      Error,
      "Item is not currently checked out: Keyboard",
    );
  });

  await t.step("notifyCheckout: sends email for overdue items", async () => {
    await beforeEachStep();
    const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7);
    const mockDateCheckout = new originalDate("2023-11-01T10:00:00Z"); // Checkout date
    globalThis.Date = class extends originalDate {
      constructor(dateString?: string | number | Date) {
        return dateString ? super(dateString) : mockDateCheckout;
      }
    } as DateConstructor;

    await reservation.checkoutItem("user1", "Laptop");

    // Advance time to make item overdue (e.g., 8 days later)
    const mockDateOverdue = new originalDate("2023-11-09T10:00:00Z"); // Expiry date: 2023-11-08. So 2023-11-09 is overdue.
    globalThis.Date = class extends originalDate {
      constructor(dateString?: string | number | Date) {
        return dateString ? super(dateString) : mockDateOverdue;
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

  await t.step("notifyCheckout: does not send email for non-overdue items", async () => {
    await beforeEachStep();
    const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7);
    const mockDateCheckout = new originalDate("2023-11-01T10:00:00Z");
    globalThis.Date = class extends originalDate {
      constructor(dateString?: string | number | Date) {
        return dateString ? super(dateString) : mockDateCheckout;
      }
    } as DateConstructor;

    await reservation.checkoutItem("user1", "Laptop");

    // Advance time but not enough for it to be overdue (e.g., 5 days later)
    const mockDateNotOverdue = new originalDate("2023-11-06T10:00:00Z"); // Expiry is 2023-11-08. Still not overdue.
    globalThis.Date = class extends originalDate {
      constructor(dateString?: string | number | Date) {
        return dateString ? super(dateString) : mockDateNotOverdue;
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
  });

  await t.step("notifyCheckout: handles multiple overdue items", async () => {
    await beforeEachStep();
    const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7);
    const mockDateCheckout = new originalDate("2023-11-01T10:00:00Z");
    globalThis.Date = class extends originalDate {
      constructor(dateString?: string | number | Date) {
        return dateString ? super(dateString) : mockDateCheckout;
      }
    } as DateConstructor;

    // Checkout two items
    await reservation.checkoutItem("user1", "Laptop");
    await reservation.checkoutItem("user1", "Keyboard");

    // Advance time to make both overdue
    const mockDateOverdue = new originalDate("2023-11-09T10:00:00Z");
    globalThis.Date = class extends originalDate {
      constructor(dateString?: string | number | Date) {
        return dateString ? super(dateString) : mockDateOverdue;
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
