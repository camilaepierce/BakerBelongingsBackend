---
timestamp: 'Thu Oct 16 2025 00:32:06 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251016_003206.1243f5a9.md]]'
content_id: f6fbee94304fc0ff3586032a84d5003a0736e93daf2ade99a4a25bc1c270d710
---

# response:

Given the explicit instructions to use Deno, MongoDB, and TypeScript for concept implementation and testing, and the detailed structure for concept implementation using MongoDB, the provided `inventoryreservation.ts` (which uses CSV files and an in-memory map) is a non-compliant example. The prompt asks to "implement a test suite that follows the following concept specification and the provided implementation". The most consistent interpretation is to *re-implement* the `Reservation` concept using MongoDB, adhering to the concept design principles and then implement a test suite for *that* MongoDB-backed implementation.

The header "implement: LikertSurvey" appears to be a copy-paste error in the prompt and is interpreted as an instruction to implement the `Reservation` concept using the specified technology stack.

Here's the re-implementation of the `Reservation` concept using MongoDB, followed by its comprehensive test suite.

First, let's establish the necessary utility files:

**File: `src/utils/types.ts`**

```typescript
export type ID = string & { __brand: "ID" };
export type Empty = Record<PropertyKey, never>; // Represents an empty object for successful returns
```

**File: `src/utils/database.ts`**

```typescript
import { MongoClient, Db } from "npm:mongodb";
import { load } from "https://deno.land/std@0.219.0/dotenv/mod.ts";
import { ID } from "./types.ts";

export function freshID(): ID {
    return `id:${crypto.randomUUID()}` as ID;
}

let _db: Db | null = null;
let _client: MongoClient | null = null;

/**
 * Connects to MongoDB and returns the database instance and client.
 * Uses MONGO_URI from .env or defaults to "mongodb://localhost:27017/deno_concept_db".
 * Caches the connection for reuse.
 */
export async function getDb(): Promise<[Db, MongoClient]> {
    if (_db && _client && _client.connected) {
        return [_db, _client];
    }

    // Load environment variables from .env file
    const env = await load();
    const mongoUri = env["MONGO_URI"] || "mongodb://localhost:27017/deno_concept_db";
    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        _db = client.db();
        _client = client;
        console.log("Connected to MongoDB");
        return [_db, _client];
    } catch (e) {
        console.error("Failed to connect to MongoDB:", e);
        throw e;
    }
}

/**
 * Closes the MongoDB client connection if it's open.
 */
export async function closeDb(): Promise<void> {
    if (_client) {
        await _client.close();
        _db = null;
        _client = null;
        console.log("MongoDB connection closed.");
    }
}
```

***

Now, here is the MongoDB-backed implementation of the `Reservation` concept:

**File: `src/concepts/ReservationConcept.ts`**

```typescript
import { Collection, Db } from "npm:mongodb";
import { ID, Empty } from "@utils/types.ts";
import { freshID } from "@utils/database.ts";

// Declare collection prefix, use concept name
const PREFIX = "Reservation" + ".";

// Generic types for this concept
type Item = ID; // The concept spec refers to 'item: Item', implying Item is a generic ID

/**
 * **concept** Reservation
 * **purpose** keep track of when items will expire, and send emails to users with expired items
 *
 * This interface defines the structure of a reservation document stored in MongoDB.
 * **state**
 * a set of Items with
 *     an expiry Date
 *     a kerb String
 */
interface ReservationDoc {
  _id: ID; // Unique ID for this specific reservation record
  itemId: Item; // The identifier of the item that is reserved
  kerb: string; // The kerb (user identifier) who checked out the item
  expiryDate: Date; // The date and time when the item is due back
  notified: boolean; // Flag to track if a notification email has been sent for this reservation
}

export class ReservationConcept {
  reservations: Collection<ReservationDoc>;
  defaultDurationDays: number = 14; // Predetermined time for expiry

  constructor(private readonly db: Db) {
    this.reservations = this.db.collection(PREFIX + "reservations");
  }

  /**
   * checkoutItem(item: Item, kerb: String, durationDays?: number): Empty | { error: string }
   *
   * **requires**
   *   - `item` is a valid Item ID.
   *   - `kerb` is a non-empty String.
   *   - The item is not currently checked out (i.e., no active reservation for this `itemId` where `expiryDate > now`).
   *   - (Implicit from concept spec: kerb is a resident in the Roles; this is assumed to be enforced by a sync outside this concept.)
   *
   * **effects**
   *   - A new reservation document is inserted into the `reservations` collection.
   *   - An `expiryDate` is set based on `defaultDurationDays` or the provided `durationDays`.
   *   - The reservation records the `itemId`, `kerb`, and `expiryDate`.
   *   - `notified` flag is set to `false`.
   *   - Returns `{}` on success, or `{ error: string }` on failure.
   */
  async checkoutItem(
    { item, kerb, durationDays }: { item: Item; kerb: string; durationDays?: number },
  ): Promise<Empty | { error: string }> {
    if (!item || typeof item !== "string" || item.trim() === "") {
      return { error: "Item ID cannot be empty." };
    }
    if (!kerb || typeof kerb !== "string" || kerb.trim() === "") {
      return { error: "Kerb cannot be empty." };
    }

    const now = new Date();
    // Check for an *active* reservation for this item
    const existingActiveReservation = await this.reservations.findOne({
      itemId: item,
      expiryDate: { $gt: now }, // Reservation is still active (not expired)
    });

    if (existingActiveReservation) {
      return { error: `Item ${item} is already actively checked out by ${existingActiveReservation.kerb}.` };
    }

    const days = durationDays ?? this.defaultDurationDays;
    const expiry = new Date(now);
    expiry.setDate(expiry.getDate() + days);

    const newReservation: ReservationDoc = {
      _id: freshID(), // Unique ID for the reservation record itself
      itemId: item,
      kerb: kerb,
      expiryDate: expiry,
      notified: false,
    };

    try {
      await this.reservations.insertOne(newReservation);
      return {};
    } catch (e) {
      console.error("[ReservationConcept] Error checking out item:", e);
      return { error: "Failed to checkout item due to database error." };
    }
  }

  /**
   * checkinItem(item: Item): Empty | { error: string }
   *
   * This action is implied by the concept purpose ("reminder to check the item back in").
   *
   * **requires**
   *   - `item` is a valid Item ID.
   *   - There is an *active* reservation for the `item` (i.e., `expiryDate > now`).
   *
   * **effects**
   *   - The active reservation for `item` is removed from the `reservations` collection.
   *   - Returns `{}` on success, or `{ error: string }` on failure.
   */
  async checkinItem({ item }: { item: Item }): Promise<Empty | { error: string }> {
    if (!item || typeof item !== "string" || item.trim() === "") {
      return { error: "Item ID cannot be empty." };
    }

    const now = new Date();
    // Attempt to delete an *active* reservation for the item
    const result = await this.reservations.deleteOne({
      itemId: item,
      expiryDate: { $gt: now }, // Only delete if the reservation is still active
    });

    if (result.deletedCount === 0) {
      // Check if an expired reservation exists for clarity in error message
      const expiredReservation = await this.reservations.findOne({ itemId: item });
      if (expiredReservation) {
        return { error: `Item ${item} has an expired reservation. Check-in only applies to active reservations.` };
      }
      return { error: `Item ${item} is not currently checked out (or its reservation has already expired).` };
    }

    return {};
  }

  /**
   * notifyCheckout(): { notifiedKerbs: string[] }
   *
   * **effects**
   *   - Finds reservations where `expiryDate <= now` and `notified` is `false`.
   *   - For each such reservation, logs a simulated email to the `kerb`.
   *   - Updates the `notified` flag to `true` in the database for that reservation.
   *   - Returns an array of `kerb` strings that were notified.
   */
  async notifyCheckout(): Promise<{ notifiedKerbs: string[] }> {
    const now = new Date();
    const notifiedKerbs: string[] = [];

    // Find all reservations that have expired and for which no notification has been sent yet
    const expiredAndUnnotifiedReservations = await this.reservations.find({
      expiryDate: { $lte: now }, // Expiry date is in the past or present
      notified: false, // Notification has not yet been sent
    }).toArray();

    for (const reservation of expiredAndUnnotifiedReservations) {
      // Simulate sending email (replace with actual email transport in a real deployment)
      console.log(
        `[ReservationConcept] Sending email reminder to ${reservation.kerb} for item ${reservation.itemId}. Due date: ${
          reservation.expiryDate.toISOString().slice(0, 10)
        }.`,
      );
      notifiedKerbs.push(reservation.kerb);

      // Mark the reservation as notified in the database
      await this.reservations.updateOne(
        { _id: reservation._id },
        { $set: { notified: true } },
      );
    }

    return { notifiedKerbs };
  }

  // --- Queries (for testing and internal use) ---

  /**
   * _getReservationByItemId(itemId: Item): { reservation: ReservationDoc | null } | { error: string }
   *
   * **requires** `itemId` is a valid Item ID.
   * **effects** Returns the most recent reservation for the given `itemId`, or `null` if not found.
   */
  async _getReservationByItemId(
    { itemId }: { itemId: Item },
  ): Promise<{ reservation: ReservationDoc | null } | { error: string }> {
    if (!itemId) return { error: "Item ID cannot be empty." };
    try {
      // Find one, assuming items can have multiple historical reservations,
      // but we typically care about the most recent or active one in tests.
      // This query might need refinement depending on what "the reservation" means.
      // For now, it returns *any* reservation document for the item.
      const reservation = await this.reservations.findOne({ itemId: itemId });
      return { reservation };
    } catch (e) {
      console.error("[ReservationConcept] Error getting reservation by item ID:", e);
      return { error: "Failed to retrieve reservation." };
    }
  }

  /**
   * _getActiveReservationByItemId(itemId: Item): { reservation: ReservationDoc | null } | { error: string }
   *
   * **requires** `itemId` is a valid Item ID.
   * **effects** Returns the currently active (non-expired) reservation for the given `itemId`, or `null` if not found.
   */
  async _getActiveReservationByItemId(
    { itemId }: { itemId: Item },
  ): Promise<{ reservation: ReservationDoc | null } | { error: string }> {
    if (!itemId) return { error: "Item ID cannot be empty." };
    try {
      const now = new Date();
      const reservation = await this.reservations.findOne({
        itemId: itemId,
        expiryDate: { $gt: now },
      });
      return { reservation };
    } catch (e) {
      console.error("[ReservationConcept] Error getting active reservation by item ID:", e);
      return { error: "Failed to retrieve active reservation." };
    }
  }

  /**
   * _getAllReservations(): { reservations: ReservationDoc[] } | { error: string }
   *
   * **effects** Returns an array of all reservation documents.
   */
  async _getAllReservations(): Promise<{ reservations: ReservationDoc[] } | { error: string }> {
    try {
      const allReservations = await this.reservations.find({}).toArray();
      return { reservations: allReservations };
    } catch (e) {
      console.error("[ReservationConcept] Error getting all reservations:", e);
      return { error: "Failed to retrieve all reservations." };
    }
  }

  /**
   * _getNotifiedStatus(itemId: Item): { notified: boolean | null } | { error: string }
   *
   * **requires** `itemId` is a valid Item ID.
   * **effects** Returns the `notified` status of the most recent reservation for `itemId`, or `null` if no reservation.
   */
  async _getNotifiedStatus(
    { itemId }: { itemId: Item },
  ): Promise<{ notified: boolean | null } | { error: string }> {
    if (!itemId) return { error: "Item ID cannot be empty." };
    try {
      const reservation = await this.reservations.findOne({ itemId: itemId });
      return { notified: reservation ? reservation.notified : null };
    } catch (e) {
      console.error("[ReservationConcept] Error getting notified status:", e);
      return { error: "Failed to retrieve notified status." };
    }
  }

  /**
   * _getExpiredAndUnnotifiedReservations(): { reservations: ReservationDoc[] } | { error: string }
   *
   * **effects** Returns an array of reservations that are expired and have not yet been notified.
   * For internal testing/debugging `notifyCheckout` logic.
   */
  async _getExpiredAndUnnotifiedReservations(): Promise<{ reservations: ReservationDoc[] } | { error: string }> {
    try {
      const now = new Date();
      const expiredAndUnnotified = await this.reservations.find({
        expiryDate: { $lte: now },
        notified: false,
      }).toArray();
      return { reservations: expiredAndUnnotified };
    } catch (e) {
      console.error("[ReservationConcept] Error getting expired and unnotified reservations:", e);
      return { error: "Failed to retrieve expired and unnotified reservations." };
    }
  }
}
```

***

Finally, here is the test suite for the `ReservationConcept`:

**File: `src/concepts/ReservationConcept.test.ts`**

```typescript
import { MongoClient, Db } from "npm:mongodb";
import { assertEquals, assertNotEquals, assertArrayIncludes, assert } from "npm:assert";
import { beforeAll, afterAll, beforeEach, describe, it } from "https://deno.land/std@0.219.0/testing/bdd.ts";

import { ReservationConcept } from "@concepts/ReservationConcept.ts";
import { ID } from "@utils/types.ts";
import { getDb, closeDb } from "@utils/database.ts";

// Helper type for a reservation document for type assertions in tests
interface TestReservationDoc {
  _id: ID;
  itemId: ID;
  kerb: string;
  expiryDate: Date;
  notified: boolean;
}

// Utility for pausing execution in tests to simulate time passing
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("ReservationConcept", () => {
  let db: Db;
  let client: MongoClient;
  let concept: ReservationConcept;

  // Define some constant item IDs and kerbs for testing
  const ITEM_A = "item:Laptop" as ID;
  const ITEM_B = "item:Projector" as ID;
  const ITEM_C = "item:Microscope" as ID;
  const KERB_ALICE = "alice@example.com";
  const KERB_BOB = "bob@example.com";
  const KERB_CHARLIE = "charlie@example.com";

  // Setup database connection and instantiate the concept before all tests
  beforeAll(async () => {
    [db, client] = await getDb();
    concept = new ReservationConcept(db);
  });

  // Close the database connection after all tests are done
  afterAll(async () => {
    await closeDb();
  });

  // Clear the reservations collection before each test to ensure a clean state
  beforeEach(async () => {
    await concept.reservations.deleteMany({});
    concept.defaultDurationDays = 14; // Reset default duration for each test
  });

  // --- Principle Test ---
  // "when an item is checked out, set the item with the expiry time a predetermined time before and the kerb"
  it("should checkout an item, setting expiry and kerb according to principle", async () => {
    const result = await concept.checkoutItem({ item: ITEM_A, kerb: KERB_ALICE });
    assertEquals(result, {}, "checkoutItem should return an empty object on success");

    const { reservation } = await concept._getReservationByItemId({ itemId: ITEM_A }) as { reservation: TestReservationDoc };
    assert(reservation, "A reservation should be found for ITEM_A");
    assertEquals(reservation.itemId, ITEM_A, "Reservation should have the correct item ID");
    assertEquals(reservation.kerb, KERB_ALICE, "Reservation should have the correct kerb");
    assertEquals(reservation.notified, false, "New reservation should not be notified");

    // Verify expiry date is approximately (now + defaultDurationDays)
    const expectedExpiry = new Date();
    expectedExpiry.setDate(expectedExpiry.getDate() + concept.defaultDurationDays);
    // Allow for a small time difference during test execution (e.g., due to async operations)
    const diff = Math.abs(reservation.expiryDate.getTime() - expectedExpiry.getTime());
    assert(diff < 2000, `Expiry date difference too large: ${diff}ms (Expected ~${expectedExpiry.toISOString()}, Got ${reservation.expiryDate.toISOString()})`);
  });

  describe("checkoutItem", () => {
    it("should successfully checkout an item with default duration", async () => {
      const result = await concept.checkoutItem({ item: ITEM_A, kerb: KERB_ALICE });
      assertEquals(result, {});

      const { reservation } = await concept._getActiveReservationByItemId({ itemId: ITEM_A }) as { reservation: TestReservationDoc };
      assert(reservation);
      assertEquals(reservation.itemId, ITEM_A);
      assertEquals(reservation.kerb, KERB_ALICE);
      assertEquals(reservation.notified, false);

      const expectedExpiry = new Date();
      expectedExpiry.setDate(expectedExpiry.getDate() + concept.defaultDurationDays);
      assert(reservation.expiryDate.getTime() >= expectedExpiry.getTime() - 1000 &&
             reservation.expiryDate.getTime() <= expectedExpiry.getTime() + 1000,
             `Expiry date mismatch for default duration: ${reservation.expiryDate.toISOString()} vs ${expectedExpiry.toISOString()}`);
    });

    it("should successfully checkout an item with custom duration", async () => {
      const customDuration = 7;
      const result = await concept.checkoutItem({ item: ITEM_B, kerb: KERB_BOB, durationDays: customDuration });
      assertEquals(result, {});

      const { reservation } = await concept._getActiveReservationByItemId({ itemId: ITEM_B }) as { reservation: TestReservationDoc };
      assert(reservation);
      assertEquals(reservation.itemId, ITEM_B);
      assertEquals(reservation.kerb, KERB_BOB);

      const expectedExpiry = new Date();
      expectedExpiry.setDate(expectedExpiry.getDate() + customDuration);
      assert(reservation.expiryDate.getTime() >= expectedExpiry.getTime() - 1000 &&
             reservation.expiryDate.getTime() <= expectedExpiry.getTime() + 1000,
             `Expiry date mismatch for custom duration: ${reservation.expiryDate.toISOString()} vs ${expectedExpiry.toISOString()}`);
    });

    it("should prevent checking out an already actively reserved item", async () => {
      await concept.checkoutItem({ item: ITEM_A, kerb: KERB_ALICE }); // First checkout
      const result = await concept.checkoutItem({ item: ITEM_A, kerb: KERB_BOB }); // Second checkout attempt

      assertNotEquals(result, {}, "Should return an error object");
      assert((result as { error: string }).error.includes("already actively checked out"), "Error message should indicate item is already checked out");

      const { reservations } = await concept._getAllReservations() as { reservations: TestReservationDoc[] };
      assertEquals(reservations.length, 1, "Only one reservation should exist for ITEM_A"); // Only the first reservation should persist
      assertEquals(reservations[0].kerb, KERB_ALICE, "The original kerb should still be the one who checked out the item");
    });

    it("should allow checking out an item if its previous reservation has expired", async () => {
      // Checkout with expiry in the past
      await concept.checkoutItem({ item: ITEM_A, kerb: KERB_ALICE, durationDays: -1 });
      await sleep(100); // Ensure 'now' is definitely past the expiry date

      // Attempt to checkout again by a different kerb
      const result = await concept.checkoutItem({ item: ITEM_A, kerb: KERB_BOB });
      assertEquals(result, {}, "Should successfully checkout an item whose previous reservation expired");

      const { reservations } = await concept._getAllReservations() as { reservations: TestReservationDoc[] };
      assertEquals(reservations.length, 2, "Two reservations should exist: one expired, one active");
      const activeReservation = reservations.find(r => r.kerb === KERB_BOB);
      assert(activeReservation, "An active reservation by KERB_BOB should be found");
      assert(activeReservation.expiryDate.getTime() > new Date().getTime(), "The new reservation should be active");
    });

    it("should return error for empty item ID", async () => {
      const result = await concept.checkoutItem({ item: "" as ID, kerb: KERB_ALICE });
      assertNotEquals(result, {}, "Should return an error object");
      assert((result as { error: string }).error.includes("Item ID cannot be empty"), "Error message should indicate empty item ID");
    });

    it("should return error for empty kerb", async () => {
      const result = await concept.checkoutItem({ item: ITEM_A, kerb: "" });
      assertNotEquals(result, {}, "Should return an error object");
      assert((result as { error: string }).error.includes("Kerb cannot be empty"), "Error message should indicate empty kerb");
    });
  });

  describe("checkinItem", () => {
    it("should successfully check in an actively reserved item", async () => {
      await concept.checkoutItem({ item: ITEM_A, kerb: KERB_ALICE });
      const { reservation: initialReservation } = await concept._getActiveReservationByItemId({ itemId: ITEM_A }) as { reservation: TestReservationDoc };
      assert(initialReservation, "Item A should be actively checked out initially");

      const result = await concept.checkinItem({ item: ITEM_A });
      assertEquals(result, {}, "checkinItem should return an empty object on success");

      const { reservation: afterCheckin } = await concept._getActiveReservationByItemId({ itemId: ITEM_A }) as { reservation: TestReservationDoc | null };
      assertEquals(afterCheckin, null, "Active reservation for ITEM_A should be deleted after check-in");
    });

    it("should fail to check in an unreserved item", async () => {
      const result = await concept.checkinItem({ item: ITEM_B });
      assertNotEquals(result, {}, "Should return an error object");
      assert((result as { error: string }).error.includes("not currently checked out"), "Error message should indicate item is not checked out");
    });

    it("should fail to check in an item whose reservation has expired", async () => {
      await concept.checkoutItem({ item: ITEM_A, kerb: KERB_ALICE, durationDays: -1 }); // Expired in the past
      await sleep(100); // Ensure 'now' is definitely past the expiry date

      const result = await concept.checkinItem({ item: ITEM_A });
      assertNotEquals(result, {}, "Should return an error object for an expired reservation");
      assert((result as { error: string }).error.includes("has an expired reservation"), "Error message should indicate expired reservation");

      const { reservation } = await concept._getReservationByItemId({ itemId: ITEM_A }) as { reservation: TestReservationDoc };
      assert(reservation, "The expired reservation should still exist (not deleted by failed check-in)");
    });

    it("should return error for empty item ID", async () => {
      const result = await concept.checkinItem({ item: "" as ID });
      assertNotEquals(result, {}, "Should return an error object");
      assert((result as { error: string }).error.includes("Item ID cannot be empty"), "Error message should indicate empty item ID");
    });
  });

  describe("notifyCheckout", () => {
    it("should do nothing if no items are expired and unnotified", async () => {
      await concept.checkoutItem({ item: ITEM_A, kerb: KERB_ALICE, durationDays: 1 }); // Expires tomorrow

      const { notifiedKerbs } = await concept.notifyCheckout();
      assertEquals(notifiedKerbs.length, 0, "No kerbs should be notified");

      const { notified } = await concept._getNotifiedStatus({ itemId: ITEM_A }) as { notified: boolean };
      assertEquals(notified, false, "Notified status for ITEM_A should remain false");
    });

    it("should notify for an expired item and update its 'notified' status to true", async () => {
      await concept.checkoutItem({ item: ITEM_A, kerb: KERB_ALICE, durationDays: -1 }); // Expired yesterday
      await sleep(100); // Ensure 'now' is definitely past the expiry date

      const { notifiedKerbs } = await concept.notifyCheckout();
      assertEquals(notifiedKerbs.length, 1, "One kerb should be notified");
      assertArrayIncludes(notifiedKerbs, [KERB_ALICE], "KERB_ALICE should be in the notified list");

      const { notified } = await concept._getNotifiedStatus({ itemId: ITEM_A }) as { notified: boolean };
      assertEquals(notified, true, "Notified status for ITEM_A should be true");
    });

    it("should not notify for an already notified expired item", async () => {
      await concept.checkoutItem({ item: ITEM_A, kerb: KERB_ALICE, durationDays: -1 });
      await sleep(100);

      const { notifiedKerbs: firstNotification } = await concept.notifyCheckout();
      assertEquals(firstNotification.length, 1, "First notification should notify one kerb");
      const { notified: firstNotifiedStatus } = await concept._getNotifiedStatus({ itemId: ITEM_A }) as { notified: boolean };
      assertEquals(firstNotifiedStatus, true, "Notified status should be true after first notification");

      // Call notifyCheckout again
      const { notifiedKerbs: secondNotification } = await concept.notifyCheckout();
      assertEquals(secondNotification.length, 0, "Second notification should not notify anyone (already notified)");
      const { notified: secondNotifiedStatus } = await concept._getNotifiedStatus({ itemId: ITEM_A }) as { notified: boolean };
      assertEquals(secondNotifiedStatus, true, "Notified status should remain true after second attempt");
    });

    it("should handle multiple expired items for different kerbs", async () => {
      await concept.checkoutItem({ item: ITEM_A, kerb: KERB_ALICE, durationDays: -2 }); // Expired
      await concept.checkoutItem({ item: ITEM_B, kerb: KERB_BOB, durationDays: -1 }); // Expired
      await sleep(100);

      const { notifiedKerbs } = await concept.notifyCheckout();
      assertEquals(notifiedKerbs.length, 2, "Two kerbs should be notified");
      assertArrayIncludes(notifiedKerbs, [KERB_ALICE, KERB_BOB], "Both Alice and Bob should be in the notified list");

      const { notified: itemANotified } = await concept._getNotifiedStatus({ itemId: ITEM_A }) as { notified: boolean };
      assertEquals(itemANotified, true, "ITEM_A should be marked notified");
      const { notified: itemBNotified } = await concept._getNotifiedStatus({ itemId: ITEM_B }) as { notified: boolean };
      assertEquals(itemBNotified, true, "ITEM_B should be marked notified");
    });

    it("should handle multiple expired items for the same kerb", async () => {
      await concept.checkoutItem({ item: ITEM_A, kerb: KERB_ALICE, durationDays: -2 }); // Expired
      await concept.checkoutItem({ item: ITEM_C, kerb: KERB_ALICE, durationDays: -1 }); // Expired for same kerb
      await sleep(100);

      const { notifiedKerbs } = await concept.notifyCheckout();
      assertEquals(notifiedKerbs.length, 2, "Two notifications should be sent (one for each item)");
      // Note: `notifiedKerbs` will contain KERB_ALICE twice as it logs each notification event
      assertArrayIncludes(notifiedKerbs, [KERB_ALICE, KERB_ALICE], "KERB_ALICE should be notified for both items");

      const { notified: itemANotified } = await concept._getNotifiedStatus({ itemId: ITEM_A }) as { notified: boolean };
      assertEquals(itemANotified, true, "ITEM_A should be marked notified");
      const { notified: itemCNotified } = await concept._getNotifiedStatus({ itemId: ITEM_C }) as { notified: boolean };
      assertEquals(itemCNotified, true, "ITEM_C should be marked notified");
    });

    it("should only notify for expired items, ignoring future and already notified ones", async () => {
      await concept.checkoutItem({ item: ITEM_A, kerb: KERB_ALICE, durationDays: -2 }); // Expired, unnotified
      await concept.checkoutItem({ item: ITEM_B, kerb: KERB_BOB, durationDays: 1 }); // Future, unnotified
      await concept.checkoutItem({ item: ITEM_C, kerb: KERB_CHARLIE, durationDays: -1 }); // Expired, then notify
      await sleep(100);

      await concept.notifyCheckout(); // First call for ITEM_C to be marked notified

      const { notifiedKerbs } = await concept.notifyCheckout(); // Second call, now ITEM_A and ITEM_C (already notified)
      assertEquals(notifiedKerbs.length, 1, "Only ITEM_A should trigger a new notification");
      assertArrayIncludes(notifiedKerbs, [KERB_ALICE], "Only KERB_ALICE should be in the notified list from this call");

      const { notified: itemANotified } = await concept._getNotifiedStatus({ itemId: ITEM_A }) as { notified: boolean };
      assertEquals(itemANotified, true, "ITEM_A should be marked notified");
      const { notified: itemBNotified } = await concept._getNotifiedStatus({ itemId: ITEM_B }) as { notified: boolean };
      assertEquals(itemBNotified, false, "ITEM_B (future) should not be marked notified");
      const { notified: itemCNotified } = await concept._getNotifiedStatus({ itemId: ITEM_C }) as { notified: boolean };
      assertEquals(itemCNotified, true, "ITEM_C (previously notified) should remain marked notified");
    });
  });

  describe("Combined Scenarios", () => {
    it("should handle checkout, expiry, notify, but checkin fails for expired item", async () => {
      await concept.checkoutItem({ item: ITEM_A, kerb: KERB_ALICE, durationDays: -1 }); // Expired
      await sleep(100);

      const { notifiedKerbs } = await concept.notifyCheckout();
      assertArrayIncludes(notifiedKerbs, [KERB_ALICE], "KERB_ALICE should be notified");
      const { notified } = await concept._getNotifiedStatus({ itemId: ITEM_A }) as { notified: boolean };
      assertEquals(notified, true, "ITEM_A should be marked notified");

      // Now attempt to check in the expired item
      const checkinResult = await concept.checkinItem({ item: ITEM_A });
      assertNotEquals(checkinResult, {}, "Check-in should fail for an expired reservation");
      assert((checkinResult as { error: string }).error.includes("has an expired reservation"), "Error message should confirm expired reservation");

      const { reservation } = await concept._getReservationByItemId({ itemId: ITEM_A }) as { reservation: TestReservationDoc };
      assert(reservation, "The expired reservation should still exist after failed check-in");
    });

    it("should not notify if item is checked in before expiry", async () => {
      await concept.checkoutItem({ item: ITEM_A, kerb: KERB_ALICE, durationDays: 1 }); // Expires tomorrow
      const result = await concept.checkinItem({ item: ITEM_A }); // Check in immediately
      assertEquals(result, {}, "Check-in should be successful");

      await sleep(100); // Wait a bit, but still before original expiry

      const { notifiedKerbs } = await concept.notifyCheckout();
      assertEquals(notifiedKerbs.length, 0, "No notification should be sent as item is checked in");

      const { reservations } = await concept._getAllReservations() as { reservations: TestReservationDoc[] };
      assertEquals(reservations.length, 0, "No reservations should exist after successful check-in");
    });
  });
});
```
