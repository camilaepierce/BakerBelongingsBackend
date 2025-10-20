# Test Files Output

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
  running 9 tests from ./src/concepts/Roles/inventoryroles.test.ts
  RolesConcept functionality - should create permission flags correctly ... ok (898ms)
  RolesConcept functionality - should add actions to a permission flag ... ok (887ms)
  RolesConcept functionality - should remove actions from a permission flag ... ok (961ms)
  RolesConcept functionality - should promote a user to a role ... ok (972ms)
  RolesConcept functionality - should demote a user from a role ... ok (1s)
  RolesConcept functionality - should allow action if user has required permission ... ok (1s)
  RolesConcept functionality - should retrieve user permissions ... ok (968ms)
  RolesConcept functionality - should retrieve permission flag actions ... ok (797ms)
  RolesConcept functionality - should list all permission flags ... ok (978ms)
  running 4 tests from ./src/concepts/Viewer/inventoryviewer.test.ts
  InventoryViewer: Basic Queries ...
    viewAvailable returns an array of items ... ok (0ms)
    viewItem retrieves a known item correctly ... ok (0ms)
    viewCategory finds items for a valid category ... ok (0ms)
    viewTag finds items for a valid tag ... ok (1ms)
    viewItem throws an error for a non-existent item ... ok (1ms)
    viewCategory returns an empty array for a non-existent category ... ok (0ms)
  InventoryViewer: Basic Queries ... ok (9ms)
  InventoryViewer: LLM-Assisted Queries ...
  ------- post-test output -------
  No config.json present or parse error, using fake LLM for tests
  ----- post-test output end -----
    viewAdjacent returns relevant items based on LLM recommendation ...
  ------- post-test output -------
  LLM called for view tests -> raw response: ["Music Room Key"]
  ----- post-test output end -----
    viewAdjacent returns relevant items based on LLM recommendation ... ok (0ms)
    viewAutocomplete returns completions based on LLM recommendation ...
  ------- post-test output -------
  LLM called for view tests -> raw response: ["Music Room Key"]
  ----- post-test output end -----
    viewAutocomplete returns completions based on LLM recommendation ... ok (0ms)
  InventoryViewer: LLM-Assisted Queries ... ok (4ms)
  Mixed Flow: Viewer and Reservation Interaction ...
    item becomes unavailable after checkout ... ok (4ms)
  Mixed Flow: Viewer and Reservation Interaction ... ok (7ms)
  LLM Mixed Flow ...
  ------- post-test output -------
  No config.json present or parse error, using fake LLM for tests
  ----- post-test output end -----
    LLM recommendation includes the target item ...
  ------- post-test output -------
  LLM called for target=Music Room Key -> raw response: [{"itemName":"Music Room Key","suggestion":"Great for group practice"}]
  ----- post-test output end -----
    LLM recommendation includes the target item ... ok (1ms)
  LLM Mixed Flow ... ok (3ms)

  ok | 14 passed (21 steps) | 0 failed (9s)
```