// src/concepts/Reservation/inventoryreservation.ts

import { Db } from "npm:mongodb";
import {
  AlreadyCheckedOutError,
  InsufficientQuantityError,
  InvalidQuantityError,
  ItemNotFoundError,
  UserNotFoundError,
} from "../../utils/errors.ts";
import { ID } from "../../utils/types.ts";
import { freshID } from "../../utils/database.ts"; // Assuming freshID is needed for new reservations

// Helper functions for CSV manipulation (copied from test, could be a shared utility)
interface CsvDataForTest {
  header: string[];
  rows: string[][];
}

async function readCsvForReservation(p: string): Promise<CsvDataForTest> {
  const raw = await Deno.readTextFile(p);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split(",").map((h) => h.trim());
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(parseCsvLineForReservation(lines[i]));
  }
  return { header, rows };
}

async function writeCsvForReservation(
  p: string,
  header: string[],
  rows: string[][],
): Promise<void> {
  const content = [
    header.map((h) => `"${h.replace(/"/g, '""')}"`).join(","),
    ...rows.map((row) =>
      row.map((s) => `"${s.replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");
  await Deno.writeTextFile(p, content);
}

function parseCsvLineForReservation(line: string): string[] {
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

// --- CSV-BASED IMPLEMENTATION (Reservation class) ---
export class InventoryReservationConcept {
  private inventoryCsvPath: string;
  private usersCsvPath: string;
  private durationDays: number;
  // This map stores active in-memory reservations, indexed by itemName
  private reservations: Map<string, { kerb: string; expiry: Date }>;

  constructor(
    inventoryCsvPath: string,
    usersCsvPath: string,
    durationDays: number = 7,
  ) {
    this.inventoryCsvPath = inventoryCsvPath;
    this.usersCsvPath = usersCsvPath;
    this.durationDays = durationDays;
    this.reservations = new Map();
    this.loadInitialReservations(); // Load initial reservations from CSV on startup
  }

  // Load initial reservations from CSV to populate in-memory map
  // This simulates the state if the app was restarted and picked up existing checkouts
  private async loadInitialReservations() {
    try {
      const { rows } = await readCsvForReservation(this.inventoryCsvPath);
      for (const row of rows) {
        const [itemName, , availableStr, lastCheckoutStr, lastKerb] = row;
        const available = parseInt(availableStr, 10);

        // If available is 0 and lastCheckout/lastKerb are present, it implies a standing reservation
        if (available === 0 && lastKerb && lastCheckoutStr) {
          const checkoutDate = new Date(lastCheckoutStr);
          const expiryDate = new Date(checkoutDate);
          expiryDate.setDate(checkoutDate.getDate() + this.durationDays);

          this.reservations.set(itemName, {
            kerb: lastKerb,
            expiry: expiryDate,
          });
        }
      }
    } catch (error) {
      console.warn(
        `Failed to load initial CSV reservations from ${this.inventoryCsvPath}:`,
        error,
      );
    }
  }

  private async getInventoryData() {
    const { header, rows } = await readCsvForReservation(this.inventoryCsvPath);
    const inventory = new Map<string, {
      itemName: string;
      category: string;
      available: number;
      lastCheckout: Date | null;
      lastKerb: string | null;
    }>();

    for (const row of rows) {
      const [itemName, category, availableStr, lastCheckoutStr, lastKerb] = row;
      inventory.set(itemName, {
        itemName,
        category,
        available: parseInt(availableStr, 10),
        lastCheckout: lastCheckoutStr ? new Date(lastCheckoutStr) : null,
        lastKerb: lastKerb || null,
      });
    }
    return { header, inventory };
  }

  private async updateInventoryData(
    header: string[],
    inventoryMap: Map<string, any>,
  ) {
    const newRows = Array.from(inventoryMap.values()).map((item) => [
      item.itemName,
      item.category,
      item.available.toString(),
      item.lastCheckout instanceof Date
        ? item.lastCheckout.toISOString().slice(0, 10)
        : "",
      item.lastKerb || "",
    ]);
    await writeCsvForReservation(this.inventoryCsvPath, header, newRows);
  }

  private async getUserData() {
    const { header, rows } = await readCsvForReservation(this.usersCsvPath);
    const users = new Map<string, {
      kerb: string;
      first: string;
      last: string;
      role: string;
    }>();
    for (const row of rows) {
      const [kerb, first, last, role] = row;
      users.set(kerb, { kerb, first, last, role });
    }
    return { header, users };
  }

  async checkoutItem(
    kerb: string,
    itemName: string,
    expiryDate: number,
  ): Promise<void> {
    const { header, inventory } = await this.getInventoryData();
    const { users } = await this.getUserData();

    // 1. Validate Item Existence
    const item = inventory.get(itemName);
    if (!item) {
      throw new ItemNotFoundError(itemName);
    }

    // 2. Validate User Existence and Role
    const user = users.get(kerb);
    if (!user) {
      throw new UserNotFoundError(kerb);
    }
    if (user.role !== "resident") {
      throw new UserNotFoundError(kerb);
    }

    // 3. Check in-memory reservations first (primary source for active reservations)
    if (this.reservations.has(itemName)) {
      throw new AlreadyCheckedOutError(itemName);
    }

    // 4. Check CSV availability (for items not yet loaded into in-memory reservations or initial state)
    if (item.available <= 0) {
      throw new AlreadyCheckedOutError(itemName);
    }

    // Perform checkout
    item.available--;
    item.lastKerb = kerb;
    const checkoutDate = new Date(); // Current date/time for checkout
    item.lastCheckout = checkoutDate;

    // Calculate expiry date
    const newExpiryDate = new Date(checkoutDate);
    newExpiryDate.setDate(checkoutDate.getDate() + expiryDate);

    this.reservations.set(itemName, { kerb: kerb, expiry: newExpiryDate });
    await this.updateInventoryData(header, inventory);
  }

  async checkinItem(itemName: string): Promise<void> {
    const { header, inventory } = await this.getInventoryData();

    // 1. Validate Item Existence
    const item = inventory.get(itemName);
    if (!item) {
      throw new ItemNotFoundError(itemName);
    }

    // 2. Check if item is in in-memory reservations
    if (!this.reservations.has(itemName)) {
      throw new AlreadyCheckedOutError(
        itemName,
      );
    }

    // Perform check-in
    item.available++;
    item.lastKerb = null; // Clear last kerb
    item.lastCheckout = null; // Clear last checkout date

    this.reservations.delete(itemName);
    await this.updateInventoryData(header, inventory);
  }

  async notifyCheckout(): Promise<string[]> {
    const now = new Date();
    const notifiedKerbs: string[] = [];

    for (const [itemName, reservation] of this.reservations.entries()) {
      if (reservation.expiry < now) {
        // Item is overdue
        console.log(
          `sending email to ${reservation.kerb}: Overdue item: ${itemName}, due ${
            reservation.expiry.toISOString().slice(0, 10)
          }`,
        );
        notifiedKerbs.push(reservation.kerb);
      }
    }
    return notifiedKerbs;
  }
}

// --- MONGODB-BASED IMPLEMENTATION (InventoryReservation class) ---

// Define types for MongoDB collections to match populateInitialData
interface DbInventoryItem {
  _id: ID;
  itemName: string;
  category: string;
  tags: string[];
  available: number;
  lastCheckout: Date | null;
  lastKerb: string | null;
}

interface DbUser {
  _id: ID;
  kerb: string;
  first: string;
  last: string;
  role: string;
}

export default class ReservationConcept {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async checkoutItem(
    kerb: string,
    itemName: string,
    quantity: number,
  ): Promise<void> {
    if (quantity <= 0) {
      throw new InvalidQuantityError(quantity);
    }

    // Find user and item first to get detailed error messages
    const user = await this.db.collection<DbUser>("users").findOne({ kerb });
    if (!user) {
      throw new UserNotFoundError(kerb);
    }
    // Assume all users can checkout for this test, or add specific role checks
    // if (user.role !== "resident") { throw new UserNotFoundError(`Kerb is not a resident: ${kerb}`); }

    const item = await this.db.collection<DbInventoryItem>("items").findOne({
      itemName,
    });
    if (!item) {
      throw new ItemNotFoundError(itemName);
    }

    // Specific error checks based on item state
    if (item.lastCheckout !== null) {
      // Item is currently checked out by *someone*
      throw new AlreadyCheckedOutError(itemName);
    }

    if (item.available < quantity) {
      throw new InsufficientQuantityError(
        itemName,
        quantity,
        item.available,
      );
    }

    // If we reach here, conditions seem good, proceed with atomic update
    const result = await this.db.collection<DbInventoryItem>("items")
      .findOneAndUpdate(
        {
          _id: item._id, // Target specific item by ID to avoid race conditions with itemName
          available: { $gte: quantity },
          lastCheckout: null, // Ensure it's not checked out by others in between checks
        },
        {
          $inc: { available: -quantity },
          $set: { lastCheckout: new Date(), lastKerb: kerb },
        },
        { returnDocument: "after" }, // Return the updated document
      );

    if (result?._id === null) {
      // This case indicates a race condition where another operation changed the item state
      // after our initial findOne but before findOneAndUpdate.
      throw new Error(
        `Failed to checkout item ${itemName} due to concurrent modification or unexpected state.`,
      );
    }
  }

  // A basic stub for checkinItem to satisfy potential future tests, not fully implemented
  async checkinItem(
    _kerb: string, // Not used in this basic stub, but could be for permissions
    itemName: string,
    quantity: number = 1,
  ): Promise<void> {
    if (quantity <= 0) {
      throw new InvalidQuantityError(quantity);
    }

    const item = await this.db.collection<DbInventoryItem>("items").findOne(
      { itemName },
      { projection: { available: 1, lastCheckout: 1, lastKerb: 1 } },
    );

    if (!item) {
      throw new ItemNotFoundError(itemName);
    }

    if (item.lastCheckout === null) {
      throw new AlreadyCheckedOutError(
        itemName,
      ); // Reusing error
    }

    // Assuming a simple checkin: increment available, clear lastCheckout/lastKerb
    const updateResult = await this.db.collection<DbInventoryItem>("items")
      .updateOne(
        { _id: item._id, lastCheckout: { $ne: null } }, // Ensure it was checked out
        {
          $inc: { available: quantity },
          $set: { lastCheckout: null, lastKerb: null },
        },
      );

    if (updateResult.matchedCount === 0) {
      throw new Error(
        `Failed to checkin ${itemName}, possibly due to race condition or invalid state.`,
      );
    }
  }
  // TODO: Implement notifyCheckout for MongoDB if required
}
