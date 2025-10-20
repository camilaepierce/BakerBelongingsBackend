---
timestamp: 'Sun Oct 19 2025 23:09:55 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_230955.3b0ecc22.md]]'
content_id: dcf8f3aa1e536081c83e39f4e77994cb33dcb90afda540fb912cc4c7f30a5730
---

# response:

To create the Deno test suite as requested, we need to address a few key points:

1. **Temporary Files**: The `database.ts`'s `populateInitialData` method hardcodes paths to `src/utils/users.csv` and `src/utils/inventory.csv`. To make this work with temporary files without modifying `database.ts`, we will create a temporary `src/utils` directory and place our test CSVs (and a mock `types.ts` for imports) inside it for the duration of the tests, then clean them up.
2. **Missing `types.ts`**: The provided `database.ts` and `inventoryroles.ts` import `ID` and `Empty` from `@utils/types.ts`. Since `types.ts` is not provided, we will create a temporary mock `src/utils/types.ts` file alongside the CSVs.
3. **Test Structure**: We will use Deno's `Deno.test` for an organized test suite, initializing a clean database for each run using `testDb()`, populating it with our temporary CSVs via `populateInitialData`, and then testing each method of `RolesConcept`.

The temporary files (`src/utils/types.ts`, `src/utils/users.csv`, `src/utils/inventory.csv`) will be created in the project's `src/utils` directory during setup and deleted during cleanup, respecting the constraint against creating/modifying *permanent* files.

```typescript
// test_roles.ts
// To run this test suite:
// 1. Ensure you have a `.env` file with MONGODB_URL and DB_NAME defined (e.g., MONGODB_URL=mongodb://localhost:27017 DB_NAME=inventory_test)
// 2. Place this file at the root of your project.
// 3. Ensure src/utils/database.ts and src/concepts/inventoryroles.ts exist at their respective paths.
// 4. Run `deno test --allow-read --allow-write --allow-env --allow-net --allow-run test_roles.ts`

import {
  assertEquals,
  assertExists,
  assertFalse,
  assertRejects,
  assertTrue,
} from "jsr:@std/assert";
import { Db, MongoClient } from "npm:mongodb";

// Assuming test_roles.ts is at the project root, and source files are in src/
// Adjust these paths if your project structure is different
import { testDb, populateInitialData, freshID } from "./src/utils/database.ts";
import RolesConcept from "./src/concepts/inventoryroles.ts";

// --- Mock @utils/types.ts and CSV content for temporary files ---
// These will be written to src/utils/ during setup and removed during cleanup.
const SRC_DIR = "src";
const UTILS_DIR = `${SRC_DIR}/utils`;
const TYPES_TS_PATH = `${UTILS_DIR}/types.ts`;
const USER_CSV_PATH = `${UTILS_DIR}/users.csv`;
const INVENTORY_CSV_PATH = `${UTILS_DIR}/inventory.csv`;

const TYPES_TS_CONTENT = `
// Temporary types.ts for testing purposes, required by database.ts and inventoryroles.ts
export type ID = string;
export type Empty = Record<string, never>; // Represents an empty object {}
`;

const USERS_CSV_CONTENT = `kerb,first,last,role
camjohnson,Cameron,Johnson,resident
samdoer,Samantha,Doer,desk
alewilson,Alejandro,Wilson,resident
benlee,Benjamin,Lee,resident
campierce,Camila,Pierce,desk
miawang,Mia,Wang,resident
lucgarrison,Lucas,Garrison,resident
zoeclark,Zoey,Clark,houseteam
maxbrown,Max,Brown,resident
evaadams,Eva,Adams,resident
noahkim,Noah,Kim,desk
liamnguyen,Liam,Nguyen,resident
sopjay,Sophia,Jay,houseteam
olinorris,Olivia,Norris,resident
isacole,Isaac,Cole,resident
emmbishop,Emmett,Bishop,desk
harpatel,Harper,Patel,resident
gilramsey,Gillian,Ramsey,resident
roxlee,Roxanne,Lee,houseteam
zacgray,Zachary,Gray,desk
`;

// Dummy inventory data as populateInitialData expects an inventory.csv
const INVENTORY_CSV_CONTENT = `ItemName,Category,Tags,Available,LastCheckout,LastKerb
Laptop,Electronics,IT,5,,
Mouse,Electronics,Peripherals,10,,
Keyboard,Electronics,Peripherals,8,,
Monitor,Electronics,Display,3,,
Projector,Electronics,AV,1,,
`;

// Defining ID and Empty locally for the test file's own use (distinct from the temporary types.ts)
type ID = string;
type Empty = Record<string, never>;

Deno.test("RolesConcept functionality", async (t) => {
  let db: Db;
  let client: MongoClient;
  let rolesConcept: RolesConcept;

  // --- Setup: Create temporary files and initialize database ---
  await t.step("Setup test environment", async () => {
    // Ensure src/utils directory exists for temporary files
    await Deno.mkdir(UTILS_DIR, { recursive: true });

    // Write temporary types.ts, users.csv, and inventory.csv
    await Deno.writeTextFile(TYPES_TS_PATH, TYPES_TS_CONTENT);
    await Deno.writeTextFile(USER_CSV_PATH, USERS_CSV_CONTENT);
    await Deno.writeTextFile(INVENTORY_CSV_PATH, INVENTORY_CSV_CONTENT);

    // Initialize database for testing and populate it
    [db, client] = await testDb();
    // populateInitialData will now find and read the temporary CSVs
    await populateInitialData(db);

    rolesConcept = new RolesConcept(db);
  });

  // Fetch some user IDs from the populated database for use in tests
  let residentUser: ID;
  let deskUser: ID;
  let houseteamUser: ID;
  const nonExistentUser: ID = freshID(); // An ID guaranteed not to be in the DB

  await t.step("Get user IDs from database", async () => {
    const usersCollection = db.collection<{ _id: ID; kerb: string; role: string }>("users");
    const resident = await usersCollection.findOne({ role: "resident" });
    const desk = await usersCollection.findOne({ role: "desk" });
    const houseteam = await usersCollection.findOne({ role: "houseteam" });

    assertExists(resident, "Resident user should exist in DB");
    assertExists(desk, "Desk user should exist in DB");
    assertExists(houseteam, "Houseteam user should exist in DB");

    residentUser = resident!._id;
    deskUser = desk!._id;
    houseteamUser = houseteam!._id;
  });

  // --- Test createPermissionFlag ---
  let adminPermId: ID;
  let checkoutPermId: ID;
  let editInventoryPermId: ID;

  await t.step("createPermissionFlag", async () => {
    const res1 = await rolesConcept.createPermissionFlag({
      name: "Admin",
      actions: ["manageUsers", "managePermissions"],
    });
    assertTrue("permissionFlag" in res1, "Should successfully create Admin permission flag");
    adminPermId = (res1 as { permissionFlag: ID }).permissionFlag;
    assertExists(adminPermId);

    const res2 = await rolesConcept.createPermissionFlag({
      name: "Checkout",
      actions: ["checkoutItem", "returnItem"],
    });
    assertTrue("permissionFlag" in res2, "Should successfully create Checkout permission flag");
    checkoutPermId = (res2 as { permissionFlag: ID }).permissionFlag;
    assertExists(checkoutPermId);

    const res3 = await rolesConcept.createPermissionFlag({
      name: "EditInventory",
      actions: ["addItem", "editItem", "removeItem"],
    });
    assertTrue("permissionFlag" in res3, "Should successfully create EditInventory permission flag");
    editInventoryPermId = (res3 as { permissionFlag: ID }).permissionFlag;
    assertExists(editInventoryPermId);

    // Attempt to create a flag with an existing name (should fail)
    const errorRes = await rolesConcept.createPermissionFlag({
      name: "Admin",
      actions: ["someOtherAction"],
    });
    assertTrue("error" in errorRes, "Should return an error for duplicate permission flag name");
    assertEquals(
      (errorRes as { error: string }).error,
      "Permission Flag with name 'Admin' already exists.",
    );
  });

  // --- Test addActionsToPermissionFlag ---
  await t.step("addActionsToPermissionFlag", async () => {
    let res = await rolesConcept.addActionsToPermissionFlag({
      permission: checkoutPermId,
      newActions: ["viewReports", "checkoutItem"], // "checkoutItem" is a duplicate, should be ignored
    });
    assertFalse("error" in res, "Should successfully add new actions to permission flag");

    // Verify actions were added
    const flagActionsAfterAdd = (await rolesConcept._getPermissionFlagActions({
      permission: checkoutPermId,
    })) as [{ actions: ID[] }];
    assertExists(flagActionsAfterAdd[0]);
    assertTrue(flagActionsAfterAdd[0].actions.includes("viewReports"));
    assertEquals(flagActionsAfterAdd[0].actions.length, 3, "Should have 3 unique actions now"); // checkoutItem, returnItem, viewReports

    // Attempt to add actions to a non-existent permission flag (should fail)
    res = await rolesConcept.addActionsToPermissionFlag({
      permission: freshID(),
      newActions: ["someAction"],
    });
    assertTrue("error" in res, "Should return an error for non-existent permission flag");
  });

  // --- Test removeActionsFromPermissionFlag ---
  await t.step("removeActionsFromPermissionFlag", async () => {
    let res = await rolesConcept.removeActionsFromPermissionFlag({
      permission: checkoutPermId,
      actionsToRemove: ["viewReports", "nonExistentAction"], // "nonExistentAction" should be ignored
    });
    assertFalse("error" in res, "Should successfully remove specified actions from permission flag");

    // Verify actions were removed
    const flagActionsAfterRemove = (await rolesConcept._getPermissionFlagActions({
      permission: checkoutPermId,
    })) as [{ actions: ID[] }];
    assertExists(flagActionsAfterRemove[0]);
    assertFalse(flagActionsAfterRemove[0].actions.includes("viewReports"));
    assertEquals(flagActionsAfterRemove[0].actions.length, 2, "Should have 2 actions left"); // checkoutItem, returnItem

    // Attempt to remove actions from a non-existent permission flag (should fail)
    res = await rolesConcept.removeActionsFromPermissionFlag({
      permission: freshID(),
      actionsToRemove: ["someAction"],
    });
    assertTrue("error" in res, "Should return an error for non-existent permission flag");
  });

  // --- Test promoteUser ---
  await t.step("promoteUser", async () => {
    // Promote residentUser to Admin role
    let res = await rolesConcept.promoteUser({
      user: residentUser,
      permission: adminPermId,
    });
    assertFalse("error" in res, "Should successfully promote residentUser to Admin");

    // Verify residentUser has the Admin permission
    let userPermissions = (await rolesConcept._getUserPermissions({ user: residentUser })) as [{
      permissionFlags: ID[];
    }];
    assertExists(userPermissions[0]);
    assertTrue(userPermissions[0].permissionFlags.includes(adminPermId));
    assertEquals(userPermissions[0].permissionFlags.length, 1);

    // Promote deskUser to Checkout role
    res = await rolesConcept.promoteUser({
      user: deskUser,
      permission: checkoutPermId,
    });
    assertFalse("error" in res, "Should successfully promote deskUser to Checkout");

    // Promote deskUser to EditInventory role (user now has multiple roles)
    res = await rolesConcept.promoteUser({
      user: deskUser,
      permission: editInventoryPermId,
    });
    assertFalse("error" in res, "Should successfully promote deskUser to EditInventory");

    // Verify deskUser has both Checkout and EditInventory permissions
    userPermissions = (await rolesConcept._getUserPermissions({ user: deskUser })) as [{
      permissionFlags: ID[];
    }];
    assertExists(userPermissions[0]);
    assertTrue(userPermissions[0].permissionFlags.includes(checkoutPermId));
    assertTrue(userPermissions[0].permissionFlags.includes(editInventoryPermId));
    assertEquals(userPermissions[0].permissionFlags.length, 2);

    // Attempt to promote with a non-existent permission flag (should fail)
    res = await rolesConcept.promoteUser({
      user: residentUser,
      permission: freshID(),
    });
    assertTrue("error" in res, "Should return an error for invalid permission flag");
  });

  // --- Test demoteUser ---
  await t.step("demoteUser", async () => {
    // Demote deskUser from Checkout role
    let res = await rolesConcept.demoteUser({
      user: deskUser,
      permission: checkoutPermId,
    });
    assertFalse("error" in res, "Should successfully demote deskUser from Checkout");

    // Verify deskUser no longer has Checkout permission but retains EditInventory
    let userPermissions = (await rolesConcept._getUserPermissions({ user: deskUser })) as [{
      permissionFlags: ID[];
    }];
    assertExists(userPermissions[0]);
    assertFalse(userPermissions[0].permissionFlags.includes(checkoutPermId));
    assertTrue(userPermissions[0].permissionFlags.includes(editInventoryPermId));
    assertEquals(userPermissions[0].permissionFlags.length, 1);

    // Attempt to demote deskUser from Checkout again (should fail as not in role)
    res = await rolesConcept.demoteUser({
      user: deskUser,
      permission: checkoutPermId,
    });
    assertTrue("error" in res, "Should return an error for demoting user not in role");

    // Attempt to demote from a non-existent permission flag (should fail)
    res = await rolesConcept.demoteUser({
      user: residentUser,
      permission: freshID(),
    });
    assertTrue("error" in res, "Should return an error for invalid permission flag");

    // Demote deskUser from EditInventory (last role for deskUser), verify document is removed
    res = await rolesConcept.demoteUser({
      user: deskUser,
      permission: editInventoryPermId,
    });
    assertFalse("error" in res, "Should successfully demote deskUser from EditInventory");

    // Verify deskUser now has no roles
    userPermissions = (await rolesConcept._getUserPermissions({ user: deskUser })) as [{
      permissionFlags: ID[];
    }];
    assertExists(userPermissions[0]);
    assertEquals(userPermissions[0].permissionFlags.length, 0, "Desk user should have no roles left");

    // Verify the user's role document was deleted from the collection
    const userRoleDoc = await db.collection("Roles.userRoles").findOne({ _id: deskUser });
    assertFalse(!!userRoleDoc, "UserRoles document for deskUser should be deleted after last role removed");
  });

  // --- Test allowAction ---
  await t.step("allowAction", async () => {
    // Re-promote deskUser to Checkout for this set of tests
    await rolesConcept.promoteUser({ user: deskUser, permission: checkoutPermId });

    // residentUser (Admin) should allow 'manageUsers'
    let res = await rolesConcept.allowAction({ user: residentUser, action: "manageUsers" });
    assertTrue("allowed" in res);
    assertTrue((res as { allowed: boolean }).allowed, "Admin user should allow 'manageUsers'");

    // residentUser (Admin) should NOT allow 'checkoutItem' (not in Checkout role)
    res = await rolesConcept.allowAction({ user: residentUser, action: "checkoutItem" });
    assertTrue("allowed" in res);
    assertFalse((res as { allowed: boolean }).allowed, "Admin user should not allow 'checkoutItem'");

    // deskUser (Checkout) should allow 'checkoutItem'
    res = await rolesConcept.allowAction({ user: deskUser, action: "checkoutItem" });
    assertTrue("allowed" in res);
    assertTrue((res as { allowed: boolean }).allowed, "Desk user should allow 'checkoutItem'");

    // deskUser (Checkout) should NOT allow 'manageUsers'
    res = await rolesConcept.allowAction({ user: deskUser, action: "manageUsers" });
    assertTrue("allowed" in res);
    assertFalse((res as { allowed: boolean }).allowed, "Desk user should not allow 'manageUsers'");

    // houseteamUser (no roles) should NOT allow any action
    res = await rolesConcept.allowAction({ user: houseteamUser, action: "anyAction" });
    assertTrue("allowed" in res);
    assertFalse(
      (res as { allowed: boolean }).allowed,
      "Houseteam user without roles should not allow any action",
    );

    // nonExistentUser should NOT allow any action
    res = await rolesConcept.allowAction({ user: nonExistentUser, action: "anyAction" });
    assertTrue("allowed" in res);
    assertFalse(
      (res as { allowed: boolean }).allowed,
      "Non-existent user should not allow any action",
    );
  });

  // --- Test _getUserPermissions ---
  await t.step("_getUserPermissions", async () => {
    // residentUser has Admin role
    let res = (await rolesConcept._getUserPermissions({ user: residentUser })) as [{
      permissionFlags: ID[];
    }];
    assertExists(res[0]);
    assertEquals(res[0].permissionFlags.length, 1);
    assertTrue(res[0].permissionFlags.includes(adminPermId));

    // deskUser has Checkout role (re-promoted earlier)
    res = (await rolesConcept._getUserPermissions({ user: deskUser })) as [{
      permissionFlags: ID[];
    }];
    assertExists(res[0]);
    assertEquals(res[0].permissionFlags.length, 1);
    assertTrue(res[0].permissionFlags.includes(checkoutPermId));

    // houseteamUser has no roles
    res = (await rolesConcept._getUserPermissions({ user: houseteamUser })) as [{
      permissionFlags: ID[];
    }];
    assertExists(res[0]);
    assertEquals(res[0].permissionFlags.length, 0);

    // A fresh, non-existent user should also return an empty array
    res = (await rolesConcept._getUserPermissions({ user: freshID() })) as [{
      permissionFlags: ID[];
    }];
    assertExists(res[0]);
    assertEquals(res[0].permissionFlags.length, 0);
  });

  // --- Test _getPermissionFlagActions ---
  await t.step("_getPermissionFlagActions", async () => {
    // Admin permission flag actions
    let res = (await rolesConcept._getPermissionFlagActions({ permission: adminPermId })) as [{
      actions: ID[];
    }];
    assertExists(res[0]);
    assertEquals(res[0].actions.length, 2);
    assertTrue(res[0].actions.includes("manageUsers"));
    assertTrue(res[0].actions.includes("managePermissions"));

    // Checkout permission flag actions (after adding/removing viewReports)
    res = (await rolesConcept._getPermissionFlagActions({ permission: checkoutPermId })) as [{
      actions: ID[];
    }];
    assertExists(res[0]);
    assertEquals(res[0].actions.length, 2);
    assertTrue(res[0].actions.includes("checkoutItem"));
    assertTrue(res[0].actions.includes("returnItem"));

    // Attempt to get actions for a non-existent permission flag (should fail)
    const errorRes = await rolesConcept._getPermissionFlagActions({ permission: freshID() });
    assertTrue("error" in errorRes, "Should return an error for non-existent permission flag");
  });

  // --- Test _listAllPermissionFlags ---
  await t.step("_listAllPermissionFlags", async () => {
    const flags = await rolesConcept._listAllPermissionFlags();
    assertEquals(flags.length, 3, "Should list all 3 created permission flags");

    const flagNames = flags.map((f) => f.name);
    assertTrue(flagNames.includes("Admin"));
    assertTrue(flagNames.includes("Checkout"));
    assertTrue(flagNames.includes("EditInventory"));

    const adminFlag = flags.find((f) => f.name === "Admin");
    assertExists(adminFlag);
    assertEquals(adminFlag!.actions.length, 2);
    assertTrue(adminFlag!.actions.includes("manageUsers"));
  });

  // --- Cleanup: Close client and remove temporary files ---
  await t.step("Cleanup test environment", async () => {
    // Close MongoDB client connection
    await client.close();

    // Remove temporary files
    await Deno.remove(TYPES_TS_PATH);
    await Deno.remove(USER_CSV_PATH);
    await Deno.remove(INVENTORY_CSV_PATH);
    // Optionally remove the utils directory if it was created and is now empty,
    // but just removing the files is sufficient to clean up what we created.
    // If src/utils contained other files, they will remain.
  });
});

```
