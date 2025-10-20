Testing script found at [@inventoryreservation.test.ts](src/concepts/Reservation/inventoryreservation.test.ts)

```
  running 1 test from ./src/concepts/Reservation/inventoryreservation.test.ts
  Reservation System Test Suite (CSV-based) ...
    checkoutItem method tests ...
      successfully checks out an available item ... ok (5ms)
      throws error if item not found ... ok (9ms)
      throws error if kerb not found ... ok (1ms)
      throws error if kerb is not a resident ... ok (4ms)
      throws error if item already checked out (CSV data) ... ok (1ms)
      throws error if item already checked out (in-memory reservation) ... ok (2ms)
    checkoutItem method tests ... ok (25ms)
    checkinItem method tests ...
      successfully checks in a reserved item ... ok (2ms)
      throws error if item not found ... ok (1ms)
      throws error if item not currently checked out (no in-memory reservation) ... ok (1ms)
    checkinItem method tests ... ok (4ms)
  Reservation System Test Suite (CSV-based) ... ok (36ms)
```