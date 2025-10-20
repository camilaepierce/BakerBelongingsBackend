---
timestamp: 'Wed Oct 15 2025 15:24:32 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251015_152432.8049d689.md]]'
content_id: 76446056b770e2e6ebe5139f2678f82c166c643e603e1ecf6c512f3a33856546
---

# response:

To implement a comprehensive test suite for the `Reservation` class, we will use `jest` and focus on:

1. **Isolation**: Each test will operate on its own temporary CSV files to prevent side effects between tests.
2. **Mocks**: We'll mock `Date` objects and `console.log` (for `sendEmail` output) to control time-sensitive logic and verify notifications.
3. **Concept Adherence**: Directly test the `checkoutItem` and `notifyCheckout` actions, along with the `checkinItem` which is a critical inverse operation.

**Dependencies (package.json):**
Make sure you have `jest`, `ts-jest`, `@types/jest`, `typescript` installed.

```json
{
  "devDependencies": {
    "@types/jest": "^29.5.x",
    "jest": "^29.5.x",
    "ts-jest": "^29.1.x",
    "typescript": "^5.x.x"
  },
  "scripts": {
    "test": "jest"
  }
}
```

**`jest.config.js` (or `jest.config.ts`):**

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Ensure that source files are transformed
  transform: {
    '^.+\\.ts?$': 'ts-jest',
  },
  // Point to the test files
  testMatch: ['**/__tests__/**/*.test.ts'],
};
```

***

**`src/concepts/Reservation/__tests__/reservation.test.ts`**

```typescript
import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
import { Reservation } from "../inventoryreservation";
import { Item } from "../inventoryviewer"; // Assuming Item is exported from inventoryviewer

// Helper function to create temporary CSV files for tests
async function createTempCsv(
  dir: string,
  filename: string,
  content: string,
): Promise<string> {
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

// Helper function to read CSV content
async function readCsvFile(filePath: string): Promise<{
  header: string[];
  rows: string[][];
}> {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split(",").map((h) => h.trim());
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    // A simplified parser for testing; Reservation class has its own private parseCsvLine
    rows.push(lines[i].split(",").map((c) => c.trim()));
  }
  return { header, rows };
}

describe("Reservation System", () => {
  let tempDir: string;
  let inventoryCsvPath: string;
  let usersCsvPath: string;
  let reservation: Reservation;
  let mockSendEmail: jest.SpyInstance;
  const DEFAULT_DAYS = 14;

  const initialInventoryContent = `ItemName,Description,Available,LastCheckout,LastKerb
Laptop A,High-performance laptop,1,,
Monitor B,24-inch display,1,,
Keyboard C,Mechanical keyboard,0,2023-10-26,user1
Webcam D,HD Webcam,1,,
Mouse E,Ergonomic mouse,1,,
`;

  const initialUsersContent = `kerb,first,last,role
resident1,John,Doe,Resident
nonresident1,Jane,Smith,Faculty
user1,Alice,Brown,Resident
user2,Bob,White,Resident
`;

  beforeEach(async () => {
    // Create a unique temporary directory for each test suite run
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reservation-test-"));
    inventoryCsvPath = await createTempCsv(
      tempDir,
      "inventory.csv",
      initialInventoryContent,
    );
    usersCsvPath = await createTempCsv(
      tempDir,
      "users.csv",
      initialUsersContent,
    );

    // Initialize Reservation with temporary file paths
    reservation = new Reservation(inventoryCsvPath, usersCsvPath, DEFAULT_DAYS);

    // Mock the private sendEmail method
    // We need to cast `reservation` to `any` to access private members for spying
    mockSendEmail = jest
      .spyOn(reservation as any, "sendEmail")
      .mockImplementation(async (kerb, subject, body) => {
        // console.log(`MOCK EMAIL SENT TO ${kerb}: ${subject} - ${body}`);
      });

    // Use fake timers to control Date for predictable expiry calculations
    jest.useFakeTimers();
  });

  afterEach(async () => {
    // Restore original timers
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    // Clean up temporary directory and files
    await fs.rm(tempDir, { recursive: true, force: true });
    // Clear all mocks after each test
    jest.clearAllMocks();
  });

  // Helper to read inventory CSV and find a specific item row
  async function getInventoryItemRow(
    itemName: string,
  ): Promise<Record<string, string> | null> {
    const { header, rows } = await readCsvFile(inventoryCsvPath);
    const itemIdx = header.findIndex((h) => h.toLowerCase() === "itemname");
    if (itemIdx === -1) return null;

    const rowData = rows.find(
      (r) => (r[itemIdx] || "").toLowerCase() === itemName.toLowerCase(),
    );
    if (!rowData) return null;

    const itemRecord: Record<string, string> = {};
    header.forEach((h, i) => {
      itemRecord[h] = rowData[i] || "";
    });
    return itemRecord;
  }

  describe("checkoutItem(kerb: String, item: Item)", () => {
    // Set a consistent current date for testing
    const fixedCurrentDate = new Date("2024-03-10T10:00:00.000Z"); // March 10, 2024
    const expectedExpiryDate = new Date("2024-03-24T10:00:00.000Z"); // 14 days later

    beforeEach(() => {
      jest.setSystemTime(fixedCurrentDate);
    });

    it("should successfully checkout an available item for a resident", async () => {
      const kerb = "resident1";
      const itemName = "Laptop A";

      await reservation.checkoutItem(kerb, itemName);

      // Verify in-memory reservation
      const currentReservations = (
        reservation as any
      ).reservations as Map<string, { kerb: string; expiry: Date }>;
      expect(currentReservations.has(itemName)).toBe(true);
      expect(currentReservations.get(itemName)!.kerb).toBe(kerb);
      expect(currentReservations.get(itemName)!.expiry.toISOString()).toBe(
        expectedExpiryDate.toISOString(),
      );

      // Verify inventory.csv update
      const itemRow = await getInventoryItemRow(itemName);
      expect(itemRow).not.toBeNull();
      expect(itemRow?.Available).toBe("0");
      expect(itemRow?.LastCheckout).toBe(
        expectedExpiryDate.toISOString().slice(0, 10),
      ); // YYYY-MM-DD
      expect(itemRow?.LastKerb).toBe(kerb);
    });

    it("should allow checkout using an Item object", async () => {
      const kerb = "resident2";
      const item: Item = {
        itemName: "Monitor B",
        description: "24-inch display",
        quantity: 1,
        available: true,
        lastCheckout: undefined,
        lastKerb: undefined,
      };

      await reservation.checkoutItem(kerb, item);

      const itemRow = await getInventoryItemRow(item.itemName);
      expect(itemRow?.Available).toBe("0");
      expect(itemRow?.LastKerb).toBe(kerb);
    });

    it("should throw an error if the kerb is not found", async () => {
      const kerb = "nonexistent";
      const itemName = "Laptop A";
      await expect(reservation.checkoutItem(kerb, itemName)).rejects.toThrow(
        `Kerb not found: ${kerb}`,
      );
    });

    it("should throw an error if the kerb is not a resident", async () => {
      const kerb = "nonresident1";
      const itemName = "Laptop A";
      await expect(reservation.checkoutItem(kerb, itemName)).rejects.toThrow(
        `Kerb is not a resident: ${kerb}`,
      );
    });

    it("should throw an error if the item is not found", async () => {
      const kerb = "resident1";
      const itemName = "NonExistentItem";
      await expect(reservation.checkoutItem(kerb, itemName)).rejects.toThrow(
        `Item not found: ${itemName}`,
      );
    });

    it("should throw an error if the item is already checked out (in CSV)", async () => {
      const kerb = "resident1";
      const itemName = "Keyboard C"; // Available=0 in initial content
      await expect(reservation.checkoutItem(kerb, itemName)).rejects.toThrow(
        `Item already checked out: ${itemName}`,
      );
    });

    it("should throw an error if the item is already checked out (in-memory)", async () => {
      const kerb = "resident1";
      const itemName = "Mouse E";

      // First checkout (simulates a previous checkout not yet persisted or refreshed)
      await reservation.checkoutItem(kerb, itemName);

      // Attempt to checkout again
      await expect(reservation.checkoutItem("user2", itemName)).rejects.toThrow(
        `Item already checked out: ${itemName}`,
      );
    });

    it("should allow custom duration for checkout", async () => {
      const kerb = "resident1";
      const itemName = "Webcam D";
      const customDays = 7;
      const customExpiryDate = new Date(fixedCurrentDate);
      customExpiryDate.setDate(fixedCurrentDate.getDate() + customDays);

      await reservation.checkoutItem(kerb, itemName, customDays);

      const itemRow = await getInventoryItemRow(itemName);
      expect(itemRow?.Available).toBe("0");
      expect(itemRow?.LastCheckout).toBe(
        customExpiryDate.toISOString().slice(0, 10),
      );
      expect(itemRow?.LastKerb).toBe(kerb);

      const currentReservations = (
        reservation as any
      ).reservations as Map<string, { kerb: string; expiry: Date }>;
      expect(currentReservations.get(itemName)!.expiry.toISOString()).toBe(
        customExpiryDate.toISOString(),
      );
    });
  });

  describe("checkinItem(item: string | Item)", () => {
    const fixedCurrentDate = new Date("2024-03-10T10:00:00.000Z");
    beforeEach(() => {
      jest.setSystemTime(fixedCurrentDate);
    });

    it("should successfully check in a previously checked out item", async () => {
      const kerb = "user2";
      const itemName = "Webcam D";

      // Checkout the item first to simulate a reserved state
      await reservation.checkoutItem(kerb, itemName);

      // Verify initial state after checkout
      let itemRow = await getInventoryItemRow(itemName);
      expect(itemRow?.Available).toBe("0");
      expect(itemRow?.LastKerb).toBe(kerb);
      expect(
        (reservation as any).reservations.has(itemName),
      ).toBe(true);

      // Now check it in
      await reservation.checkinItem(itemName);

      // Verify inventory.csv update
      itemRow = await getInventoryItemRow(itemName);
      expect(itemRow).not.toBeNull();
      expect(itemRow?.Available).toBe("1");
      expect(itemRow?.LastKerb).toBe(""); // LastKerb should be cleared

      // Verify in-memory reservation is removed
      expect(
        (reservation as any).reservations.has(itemName),
      ).toBe(false);
    });

    it("should allow checkin using an Item object", async () => {
      const kerb = "user2";
      const item: Item = {
        itemName: "Mouse E",
        description: "Ergonomic mouse",
        quantity: 1,
        available: true,
        lastCheckout: undefined,
        lastKerb: undefined,
      };

      await reservation.checkoutItem(kerb, item); // Checkout
      await reservation.checkinItem(item); // Checkin

      const itemRow = await getInventoryItemRow(item.itemName);
      expect(itemRow?.Available).toBe("1");
      expect(itemRow?.LastKerb).toBe("");
      expect(
        (reservation as any).reservations.has(item.itemName),
      ).toBe(false);
    });

    it("should throw an error if the item is not found", async () => {
      const itemName = "NonExistentItem";
      await expect(reservation.checkinItem(itemName)).rejects.toThrow(
        `Item not found: ${itemName}`,
      );
    });

    it("should throw an error if the item is not currently checked out (no in-memory reservation)", async () => {
      const itemName = "Laptop A"; // Available=1, not in reservations map
      await expect(reservation.checkinItem(itemName)).rejects.toThrow(
        `Item is not currently checked out: ${itemName}`,
      );
    });
  });

  describe("notifyCheckout()", () => {
    let mockConsoleLog: jest.SpyInstance;

    beforeEach(() => {
      // Mock console.log to capture email outputs (sendEmail uses console.log in stub)
      mockConsoleLog = jest.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      mockConsoleLog.mockRestore();
    });

    it("should send email for expired items and return list of notified kerbs", async () => {
      const now = new Date("2024-03-25T10:00:00.000Z"); // Set current time to after expected expiry
      jest.setSystemTime(now);

      const kerb1 = "resident1";
      const item1 = "Laptop A";
      await reservation.checkoutItem(kerb1, item1, DEFAULT_DAYS); // Due 2024-03-24

      const kerb2 = "user2";
      const item2 = "Monitor B";
      await reservation.checkoutItem(kerb2, item2, 10); // Due 2024-03-20

      // Also add a non-expired item
      const kerb3 = "resident1";
      const item3 = "Mouse E";
      await reservation.checkoutItem(kerb3, item3, 50); // Due 2024-04-29

      const notifiedKerbs = await reservation.notifyCheckout();

      expect(notifiedKerbs).toEqual(expect.arrayContaining([kerb1, kerb2]));
      expect(notifiedKerbs).not.toContain(kerb3); // Item3 is not expired

      // Verify mockSendEmail calls
      expect(mockSendEmail).toHaveBeenCalledTimes(2);

      expect(mockSendEmail).toHaveBeenCalledWith(
        kerb1,
        `Overdue item: ${item1}`,
        expect.stringContaining(`Please return ${item1} which was due 2024-03-24.`),
      );
      expect(mockSendEmail).toHaveBeenCalledWith(
        kerb2,
        `Overdue item: ${item2}`,
        expect.stringContaining(`Please return ${item2} which was due 2024-03-20.`),
      );
    });

    it("should not send emails for non-expired items", async () => {
      const now = new Date("2024-03-15T10:00:00.000Z"); // Set current time before expiry
      jest.setSystemTime(now);

      const kerb = "resident1";
      const item = "Laptop A";
      await reservation.checkoutItem(kerb, item, DEFAULT_DAYS); // Due 2024-03-24

      const notifiedKerbs = await reservation.notifyCheckout();

      expect(notifiedKerbs).toEqual([]);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("should handle no active reservations gracefully", async () => {
      const now = new Date("2024-03-25T10:00:00.000Z");
      jest.setSystemTime(now);

      // No items checked out in this test setup, so no in-memory reservations
      const notifiedKerbs = await reservation.notifyCheckout();

      expect(notifiedKerbs).toEqual([]);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });
});
```
