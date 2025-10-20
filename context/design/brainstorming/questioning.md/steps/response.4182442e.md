---
timestamp: 'Sun Oct 19 2025 23:02:11 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_230211.b029c109.md]]'
content_id: 4182442e3f6f7a2db6b53addd36e9b5a659a47955dd5d125f027fe962ac0a359
---

# response:

To create the Deno test suite, we first need to ensure the `database.ts` file is testable regarding its CSV file paths, and provide a plausible `inventoryroles.ts` file, as it was not included in the prompt.

### 1. Update `src/utils/database.ts`

We'll modify `populateInitialData` to accept optional paths for CSV files. This makes it much easier to use temporary files during testing without altering the original hardcoded paths for production use. We also ensure `User` is exported and fix path imports.

```typescript
// file: src/utils/database.ts

// This import loads the `.env` file as environment variables
import "jsr:@std/dotenv/load";
import { Db, MongoClient } from "npm:mongodb";
import { ID } from "./types.ts"; // Adjusted import path
import { generate } from "jsr:@std/uuid/unstable_v7"; // Corrected import to unstable_v7
import { parse } from "jsr:@std/csv";
import * as path from "jsr:@std/path"; // Import path module for absolute paths

// --- New Interfaces for data models ---
interface InventoryItem {
  _id: ID;
  itemName: string;
  category: string;
  tags: string[];
  available: number;
  lastCheckout: Date | null;
  lastKerb: string | null;
}

export interface User { // Export User for use in inventoryroles.ts and tests
  _id: ID;
  kerb: string;
  first: string;
  last: string;
  role: string;
}
// --- End New Interfaces ---

async function initMongoClient() {
  const DB_CONN = Deno.env.get("MONGODB_URL");
  if (DB_CONN === undefined) {
    throw new Error("Could not find environment variable: MONGODB_URL");
  }
  const client = new MongoClient(DB_CONN);
  try {
    await client.connect();
  } catch (e) {
    throw new Error("MongoDB connection failed: " + e);
  }
  return client;
}

async function init() {
  const client = await initMongoClient();
  const DB_NAME = Deno.env.get("DB_NAME");
  if (DB_NAME === undefined) {
    throw new Error("Could not find environment variable: DB_NAME");
  }
  return [client, DB_NAME] as [MongoClient, string];
}

async function dropAllCollections(db: Db): Promise<void> {
  try {
    // Get all collection names
    const collections = await db.listCollections().toArray();

    // Drop each collection
    for (const collection of collections) {
      await db.collection(collection.name).drop();
    }
  } catch (error) {
    console.error("Error dropping collections:", error);
    throw error;
  }
}

/**
 * Populates the MongoDB database with initial inventory items and users from CSV files.
 * This function will drop existing 'items' and 'users' collections before inserting new data.
 * @param db The MongoDB Db instance to populate.
 * @param options Optional paths for inventory and user CSV files.
 */
export async function populateInitialData(
  db: Db,
  options?: { inventoryCsvPath?: string; usersCsvPath?: string },
): Promise<void> {
  console.log("Starting database population...");

  // Determine actual paths, prioritizing options over defaults
  // Use absolute paths to ensure reliability during testing, especially when CWD might vary.
  const defaultInventoryCsvPath = path.join(Deno.cwd(), "src", "utils", "inventory.csv");
  const defaultUsersCsvPath = path.join(Deno.cwd(), "src", "utils", "users.csv");
  
  const inventoryCsvPath = options?.inventoryCsvPath || defaultInventoryCsvPath;
  const usersCsvPath = options?.usersCsvPath || defaultUsersCsvPath;

  // Drop existing 'items' and 'users' collections to ensure a clean slate
  const collectionsToDrop = ["items", "users"];
  for (const collectionName of collectionsToDrop) {
    try {
      await db.collection(collectionName).drop();
      console.log(`Dropped '${collectionName}' collection.`);
    } catch (e) {
      // Ignore "collection not found" error, which means it didn't exist to begin with.
      if (e instanceof Error && e.message.includes("ns not found")) {
        console.log(
          `Collection '${collectionName}' did not exist, no need to drop.`,
        );
      } else {
        console.warn(`Error dropping '${collectionName}' collection:`, e);
      }
    }
  }

  // --- Populate Inventory Items from inventory.csv ---
  try {
    const inventoryRaw = await Deno.readTextFile(inventoryCsvPath);
    const inventoryRecords = parse(inventoryRaw, {
      skipFirstRow: true, // Skip header row
      columns: [
        "ItemName",
        "Category",
        "Tags",
        "Available",
        "LastCheckout",
        "LastKerb",
      ],
    });

    const items: InventoryItem[] = inventoryRecords.map((record: any) => ({
      _id: freshID(),
      itemName: record.ItemName,
      category: record.Category,
      tags: record.Tags
        ? record.Tags.split(",").map((tag: string) => tag.trim()).filter(
          Boolean,
        )
        : [], // Split by comma, trim, and filter out empty strings
      available: parseInt(record.Available, 10), // Convert to number
      lastCheckout: record.LastCheckout ? new Date(record.LastCheckout) : null, // Convert to Date object, or null if empty
      lastKerb: record.LastKerb || null, // Use null if empty string
    }));

    if (items.length > 0) {
      await db.collection<InventoryItem>("items").insertMany(items);
      console.log(
        `Inserted ${items.length} inventory items into 'items' collection.`,
      );
    } else {
      console.log(`No inventory items found in ${inventoryCsvPath} to insert.`);
    }
  } catch (error) {
    console.error(
      `Failed to populate inventory from ${inventoryCsvPath}:`,
      error,
    );
  }

  // --- Populate Users from users.csv ---
  try {
    const usersRaw = await Deno.readTextFile(usersCsvPath);
    const userRecords = parse(usersRaw, {
      skipFirstRow: true, // Skip header row
      columns: ["kerb", "first", "last", "role"],
    });

    const users: User[] = userRecords.map((record: any) => ({
      _id: freshID(),
      kerb: record.kerb,
      first: record.first,
      last: record.last,
      role: record.role,
    }));

    if (users.length > 0) {
      await db.collection<User>("users").insertMany(users);
      console.log(`Inserted ${users.length} users into 'users' collection.`);
    } else {
      console.log(`No users found in ${usersCsvPath} to insert.`);
    }
  } catch (error) {
    console.error(`Failed to populate users from ${usersCsvPath}:`, error);
  }

  console.log("Database population complete.");
}

/**
 * MongoDB database configured by .env
 * @returns {[Db, MongoClient]} initialized database and client
 */
export async function getDb() {
  const [client, DB_NAME] = await init();
  return [client.db(DB_NAME), client];
}

/**
 * Test database initialization
 * @returns {[Db, MongoClient]} initialized test database and client
 */
export async function testDb() {
  const [client, DB_NAME] = await init();
  const test_DB_NAME = `test-${DB_NAME}`; // Use a test-specific DB name
  const test_Db = client.db(test_DB_NAME);
  await dropAllCollections(test_Db); // Clears all collections in the test DB
  return [test_Db, client] as [Db, MongoClient];
}

/**
 * Creates a fresh ID.
 * @returns {ID} UUID v7 generic ID.
 */
export function freshID() {
  return generate() as ID;
}
```

### 2. Create `src/utils/types.ts`

This file is a dependency for `database.ts`.

```typescript
// file: src/utils/types.ts
export type ID = string;
```

### 3. Create `src/utils/inventoryroles.ts`

This file defines the role-based access control logic that the test suite will verify.

```typescript
// file: src/utils/inventoryroles.ts
import { User } from "./database.ts"; // Import User interface from database.ts

export type UserRole = "Viewer" | "Editor" | "Manager" | "Admin";

interface PermissionMatrix {
  canViewInventory: boolean;
  canEditInventory: boolean;
  canCreateInventory: boolean;
  canDeleteInventory: boolean;
  canManageUsers: boolean;
  canChangeUserRoles: boolean;
}

const rolePermissions: Record<UserRole, PermissionMatrix> = {
  Viewer: {
    canViewInventory: true,
    canEditInventory: false,
    canCreateInventory: false,
    canDeleteInventory: false,
    canManageUsers: false,
    canChangeUserRoles: false,
  },
  Editor: {
    canViewInventory: true,
    canEditInventory: true,
    canCreateInventory: true,
    canDeleteInventory: false,
    canManageUsers: false,
    canChangeUserRoles: false,
  },
  Manager: {
    canViewInventory: true,
    canEditInventory: true,
    canCreateInventory: true,
    canDeleteInventory: true,
    canManageUsers: true, // Managers can manage users (e.g., add/remove, view details)
    canChangeUserRoles: false, // But cannot change other users' roles
  },
  Admin: {
    canViewInventory: true,
    canEditInventory: true,
    canCreateInventory: true,
    canDeleteInventory: true,
    canManageUsers: true,
    canChangeUserRoles: true, // Admins have full control, including changing roles
  },
};

export function hasPermission(
  userRole: UserRole,
  permission: keyof PermissionMatrix,
): boolean {
  // Ensure the role exists and has the permission.
  return rolePermissions[userRole]?.[permission] || false;
}

// Helper functions for specific checks
export function canView(userRole: UserRole): boolean {
  return hasPermission(userRole, "canViewInventory");
}

export function canEdit(userRole: UserRole): boolean {
  return hasPermission(userRole, "canEditInventory");
}

export function canCreate(userRole: UserRole): boolean {
  return hasPermission(userRole, "canCreateInventory");
}

export function canDelete(userRole: UserRole): boolean {
  return hasPermission(userRole, "canDeleteInventory");
}

export function canManageUsers(userRole: UserRole): boolean {
  return hasPermission(userRole, "canManageUsers");
}

export function canChangeUserRoles(userRole: UserRole): boolean {
  return hasPermission(userRole, "canChangeUserRoles");
}
```

### 4. Create `src/utils/inventory.csv`

A minimal placeholder, as it's required by `populateInitialData`.

```csv
# file: src/utils/inventory.csv
ItemName,Category,Tags,Available,LastCheckout,LastKerb
Laptop,Electronics,Tech,5,2023-10-26T10:00:00Z,kerb1
Monitor,Electronics,Display,10,2023-10-25T11:00:00Z,kerb2
```

### 5. Create the Deno Test Suite `test/inventoryroles.test.ts`

This test suite will:

1. Create a temporary directory and temporary CSV files (`users.csv` and `inventory.csv`).
2. Initialize a clean test MongoDB database using `testDb()`.
3. Populate the database using `populateInitialData()`, pointing it to the temporary CSVs.
4. Fetch the populated users from the database.
5. Run various assertions using the role-based access control functions from `inventoryroles.ts` for each user role.
6. Clean up the temporary files and close the database connection.

```typescript
// file: test/inventoryroles.test.ts
import { assertEquals, assert } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import {
  Db,
  MongoClient,
} from "npm:mongodb";
import {
  populateInitialData,
  testDb,
  User,
} from "../src/utils/database.ts";
import {
  canView,
  canEdit,
  canCreate,
  canDelete,
  canManageUsers,
  canChangeUserRoles,
  UserRole,
} from "../src/utils/inventoryroles.ts";

// Define temporary file paths using Deno.cwd() to ensure absolute paths
const tempDir = join(Deno.cwd(), "temp_test_data");
const tempUsersCsvPath = join(tempDir, "temp_users.csv");
const tempInventoryCsvPath = join(tempDir, "temp_inventory.csv");

// Sample CSV data for testing different user roles
const testUsersCsvContent = `kerb,first,last,role
viewer1,John,Doe,Viewer
editor1,Jane,Smith,Editor
manager1,Robert,Johnson,Manager
admin1,Alice,Williams,Admin
`;

// Sample inventory data (minimal, as roles tests don't depend on actual inventory)
const testInventoryCsvContent = `ItemName,Category,Tags,Available,LastCheckout,LastKerb
TempItem1,CategoryA,tag1,10,,
TempItem2,CategoryB,tag2,5,,
`;

Deno.test("Role-Based Access Control Functionality", async (t) => {
  let db: Db;
  let client: MongoClient;
  let users: User[];

  // Setup: Create temporary files and populate test database
  await t.step("Setup test environment", async () => {
    console.log("Setting up test environment...");
    // 1. Create temporary directory
    await Deno.mkdir(tempDir, { recursive: true });

    // 2. Write temporary CSV files
    await Deno.writeTextFile(tempUsersCsvPath, testUsersCsvContent);
    await Deno.writeTextFile(tempInventoryCsvPath, testInventoryCsvContent);
    console.log(`Temporary users.csv created at: ${tempUsersCsvPath}`);
    console.log(`Temporary inventory.csv created at: ${tempInventoryCsvPath}`);


    // 3. Initialize test database and populate with temporary data
    [db, client] = await testDb();
    await populateInitialData(db, {
      usersCsvPath: tempUsersCsvPath,
      inventoryCsvPath: tempInventoryCsvPath,
    });

    // 4. Fetch users from the test database to verify population and use in tests
    users = await db.collection<User>("users").find().toArray();
    assert(users.length === 4, `Expected 4 users, got ${users.length}`);
    console.log("Test database populated with users:", users.map(u => u.kerb));
  });

  // Test cases for each role's permissions
  await t.step("Viewer role permissions", () => {
    const viewer = users.find((u) => u.role === "Viewer");
    assert(viewer !== undefined, "Viewer user not found in database.");
    const role = viewer.role as UserRole;

    console.log(`Testing Viewer (${role}) permissions...`);
    assertEquals(canView(role), true, "Viewer should be able to view inventory");
    assertEquals(canEdit(role), false, "Viewer should NOT be able to edit inventory");
    assertEquals(canCreate(role), false, "Viewer should NOT be able to create inventory");
    assertEquals(canDelete(role), false, "Viewer should NOT be able to delete inventory");
    assertEquals(canManageUsers(role), false, "Viewer should NOT be able to manage users");
    assertEquals(canChangeUserRoles(role), false, "Viewer should NOT be able to change user roles");
  });

  await t.step("Editor role permissions", () => {
    const editor = users.find((u) => u.role === "Editor");
    assert(editor !== undefined, "Editor user not found in database.");
    const role = editor.role as UserRole;

    console.log(`Testing Editor (${role}) permissions...`);
    assertEquals(canView(role), true, "Editor should be able to view inventory");
    assertEquals(canEdit(role), true, "Editor should be able to edit inventory");
    assertEquals(canCreate(role), true, "Editor should be able to create inventory");
    assertEquals(canDelete(role), false, "Editor should NOT be able to delete inventory");
    assertEquals(canManageUsers(role), false, "Editor should NOT be able to manage users");
    assertEquals(canChangeUserRoles(role), false, "Editor should NOT be able to change user roles");
  });

  await t.step("Manager role permissions", () => {
    const manager = users.find((u) => u.role === "Manager");
    assert(manager !== undefined, "Manager user not found in database.");
    const role = manager.role as UserRole;

    console.log(`Testing Manager (${role}) permissions...`);
    assertEquals(canView(role), true, "Manager should be able to view inventory");
    assertEquals(canEdit(role), true, "Manager should be able to edit inventory");
    assertEquals(canCreate(role), true, "Manager should be able to create inventory");
    assertEquals(canDelete(role), true, "Manager should be able to delete inventory");
    assertEquals(canManageUsers(role), true, "Manager should be able to manage users");
    assertEquals(canChangeUserRoles(role), false, "Manager should NOT be able to change user roles");
  });

  await t.step("Admin role permissions", () => {
    const admin = users.find((u) => u.role === "Admin");
    assert(admin !== undefined, "Admin user not found in database.");
    const role = admin.role as UserRole;

    console.log(`Testing Admin (${role}) permissions...`);
    assertEquals(canView(role), true, "Admin should be able to view inventory");
    assertEquals(canEdit(role), true, "Admin should be able to edit inventory");
    assertEquals(canCreate(role), true, "Admin should be able to create inventory");
    assertEquals(canDelete(role), true, "Admin should be able to delete inventory");
    assertEquals(canManageUsers(role), true, "Admin should be able to manage users");
    assertEquals(canChangeUserRoles(role), true, "Admin should be able to change user roles");
  });

  // Teardown: Clean up temporary files and close database connection
  await t.step("Teardown test environment", async () => {
    console.log("Cleaning up test environment...");
    await client.close(); // Close MongoDB client connection
    await Deno.remove(tempDir, { recursive: true }); // Remove temporary directory and its contents
    console.log("Cleaned up temporary files and closed DB connection.");
  });
});
```

### To Run the Test Suite:

1. **Set up Project Structure**:
   ```
   .
   ├── .env                # For MongoDB connection details
   ├── src/
   │   └── utils/
   │       ├── database.ts
   │       ├── inventory.csv
   │       ├── inventoryroles.ts
   │       └── types.ts
   └── test/
       └── inventoryroles.test.ts
   ```

2. **Create a `.env` file** in the project root with your MongoDB connection string and a database name. The test suite will create a test-specific database based on `DB_NAME`.
   ```env
   MONGODB_URL=mongodb://localhost:27017
   DB_NAME=my_inventory_app
   ```
   *Ensure you have a MongoDB instance running at `localhost:27017` or update the `MONGODB_URL`.*

3. **Run the tests** using Deno:
   ```bash
   deno test --allow-read --allow-write --allow-env --allow-net test/inventoryroles.test.ts
   ```
   * `--allow-read`, `--allow-write`: Needed for creating and reading temporary CSV files.
   * `--allow-env`: Needed to load environment variables from `.env` and access `MONGODB_URL`, `DB_NAME`.
   * `--allow-net`: Needed to connect to the MongoDB server.

This setup provides a robust and clean way to test your role-based access control logic using temporary files and a dedicated test database.
