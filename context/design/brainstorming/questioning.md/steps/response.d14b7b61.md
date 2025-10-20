---
timestamp: 'Sun Oct 19 2025 22:59:44 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_225944.2f2fa873.md]]'
content_id: d14b7b61220e25f1fabdd5522aafefe381098d2e3a915b8374c1ca70c6eea62f
---

# response:

To create a small Deno test suite for the role-based access control, we first need a conceptual `inventoryroles.ts` file. Since it's not provided, I will define a mock version of it that contains common RBAC functions, and then create the test file.

**Assumptions:**

1. **`inventoryroles.ts` location:** `src/utils/inventoryroles.ts`
2. **User Roles:** Based on `users.csv` (implied by `database.ts`), roles include `admin`, `manager`, `member`, `guest`.
3. **Permissions:** Standard permissions for viewing, adding, editing, removing inventory, checking out items, and managing users.

***

### Step 1: Create a Mock `src/utils/inventoryroles.ts`

This file will define the RBAC logic that our test suite will verify.

```typescript
// src/utils/inventoryroles.ts

import { User, InventoryItem } from "@utils/database.ts"; // Assuming relative pathing works or using import maps

/**
 * Checks if a user has the 'admin' role.
 * @param user The user object.
 * @returns True if the user is an admin, false otherwise.
 */
export function isAdmin(user: User): boolean {
  return user.role === "admin";
}

/**
 * Checks if a user has 'manager' or 'admin' privileges.
 * @param user The user object.
 * @returns True if the user is a manager or admin, false otherwise.
 */
export function isManager(user: User): boolean {
  return user.role === "manager" || user.role === "admin";
}

/**
 * Checks if a user has 'member' or higher privileges (manager, admin).
 * @param user The user object.
 * @returns True if the user is a member, manager, or admin, false otherwise.
 */
export function isMember(user: User): boolean {
  return user.role === "member" || user.role === "manager" ||
         user.role === "admin";
}

/**
 * Determines if a user can view inventory items.
 * All roles can view inventory.
 * @param user The user object.
 * @returns True if the user can view inventory, false otherwise.
 */
export function canViewInventory(user: User): boolean {
  // Guests, Members, Managers, Admins can all view inventory
  return user.role === "admin" || user.role === "manager" ||
         user.role === "member" || user.role === "guest";
}

/**
 * Determines if a user can add new inventory items.
 * Only Admins and Managers can add inventory.
 * @param user The user object.
 * @returns True if the user can add inventory, false otherwise.
 */
export function canAddInventory(user: User): boolean {
  return user.role === "admin" || user.role === "manager";
}

/**
 * Determines if a user can edit existing inventory items.
 * Only Admins and Managers can edit inventory.
 * @param user The user object.
 * @returns True if the user can edit inventory, false otherwise.
 */
export function canEditInventory(user: User): boolean {
  return user.role === "admin" || user.role === "manager";
}

/**
 * Determines if a user can remove inventory items.
 * Only Admins can remove inventory.
 * @param user The user object.
 * @returns True if the user can remove inventory, false otherwise.
 */
export function canRemoveInventory(user: User): boolean {
  return user.role === "admin";
}

/**
 * Determines if a user can check out a specific inventory item.
 * Admins, Managers, and Members can check out items if they are available.
 * Guests cannot check out items.
 * @param user The user object.
 * @param item The inventory item to check out.
 * @returns True if the user can check out the item, false otherwise.
 */
export function canCheckoutItem(user: User, item: InventoryItem): boolean {
  if (item.available <= 0) {
    return false; // Cannot check out unavailable items
  }
  return user.role === "admin" || user.role === "manager" ||
         user.role === "member";
}

/**
 * Determines if a user can manage other user accounts (e.g., changing roles).
 * Only Admins can manage users.
 * @param user The user object.
 * @returns True if the user can manage users, false otherwise.
 */
export function canManageUsers(user: User): boolean {
  return user.role === "admin";
}

/**
 * Determines if a user can update the role of another user.
 * Only Admins can update roles. Additionally, an admin cannot promote another user to admin if they are not an admin themselves.
 * (This rule is simplified for this example, usually there's a more complex hierarchy)
 * @param currentUser The user attempting the role change.
 * @param targetUser The user whose role is being changed.
 * @param newRole The role being set.
 * @returns True if the currentUser can update targetUser's role to newRole, false otherwise.
 */
export function canUpdateUserRole(
  currentUser: User,
  targetUser: User,
  newRole: string,
): boolean {
  if (!isAdmin(currentUser)) {
    return false; // Only admins can update roles
  }

  // Admins can change any role, including promoting to manager or admin.
  // A more complex rule might restrict an admin from promoting to 'super-admin' if they are not one.
  return true;
}

```

***

### Step 2: Create the Test Suite `src/utils/inventoryroles.test.ts`

This test suite will use Deno's testing framework, `database.ts` for setup, and our mock `inventoryroles.ts` for the actual RBAC logic.

To run these tests, you'll need:

* A `.env` file with `MONGODB_URL` and `DB_NAME` pointing to your MongoDB instance.
* `src/utils/inventory.csv` and `src/utils/users.csv` files with some initial data (as expected by `database.ts`).

**Example `users.csv`:**

```csv
kerb,first,last,role
adminuser,Admin,User,admin
manageruser,Manager,User,manager
memberuser,Member,User,member
guestuser,Guest,User,guest
```

**Example `inventory.csv`:**

```csv
ItemName,Category,Tags,Available,LastCheckout,LastKerb
Laptop,Electronics,tech,5,2023-10-26,memberuser
Monitor,Electronics,tech,0,2023-10-20,memberuser
Keyboard,Peripherals,input,10,,
Mouse,Peripherals,input,3,2023-11-01,manageruser
```

```typescript
// src/utils/inventoryroles.test.ts

import {
  assert,
  assertEquals,
  assertNotEquals,
} from "jsr:@std/assert";
import { Db, MongoClient } from "npm:mongodb";
import {
  populateInitialData,
  testDb,
  User,
  InventoryItem,
  freshID,
} from "@utils/database.ts"; // Assuming relative pathing or import maps

// Import the RBAC functions to be tested
import {
  isAdmin,
  isManager,
  isMember,
  canViewInventory,
  canAddInventory,
  canEditInventory,
  canRemoveInventory,
  canCheckoutItem,
  canManageUsers,
  canUpdateUserRole,
} from "./inventoryroles.ts"; // Adjust path if necessary

let db: Db;
let client: MongoClient;
let adminUser: User;
let managerUser: User;
let memberUser: User;
let guestUser: User;
let availableItem: InventoryItem;
let unavailableItem: InventoryItem;

// Setup function to run before all tests
Deno.test({
  name: "Setup database and initial data for RBAC tests",
  async fn() {
    [db, client] = await testDb(); // Get a clean test database
    await populateInitialData(db); // Populate it with data from CSVs

    // Retrieve specific users and items from the populated DB for testing
    adminUser = (await db.collection<User>("users").findOne({
      role: "admin",
    }))!;
    managerUser = (await db.collection<User>("users").findOne({
      role: "manager",
    }))!;
    memberUser = (await db.collection<User>("users").findOne({
      role: "member",
    }))!;
    guestUser = (await db.collection<User>("users").findOne({
      role: "guest",
    }))!;

    availableItem = (await db.collection<InventoryItem>("items").findOne({
      available: { $gt: 0 },
    }))!;
    unavailableItem = (await db.collection<InventoryItem>("items").findOne({
      available: 0,
    }))!;

    assert(adminUser, "Admin user should exist");
    assert(managerUser, "Manager user should exist");
    assert(memberUser, "Member user should exist");
    assert(guestUser, "Guest user should exist");
    assert(availableItem, "Available item should exist");
    assert(unavailableItem, "Unavailable item should exist");

    console.log("RBAC test setup complete.");
  },
  sanitizeResources: false, // Deno.test will complain about open connections without this
  sanitizeOps: false,
});

// Test suite for Role-Based Access Control
Deno.test("RBAC Functionality Tests", async (t) => {
  // --- Basic Role Checks ---

  await t.step("isAdmin should correctly identify admin users", () => {
    assert(isAdmin(adminUser), "adminUser should be an admin");
    assertEquals(isAdmin(managerUser), false, "managerUser should not be an admin");
    assertEquals(isAdmin(memberUser), false, "memberUser should not be an admin");
    assertEquals(isAdmin(guestUser), false, "guestUser should not be an admin");
  });

  await t.step("isManager should correctly identify manager or admin users", () => {
    assert(isManager(adminUser), "adminUser should be considered a manager");
    assert(isManager(managerUser), "managerUser should be a manager");
    assertEquals(isManager(memberUser), false, "memberUser should not be a manager");
    assertEquals(isManager(guestUser), false, "guestUser should not be a manager");
  });

  await t.step("isMember should correctly identify member or higher users", () => {
    assert(isMember(adminUser), "adminUser should be considered a member");
    assert(isMember(managerUser), "managerUser should be considered a member");
    assert(isMember(memberUser), "memberUser should be a member");
    assertEquals(isMember(guestUser), false, "guestUser should not be a member");
  });

  // --- Inventory Access Checks ---

  await t.step("canViewInventory should allow all roles to view inventory", () => {
    assert(canViewInventory(adminUser), "Admin should view inventory");
    assert(canViewInventory(managerUser), "Manager should view inventory");
    assert(canViewInventory(memberUser), "Member should view inventory");
    assert(canViewInventory(guestUser), "Guest should view inventory");
  });

  await t.step("canAddInventory should only allow admins and managers", () => {
    assert(canAddInventory(adminUser), "Admin should add inventory");
    assert(canAddInventory(managerUser), "Manager should add inventory");
    assertEquals(canAddInventory(memberUser), false, "Member should not add inventory");
    assertEquals(canAddInventory(guestUser), false, "Guest should not add inventory");
  });

  await t.step("canEditInventory should only allow admins and managers", () => {
    assert(canEditInventory(adminUser), "Admin should edit inventory");
    assert(canEditInventory(managerUser), "Manager should edit inventory");
    assertEquals(canEditInventory(memberUser), false, "Member should not edit inventory");
    assertEquals(canEditInventory(guestUser), false, "Guest should not edit inventory");
  });

  await t.step("canRemoveInventory should only allow admins", () => {
    assert(canRemoveInventory(adminUser), "Admin should remove inventory");
    assertEquals(canRemoveInventory(managerUser), false, "Manager should not remove inventory");
    assertEquals(canRemoveInventory(memberUser), false, "Member should not remove inventory");
    assertEquals(canRemoveInventory(guestUser), false, "Guest should not remove inventory");
  });

  // --- Item Checkout Checks ---

  await t.step("canCheckoutItem should allow eligible roles to checkout available items", () => {
    assert(
      canCheckoutItem(adminUser, availableItem),
      "Admin should checkout available item",
    );
    assert(
      canCheckoutItem(managerUser, availableItem),
      "Manager should checkout available item",
    );
    assert(
      canCheckoutItem(memberUser, availableItem),
      "Member should checkout available item",
    );
    assertEquals(
      canCheckoutItem(guestUser, availableItem),
      false,
      "Guest should not checkout available item",
    );
  });

  await t.step("canCheckoutItem should deny checkout for unavailable items for all roles", () => {
    assertEquals(
      canCheckoutItem(adminUser, unavailableItem),
      false,
      "Admin should not checkout unavailable item",
    );
    assertEquals(
      canCheckoutItem(managerUser, unavailableItem),
      false,
      "Manager should not checkout unavailable item",
    );
    assertEquals(
      canCheckoutItem(memberUser, unavailableItem),
      false,
      "Member should not checkout unavailable item",
    );
    assertEquals(
      canCheckoutItem(guestUser, unavailableItem),
      false,
      "Guest should not checkout unavailable item",
    );
  });

  // --- User Management Checks ---

  await t.step("canManageUsers should only allow admins", () => {
    assert(canManageUsers(adminUser), "Admin should manage users");
    assertEquals(canManageUsers(managerUser), false, "Manager should not manage users");
    assertEquals(canManageUsers(memberUser), false, "Member should not manage users");
    assertEquals(canManageUsers(guestUser), false, "Guest should not manage users");
  });

  await t.step("canUpdateUserRole should allow admin to change roles", () => {
    assert(
      canUpdateUserRole(adminUser, memberUser, "manager"),
      "Admin should change member to manager",
    );
    assert(
      canUpdateUserRole(adminUser, managerUser, "admin"),
      "Admin should promote manager to admin",
    );
    assert(
      canUpdateUserRole(adminUser, guestUser, "member"),
      "Admin should change guest to member",
    );
  });

  await t.step("canUpdateUserRole should deny non-admin users from changing roles", () => {
    assertEquals(
      canUpdateUserRole(managerUser, memberUser, "admin"),
      false,
      "Manager should not change member to admin",
    );
    assertEquals(
      canUpdateUserRole(memberUser, guestUser, "manager"),
      false,
      "Member should not change guest to manager",
    );
    assertEquals(
      canUpdateUserRole(guestUser, memberUser, "admin"),
      false,
      "Guest should not change member to admin",
    );
  });
});

// Teardown function to run after all tests
Deno.test({
  name: "Teardown database",
  async fn() {
    if (client) {
      console.log("Closing MongoDB client connection.");
      await client.close();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

```

***

### How to Run the Tests:

1. **Project Structure:**
   ```
   .
   ├── .env
   ├── deno.json
   └── src
       └── utils
           ├── database.ts
           ├── inventory.csv
           ├── inventoryroles.ts       <-- The mocked RBAC logic
           ├── inventoryroles.test.ts  <-- The test suite
           └── users.csv
   ```

2. **`deno.json` (Import Map and Config):**
   Ensure you have a `deno.json` file in your project root to handle import maps and dependencies. This is crucial for `@utils/database.ts` and `npm:mongodb`.

   ```json
   {
     "imports": {
       "jsr:@std/dotenv/load": "jsr:@std/dotenv/load@0.224.0",
       "jsr:@std/uuid/unstable-v7": "jsr:@std/uuid@0.20.2/unstable-v7",
       "jsr:@std/csv": "jsr:@std/csv@0.224.0",
       "jsr:@std/assert": "jsr:@std/assert@0.224.0",
       "npm:mongodb": "npm:mongodb@6.8.0",
       "@utils/database.ts": "./src/utils/database.ts"
     },
     "tasks": {
       "test": "deno test src/utils/inventoryroles.test.ts"
     }
   }
   ```

3. **`.env` File:**
   Create a `.env` file in your project root with your MongoDB connection string and database name:

   ```
   MONGODB_URL=mongodb://localhost:27017
   DB_NAME=your_inventory_db
   ```

   (Replace with your actual MongoDB connection string and desired database name).

4. **CSV Files:**
   Place `inventory.csv` and `users.csv` in `src/utils/` as shown in the examples above.

5. **Run Tests:**
   Open your terminal in the project root and run:

   ```bash
   deno task test
   ```

This command will:

* Load environment variables from `.env`.
* Connect to MongoDB.
* Create a test database (`test-your_inventory_db`).
* Populate it with data from the CSVs.
* Run all the RBAC tests defined in `inventoryroles.test.ts`.
* Print the test results.
* Close the MongoDB client.

This setup provides a robust way to test your RBAC logic using a clean, isolated database for each test run.
