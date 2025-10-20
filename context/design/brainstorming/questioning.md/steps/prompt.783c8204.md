---
timestamp: 'Sun Oct 19 2025 21:57:00 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_215700.e2e0e391.md]]'
content_id: 783c82044f90dde24f256924b050ba2bfa6cf3713c7cdfbae28da2f83745b75e
---

# prompt: Why would this test case be failing?

await t.step("checkoutItem method tests", async (t) => {
await t.step(
"successfully checks out an available item",
async () => {
await beforeEachStep(); // Manual setup for this test step
const reservation = new Reservation(inventoryCsvPath, usersCsvPath, 7); // 7 days duration

```
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
```

This is checkoutItem:
async checkoutItem(
kerb: string,
itemName: string,
quantity: number,
): Promise<void> {
if (quantity <= 0) {
throw new InvalidQuantityError(quantity);
}

```
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
```
