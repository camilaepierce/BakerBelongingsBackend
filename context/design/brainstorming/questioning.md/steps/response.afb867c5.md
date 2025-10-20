---
timestamp: 'Sun Oct 19 2025 23:23:04 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_232304.2327b3e6.md]]'
content_id: afb867c5540174d17ceef942a211fde3237f9a1f6b76fc79cf13d64e0c35887a
---

# response:

To fulfill the request while respecting all constraints, especially "Do not attempt to create any new files or modify any existing files" and "creates temporary files of the user database found in users.csv", we must address the conflict. The `populateInitialData` function in `database.ts` explicitly reads `src/utils/users.csv` from a file. Since creating this file is forbidden, we cannot use `populateInitialData` to load users directly from the file path.

Instead, the test suite will:

1. **Parse the `users.csv` content directly from a string literal** within the test file.
2. **Manually insert these parsed users** into the test database's `users` collection using the `Db` object obtained from `database.ts`'s `testDb()` function. This way, we "use the database manager" to populate the user database, and the `users.csv` content is effectively "created temporarily" in memory for parsing, without writing any actual files.
3. The test suite will use the `testDb()` function for a clean MongoDB instance for each test run and close the client when done.
4. It will thoroughly test the `RolesConcept` functionalities, including permission flag management, user promotion/demotion, action allowance, and queries.

Here's the Deno test suite (`inventoryroles.test.ts`):

```typescript
// inventoryroles.test.ts

// The following are the provided source files, included here as comments for context.
// In a real project, these would be separate files at `src/utils/types.ts`,
// `src/utils/database.ts`, and `src/utils/inventoryroles.ts` respectively.

/*
// types.ts
declare const Brand: unique symbol;

// Generic ID: effectively a string, but uses type branding.
export type ID = string & { [Brand]: true };

// Empty record type: enforces no entries.
export type Empty = Record<PropertyKey, never>;
*/

/*
// database.ts
// This import loads the `.env` file as environment variables
import "jsr:@std/dotenv/load";
import { Db, MongoClient } from "npm:mongodb";
import { ID } from "@utils/types.ts"; // Assumed path alias
import { generate } from "jsr:@std/uuid/unstable-v7";
import { parse } from "jsr:@std/csv";

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

interface User { // This interface is internal, not exported
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
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
      await db.collection(collection.name).drop();
    }
  } catch (error) {
    console.error("Error dropping collections:", error);
    throw error;
  }
}

// NOTE: This function reads from file paths. For testing, we'll bypass its user loading
// part due to the "no new files" constraint, and manually populate users.
export async function populateInitialData(db: Db): Promise<void> {
  console.log("Starting database population...");

  const collectionsToDrop = ["items", "users"];
  for (const collectionName of collectionsToDrop) {
    try {
      await db.collection(collectionName).drop();
      console.log(`Dropped '${collectionName}' collection.`);
    } catch (e) {
      if (e instanceof Error && e.message.includes("ns not found")) {
        console.log(`Collection '${collectionName}' did not exist, no need to drop.`);
      } else {
        console.warn(`Error dropping '${collectionName}' collection:`, e);
      }
    }
  }

  // --- Populate Inventory Items from inventory.csv ---
  const inventoryCsvPath = "src/utils/inventory.csv";
  try {
    const inventoryRaw = await Deno.readTextFile(inventoryCsvPath);
    const inventoryRecords = parse(inventoryRaw, {
      skipFirstRow: true,
      columns: ["ItemName", "Category", "Tags", "Available", "LastCheckout", "LastKerb"],
    });

    const items: InventoryItem[] = inventoryRecords.map((record: any) => ({
      _id: freshID(),
      itemName: record.ItemName,
      category: record.Category,
      tags: record.Tags ? record.Tags.split(",").map((tag: string) => tag.trim()).filter(Boolean) : [],
      available: parseInt(record.Available, 10),
      lastCheckout: record.LastCheckout ? new Date(record.LastCheckout) : null,
      lastKerb: record.LastKerb || null,
    }));

    if (items.length > 0) {
      await db.collection<InventoryItem>("items").insertMany(items);
      console.log(`Inserted ${items.length} inventory items into 'items' collection.`);
    } else {
      console.log("No inventory items found in inventory.csv to insert.");
    }
  } catch (error) {
    console.error(`Failed to populate inventory from ${inventoryCsvPath}:`, error);
  }

  // --- Populate Users from users.csv ---
  const usersCsvPath = "src/utils/users.csv";
  try {
    const usersRaw = await Deno.readTextFile(usersCsvPath);
    const userRecords = parse(usersRaw, {
      skipFirstRow: true,
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
      console.log("No users found in users.csv to insert.");
    }
  } catch (error) {
    console.error(`Failed to populate users from ${usersCsvPath}:`, error);
  }

  console.log("Database population complete.");
}

export async function getDb() {
  const [client, DB_NAME] = await init();
  return [client.db(DB_NAME), client];
}

export async function testDb() {
  const [client, DB_NAME] = await init();
  const test_DB_NAME = `test-${DB_NAME}`;
  const test_Db = client.db(test_DB_NAME);
  await dropAllCollections(test_Db);
  return [test_Db, client] as [Db, MongoClient];
}

export function freshID() {
  return generate() as ID;
}
*/

/*
// inventoryroles.ts
import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts"; // Assumed path alias
import { freshID } from "@utils/database.ts"; // Assumed path alias

const PREFIX = "Roles" + ".";

type User = ID;
type Action = ID;
type PermissionFlag = ID;

interface UserRoles {
  _id: User;
  permissionFlags: PermissionFlag[];
}

interface PermissionFlagDocument {
  _id: PermissionFlag;
  name: string;
  actions: Action[];
}

export default class RolesConcept {
  private userRoles: Collection<UserRoles>;
  private permissionFlags: Collection<PermissionFlagDocument>;

  constructor(private readonly db: Db) {
    this.userRoles = this.db.collection(PREFIX + "userRoles");
    this.permissionFlags = this.db.collection(PREFIX + "permissionFlags");
  }

  async createPermissionFlag(
    { name, actions }: { name: string; actions: Action[] },
  ): Promise<{ permissionFlag: PermissionFlag } | { error: string }> {
    if (await this.permissionFlags.findOne({ name })) {
      return { error: `Permission Flag with name '${name}' already exists.` };
    }

    const newPermissionFlag: PermissionFlagDocument = {
      _id: freshID(),
      name,
      actions,
    };
    await this.permissionFlags.insertOne(newPermissionFlag);
    return { permissionFlag: newPermissionFlag._id };
  }

  async addActionsToPermissionFlag(
    { permission, newActions }: {
      permission: PermissionFlag;
      newActions: Action[];
    },
  ): Promise<Empty | { error: string }> {
    const result = await this.permissionFlags.updateOne(
      { _id: permission },
      { $addToSet: { actions: { $each: newActions } } },
    );

    if (result.matchedCount === 0) {
      return { error: `Permission Flag with ID '${permission}' not found.` };
    }
    return {};
  }

  async removeActionsFromPermissionFlag(
    { permission, actionsToRemove }: {
      permission: PermissionFlag;
      actionsToRemove: Action[];
    },
  ): Promise<Empty | { error: string }> {
    const result = await this.permissionFlags.updateOne(
      { _id: permission },
      { $pullAll: { actions: actionsToRemove } },
    );

    if (result.matchedCount === 0) {
      return { error: `Permission Flag with ID '${permission}' not found.` };
    }
    return {};
  }

  async promoteUser(
    { user, permission }: { user: User; permission: PermissionFlag },
  ): Promise<Empty | { error: string }> {
    const permissionExists = await this.permissionFlags.findOne({
      _id: permission,
    });
    if (!permissionExists) {
      return { error: `Permission Flag with ID '${permission}' is not valid.` };
    }

    await this.userRoles.updateOne(
      { _id: user },
      { $addToSet: { permissionFlags: permission } },
      { upsert: true },
    );

    return {};
  }

  async demoteUser(
    { user, permission }: { user: User; permission: PermissionFlag },
  ): Promise<Empty | { error: string }> {
    const permissionExists = await this.permissionFlags.findOne({
      _id: permission,
    });
    if (!permissionExists) {
      return { error: `Permission Flag with ID '${permission}' is not valid.` };
    }

    const userRoleDoc = await this.userRoles.findOne({ _id: user });
    if (!userRoleDoc || !userRoleDoc.permissionFlags.includes(permission)) {
      return {
        error:
          `User '${user}' is not part of the role defined by Permission Flag '${permission}'.`,
      };
    }

    const result = await this.userRoles.updateOne(
      { _id: user },
      { $pull: { permissionFlags: permission } },
    );

    if (result.modifiedCount > 0) {
      const updatedUserRoleDoc = await this.userRoles.findOne({ _id: user });
      if (updatedUserRoleDoc?.permissionFlags.length === 0) {
        await this.userRoles.deleteOne({ _id: user });
      }
    }

    return {};
  }

  async allowAction(
    { user, action }: { user: User; action: Action },
  ): Promise<{ allowed: boolean } | { error: string }> {
    const userRoleDoc = await this.userRoles.findOne({ _id: user });

    if (!userRoleDoc || userRoleDoc.permissionFlags.length === 0) {
      return { allowed: false };
    }

    const userPermissions = await this.permissionFlags.find({
      _id: { $in: userRoleDoc.permissionFlags },
    }).toArray();

    const allowed = userPermissions.some((perm) =>
      perm.actions.includes(action)
    );

    return { allowed };
  }

  async _getUserPermissions(
    { user }: { user: User },
  ): Promise<{ permissionFlags: PermissionFlag[] }[] | { error: string }> {
    const userRoleDoc = await this.userRoles.findOne({ _id: user });
    return [{ permissionFlags: userRoleDoc?.permissionFlags || [] }];
  }

  async _getPermissionFlagActions(
    { permission }: { permission: PermissionFlag },
  ): Promise<{ actions: Action[] }[] | { error: string }> {
    const permissionDoc = await this.permissionFlags.findOne({
      _id: permission,
    });
    if (!permissionDoc) {
      return { error: `Permission Flag with ID '${permission}' not found.` };
    }
    return [{ actions: permissionDoc.actions }];
  }

  async _listAllPermissionFlags(): Promise<
    { id: PermissionFlag; name: string; actions: Action[] }[]
  > {
    const flags = await this.permissionFlags.find({}).toArray();
    return flags.map((flag) => ({
      id: flag._id,
      name: flag.name,
      actions: flag.actions,
    }));
  }
}
*/

// --- Test Suite Implementation ---

// This import loads the `.env` file as environment variables, required by database.ts
import "jsr:@std/dotenv/load";

// Assume these modules are in the same directory (e.g., `src/utils/`) or correctly aliased
import { ID, Empty } from "./types.ts";
import { testDb, freshID } from "./database.ts";
import RolesConcept from "./inventoryroles.ts";
import { MongoClient, Db } from "npm:mongodb";
import { parse } from "jsr:@std/csv";
import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
} from "jsr:@std/assert";

// --- users.csv content (provided in the prompt) ---
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
zacgray,Zachary,Gray,desk`;

// Interface for User (copied from database.ts since it's not exported)
// This interface defines the structure of user objects in our test database.
interface TestUser {
  _id: ID;
  kerb: string;
  first: string;
  last: string;
  role: string;
}

/**
 * Parses the USERS_CSV_CONTENT string and inserts users into the provided MongoDB Db.
 * This helper ensures the 'users' collection is populated without reading from a file,
 * adhering to the "no new files" constraint.
 * @param db The MongoDB Db instance to populate.
 * @returns A promise that resolves to an array of the inserted TestUser objects.
 */
async function populateTestUsers(db: Db): Promise<TestUser[]> {
  const userRecords = parse(USERS_CSV_CONTENT, {
    skipFirstRow: true, // Skip header row
    columns: ["kerb", "first", "last", "role"],
  });

  const users: TestUser[] = userRecords.map((record: any) => ({
    _id: freshID(), // Generate a new ID for each user
    kerb: record.kerb,
    first: record.first,
    last: record.last,
    role: record.role,
  }));

  if (users.length > 0) {
    // Drop the 'users' collection first to ensure a clean slate specifically for users.
    // testDb() also drops all collections, but this adds an extra layer of clarity
    // and mimics how populateInitialData handles specific collections.
    try {
      await db.collection("users").drop();
    } catch (e) {
      // Ignore "collection not found" error, which means it didn't exist to begin with.
      if (!(e instanceof Error && e.message.includes("ns not found"))) {
        throw e;
      }
    }
    await db.collection<TestUser>("users").insertMany(users);
  }
  return users;
}

Deno.test("RolesConcept functionality", async (t) => {
  let db: Db; // MongoDB database instance
  let client: MongoClient; // MongoDB client instance
  let rolesConcept: RolesConcept; // Instance of the RolesConcept to test
  let testUsers: TestUser[]; // Array of users populated from CSV content

  // Specific users extracted for easier testing
  let adminUser: TestUser;
  let deskUser: TestUser;
  let residentUser: TestUser;
  let houseTeamUser: TestUser;

  // Setup hook: Runs before each test step in this suite
  t.beforeEach(async () => {
    // Initialize a clean test database and client connection
    [db, client] = await testDb();
    rolesConcept = new RolesConcept(db);

    // Populate the 'users' collection with data from the USERS_CSV_CONTENT string
    testUsers = await populateTestUsers(db);

    // Identify specific users from the populated data for consistent testing
    adminUser = testUsers.find((u) => u.kerb === "zoeclark")!; // Using a 'houseteam' member for potential admin role
    deskUser = testUsers.find((u) => u.kerb === "samdoer")!; // A 'desk' member
    residentUser = testUsers.find((u) => u.kerb === "camjohnson")!; // A 'resident' member
    houseTeamUser = testUsers.find((u) => u.kerb === "sopjay")!; // Another 'houseteam' member

    // Assert that the test users were found
    assertExists(adminUser, "adminUser should be found");
    assertExists(deskUser, "deskUser should be found");
    assertExists(residentUser, "residentUser should be found");
    assertExists(houseTeamUser, "houseTeamUser should be found");
  });

  // Teardown hook: Runs once after all tests in this suite have completed
  t.afterAll(async () => {
    // Close the MongoDB connection to free up resources
    if (client) {
      await client.close();
    }
  });

  await t.step("should create permission flags correctly", async () => {
    // Define unique actions for different roles
    const adminActions: ID[] = [freshID() as ID, freshID() as ID, freshID() as ID];
    const deskActions: ID[] = [freshID() as ID, freshID() as ID];

    // Create an "Admin" permission flag
    const adminPermResult = await rolesConcept.createPermissionFlag({
      name: "Admin",
      actions: adminActions,
    });
    assert("permissionFlag" in adminPermResult, "Admin permission flag creation should succeed");
    const adminPermissionId = adminPermResult.permissionFlag;

    // Create a "DeskStaff" permission flag
    const deskPermResult = await rolesConcept.createPermissionFlag({
      name: "DeskStaff",
      actions: deskActions,
    });
    assert("permissionFlag" in deskPermResult, "DeskStaff permission flag creation should succeed");
    const deskPermissionId = deskPermResult.permissionFlag;

    // List all created permission flags and verify their details
    const listFlags = await rolesConcept._listAllPermissionFlags();
    assertEquals(listFlags.length, 2, "Should have exactly 2 permission flags");

    const adminFlag = listFlags.find((f) => f.name === "Admin");
    assertExists(adminFlag, "Admin flag should exist in the list");
    assertEquals(adminFlag.id, adminPermissionId, "Admin flag ID should match");
    assertEquals(adminFlag.actions.sort(), adminActions.sort(), "Admin flag actions should match");

    const deskFlag = listFlags.find((f) => f.name === "DeskStaff");
    assertExists(deskFlag, "DeskStaff flag should exist in the list");
    assertEquals(deskFlag.id, deskPermissionId, "DeskStaff flag ID should match");
    assertEquals(deskFlag.actions.sort(), deskActions.sort(), "DeskStaff flag actions should match");

    // Attempt to create a permission flag with a duplicate name, expecting an error
    const duplicateResult = await rolesConcept.createPermissionFlag({
      name: "Admin",
      actions: [],
    });
    assert("error" in duplicateResult, "Creating duplicate flag should return an error");
    assertEquals(
      duplicateResult.error,
      "Permission Flag with name 'Admin' already exists.",
      "Error message for duplicate name should be correct",
    );
  });

  await t.step("should add actions to a permission flag", async () => {
    // Create an initial permission flag with one action
    const initialAction: ID = freshID() as ID;
    const permResult = await rolesConcept.createPermissionFlag({
      name: "Editor",
      actions: [initialAction],
    });
    assert("permissionFlag" in permResult, "Editor permission flag creation should succeed");
    const editorPermissionId = permResult.permissionFlag;

    // Add a new action to the flag
    const newAction: ID = freshID() as ID;
    const addResult = await rolesConcept.addActionsToPermissionFlag({
      permission: editorPermissionId,
      newActions: [newAction],
    });
    assert("error" not in addResult, "Adding new action should not return an error");

    // Verify the flag now has two actions
    const updatedFlagActions = await rolesConcept._getPermissionFlagActions({
      permission: editorPermissionId,
    });
    assert(Array.isArray(updatedFlagActions), "Should return an array of actions");
    assertEquals(updatedFlagActions[0].actions.length, 2, "Flag should now have 2 actions");
    assert(updatedFlagActions[0].actions.includes(newAction), "New action should be included");
    assert(updatedFlagActions[0].actions.includes(initialAction), "Initial action should still be included");

    // Attempt to add an existing action, ensuring no duplicates are added
    const addExistingResult = await rolesConcept.addActionsToPermissionFlag({
      permission: editorPermissionId,
      newActions: [initialAction],
    });
    assert("error" not in addExistingResult, "Adding existing action should not return an error");
    const afterAddExisting = await rolesConcept._getPermissionFlagActions({
      permission: editorPermissionId,
    });
    assertEquals(afterAddExisting[0].actions.length, 2, "Adding existing action should not increase count");

    // Test adding actions to a non-existent permission flag, expecting an error
    const nonExistentPerm: ID = freshID() as ID;
    const errorResult = await rolesConcept.addActionsToPermissionFlag({
      permission: nonExistentPerm,
      newActions: [freshID() as ID],
    });
    assert("error" in errorResult, "Adding action to non-existent flag should return an error");
    assertEquals(
      errorResult.error,
      `Permission Flag with ID '${nonExistentPerm}' not found.`,
      "Error message for non-existent flag should be correct",
    );
  });

  await t.step("should remove actions from a permission flag", async () => {
    // Create a permission flag with three actions
    const action1: ID = freshID() as ID;
    const action2: ID = freshID() as ID;
    const action3: ID = freshID() as ID;

    const permResult = await rolesConcept.createPermissionFlag({
      name: "Viewer",
      actions: [action1, action2, action3],
    });
    assert("permissionFlag" in permResult, "Viewer permission flag creation should succeed");
    const viewerPermissionId = permResult.permissionFlag;

    // Remove one action
    const removeResult = await rolesConcept.removeActionsFromPermissionFlag({
      permission: viewerPermissionId,
      actionsToRemove: [action2],
    });
    assert("error" not in removeResult, "Removing action should not return an error");

    // Verify the flag now has two actions and the removed action is gone
    const updatedFlagActions = await rolesConcept._getPermissionFlagActions({
      permission: viewerPermissionId,
    });
    assert(Array.isArray(updatedFlagActions), "Should return an array of actions");
    assertEquals(updatedFlagActions[0].actions.length, 2, "Flag should now have 2 actions");
    assert(!updatedFlagActions[0].actions.includes(action2), "Removed action should not be present");
    assert(updatedFlagActions[0].actions.includes(action1), "Action 1 should still be present");
    assert(updatedFlagActions[0].actions.includes(action3), "Action 3 should still be present");

    // Attempt to remove a non-existent action, ensuring no error or change
    const nonExistentAction: ID = freshID() as ID;
    const removeNonExistentResult = await rolesConcept.removeActionsFromPermissionFlag(
      { permission: viewerPermissionId, actionsToRemove: [nonExistentAction] },
    );
    assert("error" not in removeNonExistentResult, "Removing non-existent action should not return an error");
    const afterRemoveNonExistent = await rolesConcept._getPermissionFlagActions(
      { permission: viewerPermissionId },
    );
    assertEquals(afterRemoveNonExistent[0].actions.length, 2, "Action count should remain 2");

    // Test removing actions from a non-existent permission flag, expecting an error
    const nonExistentPerm: ID = freshID() as ID;
    const errorResult = await rolesConcept.removeActionsFromPermissionFlag({
      permission: nonExistentPerm,
      actionsToRemove: [freshID() as ID],
    });
    assert("error" in errorResult, "Removing action from non-existent flag should return an error");
    assertEquals(
      errorResult.error,
      `Permission Flag with ID '${nonExistentPerm}' not found.`,
      "Error message for non-existent flag should be correct",
    );
  });

  await t.step("should promote a user to a role", async () => {
    const adminAction: ID = freshID() as ID;
    const permResult = await rolesConcept.createPermissionFlag({
      name: "Admin",
      actions: [adminAction],
    });
    assert("permissionFlag" in permResult, "Admin permission flag creation should succeed");
    const adminPermissionId = permResult.permissionFlag;

    // Promote 'adminUser' to the "Admin" role
    const promoteResult = await rolesConcept.promoteUser({
      user: adminUser._id,
      permission: adminPermissionId,
    });
    assert("error" not in promoteResult, "Promoting user should not return an error");

    // Verify 'adminUser' now has the "Admin" permission
    const userPermissions = await rolesConcept._getUserPermissions({
      user: adminUser._id,
    });
    assert(Array.isArray(userPermissions), "Should return an array of permissions");
    assertEquals(userPermissions[0].permissionFlags.length, 1, "User should have 1 permission flag");
    assert(userPermissions[0].permissionFlags.includes(adminPermissionId), "User should have Admin permission");

    // Promote the same user to the same role again, should not add duplicates
    await rolesConcept.promoteUser({
      user: adminUser._id,
      permission: adminPermissionId,
    });
    const userPermissionsAfterDuplicate = await rolesConcept._getUserPermissions(
      { user: adminUser._id },
    );
    assertEquals(userPermissionsAfterDuplicate[0].permissionFlags.length, 1, "Promoting again should not add duplicate");

    // Attempt to promote a user to a non-existent permission flag, expecting an error
    const nonExistentPerm: ID = freshID() as ID;
    const errorResult = await rolesConcept.promoteUser({
      user: residentUser._id,
      permission: nonExistentPerm,
    });
    assert("error" in errorResult, "Promoting to non-existent flag should return an error");
    assertEquals(
      errorResult.error,
      `Permission Flag with ID '${nonExistentPerm}' is not valid.`,
      "Error message for non-existent permission should be correct",
    );
  });

  await t.step("should demote a user from a role", async () => {
    const adminAction: ID = freshID() as ID;
    const deskAction: ID = freshID() as ID;

    const adminPermResult = await rolesConcept.createPermissionFlag({
      name: "Admin",
      actions: [adminAction],
    });
    assert("permissionFlag" in adminPermResult);
    const adminPermissionId = adminPermResult.permissionFlag;

    const deskPermResult = await rolesConcept.createPermissionFlag({
      name: "DeskStaff",
      actions: [deskAction],
    });
    assert("permissionFlag" in deskPermResult);
    const deskPermissionId = deskPermResult.permissionFlag;

    // Promote 'adminUser' to both "Admin" and "DeskStaff" roles
    await rolesConcept.promoteUser({
      user: adminUser._id,
      permission: adminPermissionId,
    });
    await rolesConcept.promoteUser({
      user: adminUser._id,
      permission: deskPermissionId,
    });

    let userPermissions = await rolesConcept._getUserPermissions({
      user: adminUser._id,
    });
    assertEquals(userPermissions[0].permissionFlags.length, 2, "User should initially have 2 permissions");

    // Demote 'adminUser' from the "Admin" role
    const demoteResult = await rolesConcept.demoteUser({
      user: adminUser._id,
      permission: adminPermissionId,
    });
    assert("error" not in demoteResult, "Demoting user should not return an error");

    // Verify 'adminUser' now only has the "DeskStaff" permission
    userPermissions = await rolesConcept._getUserPermissions({
      user: adminUser._id,
    });
    assertEquals(userPermissions[0].permissionFlags.length, 1, "User should now have 1 permission flag");
    assert(!userPermissions[0].permissionFlags.includes(adminPermissionId), "Admin permission should be removed");
    assert(userPermissions[0].permissionFlags.includes(deskPermissionId), "DeskStaff permission should remain");

    // Demote 'adminUser' from the last remaining role ("DeskStaff"),
    // which should remove the user's role document entirely.
    const demoteLastResult = await rolesConcept.demoteUser({
      user: adminUser._id,
      permission: deskPermissionId,
    });
    assert("error" not in demoteLastResult, "Demoting last permission should not return an error");
    userPermissions = await rolesConcept._getUserPermissions({
      user: adminUser._id,
    });
    assertEquals(userPermissions[0].permissionFlags.length, 0, "User should have no permissions after last demotion");

    // Attempt to demote a user from a role they are not part of, expecting an error
    const errorResult = await rolesConcept.demoteUser({
      user: residentUser._id,
      permission: adminPermissionId,
    });
    assert("error" in errorResult, "Demoting from a role not in should return an error");
    assertEquals(
      errorResult.error,
      `User '${residentUser._id}' is not part of the role defined by Permission Flag '${adminPermissionId}'.`,
      "Error message for demoting user not in role should be correct",
    );

    // Attempt to demote from a non-existent permission flag, expecting an error
    const nonExistentPerm: ID = freshID() as ID;
    const errorResult2 = await rolesConcept.demoteUser({
      user: residentUser._id,
      permission: nonExistentPerm,
    });
    assert("error" in errorResult2, "Demoting from non-existent permission should return an error");
    assertEquals(
      errorResult2.error,
      `Permission Flag with ID '${nonExistentPerm}' is not valid.`,
      "Error message for non-existent permission should be correct",
    );
  });

  await t.step("should allow action if user has required permission", async () => {
    // Define unique actions for different levels
    const viewAction: ID = freshID() as ID;
    const editAction: ID = freshID() as ID;
    const deleteAction: ID = freshID() as ID;

    // Create permission flags: Viewer, Editor, Admin
    const viewerPermResult = await rolesConcept.createPermissionFlag({
      name: "Viewer",
      actions: [viewAction],
    });
    assert("permissionFlag" in viewerPermResult);
    const viewerPermissionId = viewerPermResult.permissionFlag;

    const editorPermResult = await rolesConcept.createPermissionFlag({
      name: "Editor",
      actions: [viewAction, editAction],
    });
    assert("permissionFlag" in editorPermResult);
    const editorPermissionId = editorPermResult.permissionFlag;

    const adminPermResult = await rolesConcept.createPermissionFlag({
      name: "Admin",
      actions: [viewAction, editAction, deleteAction],
    });
    assert("permissionFlag" in adminPermResult);
    const adminPermissionId = adminPermResult.permissionFlag;

    // Promote 'residentUser' to "Viewer" role
    await rolesConcept.promoteUser({
      user: residentUser._id,
      permission: viewerPermissionId,
    });

    // Test 'residentUser' (Viewer) capabilities
    let allowResult = await rolesConcept.allowAction({
      user: residentUser._id,
      action: viewAction,
    });
    assert("allowed" in allowResult);
    assertEquals(allowResult.allowed, true, "Viewer should be allowed to view");

    allowResult = await rolesConcept.allowAction({
      user: residentUser._id,
      action: editAction,
    });
    assert("allowed" in allowResult);
    assertEquals(allowResult.allowed, false, "Viewer should NOT be allowed to edit");

    // Promote 'deskUser' to "Editor" role
    await rolesConcept.promoteUser({
      user: deskUser._id,
      permission: editorPermissionId,
    });

    // Test 'deskUser' (Editor) capabilities
    allowResult = await rolesConcept.allowAction({
      user: deskUser._id,
      action: viewAction,
    });
    assert("allowed" in allowResult);
    assertEquals(allowResult.allowed, true, "Editor should be allowed to view");

    allowResult = await rolesConcept.allowAction({
      user: deskUser._id,
      action: editAction,
    });
    assert("allowed" in allowResult);
    assertEquals(allowResult.allowed, true, "Editor should be allowed to edit");

    allowResult = await rolesConcept.allowAction({
      user: deskUser._id,
      action: deleteAction,
    });
    assert("allowed" in allowResult);
    assertEquals(allowResult.allowed, false, "Editor should NOT be allowed to delete");

    // Promote 'adminUser' to "Admin" role
    await rolesConcept.promoteUser({
      user: adminUser._id,
      permission: adminPermissionId,
    });

    // Test 'adminUser' (Admin) capabilities
    allowResult = await rolesConcept.allowAction({
      user: adminUser._id,
      action: deleteAction,
    });
    assert("allowed" in allowResult);
    assertEquals(allowResult.allowed, true, "Admin should be allowed to delete");

    // Test a user with no roles
    const userWithNoRoles = testUsers.find((u) => u.kerb === "liamnguyen")!;
    assertExists(userWithNoRoles);
    const noRolesResult = await rolesConcept.allowAction({
      user: userWithNoRoles._id,
      action: viewAction,
    });
    assert("allowed" in noRolesResult);
    assertEquals(noRolesResult.allowed, false, "User with no roles should not be allowed any action");

    // Test a user with multiple roles (e.g., 'residentUser' is now Viewer and Editor)
    await rolesConcept.promoteUser({
      user: residentUser._id,
      permission: editorPermissionId,
    });
    allowResult = await rolesConcept.allowAction({
      user: residentUser._id,
      action: editAction,
    });
    assert("allowed" in allowResult);
    assertEquals(allowResult.allowed, true, "User with multiple roles should have combined permissions");
  });

  await t.step("should retrieve user permissions", async () => {
    // Create two permission flags
    const perm1Id: ID = (await rolesConcept.createPermissionFlag({ name: "Perm1", actions: [freshID() as ID] }))
      .permissionFlag as ID;
    const perm2Id: ID = (await rolesConcept.createPermissionFlag({ name: "Perm2", actions: [freshID() as ID] }))
      .permissionFlag as ID;

    // Promote 'residentUser' to both permissions
    await rolesConcept.promoteUser({ user: residentUser._id, permission: perm1Id });
    await rolesConcept.promoteUser({ user: residentUser._id, permission: perm2Id });

    // Retrieve and verify 'residentUser's permissions
    const userPermissions = await rolesConcept._getUserPermissions({
      user: residentUser._id,
    });
    assert(Array.isArray(userPermissions), "Should return an array of permissions");
    assertEquals(userPermissions[0].permissionFlags.length, 2, "User should have 2 permission flags");
    assert(userPermissions[0].permissionFlags.includes(perm1Id), "User should have Perm1");
    assert(userPermissions[0].permissionFlags.includes(perm2Id), "User should have Perm2");

    // Test for a user with no permissions (e.g., 'liamnguyen')
    const userWithNoRoles = testUsers.find((u) => u.kerb === "liamnguyen")!;
    assertExists(userWithNoRoles);
    const emptyPermissions = await rolesConcept._getUserPermissions({
      user: userWithNoRoles._id,
    });
    assert(Array.isArray(emptyPermissions), "Should return an array for user with no roles");
    assertEquals(emptyPermissions[0].permissionFlags.length, 0, "User with no roles should have 0 permission flags");
  });

  await t.step("should retrieve permission flag actions", async () => {
    // Define actions for a complex permission flag
    const actionA: ID = freshID() as ID;
    const actionB: ID = freshID() as ID;
    const actionC: ID = freshID() as ID;

    // Create the permission flag
    const permResult = await rolesConcept.createPermissionFlag({
      name: "ComplexPerm",
      actions: [actionA, actionB, actionC],
    });
    assert("permissionFlag" in permResult);
    const complexPermissionId = permResult.permissionFlag;

    // Retrieve and verify actions for the permission flag
    const actions = await rolesConcept._getPermissionFlagActions({
      permission: complexPermissionId,
    });
    assert(Array.isArray(actions), "Should return an array of actions");
    assertEquals(actions[0].actions.length, 3, "ComplexPerm should have 3 actions");
    assert(actions[0].actions.includes(actionA), "Action A should be included");
    assert(actions[0].actions.includes(actionB), "Action B should be included");
    assert(actions[0].actions.includes(actionC), "Action C should be included");

    // Test with a non-existent permission flag, expecting an error
    const nonExistentPerm: ID = freshID() as ID;
    const errorResult = await rolesConcept._getPermissionFlagActions({
      permission: nonExistentPerm,
    });
    assert("error" in errorResult, "Retrieving actions for non-existent flag should return an error");
    assertEquals(
      errorResult.error,
      `Permission Flag with ID '${nonExistentPerm}' not found.`,
      "Error message for non-existent permission should be correct",
    );
  });

  await t.step("should list all permission flags", async () => {
    // Create two permission flags
    await rolesConcept.createPermissionFlag({
      name: "Alpha",
      actions: [freshID() as ID],
    });
    await rolesConcept.createPermissionFlag({
      name: "Beta",
      actions: [freshID() as ID, freshID() as ID],
    });

    // Retrieve and verify the list of all permission flags
    const allFlags = await rolesConcept._listAllPermissionFlags();
    assertEquals(allFlags.length, 2, "Should list exactly 2 permission flags");

    const alpha = allFlags.find((f) => f.name === "Alpha");
    assertExists(alpha, "Alpha flag should be in the list");
    assertEquals(alpha.actions.length, 1, "Alpha flag should have 1 action");

    const beta = allFlags.find((f) => f.name === "Beta");
    assertExists(beta, "Beta flag should be in the list");
    assertEquals(beta.actions.length, 2, "Beta flag should have 2 actions");
  });
});
```

**To run this test suite:**

1. **Save the test code:** Save the content above as `src/utils/inventoryroles.test.ts` (or similar, ensuring relative imports `types.ts`, `database.ts`, `inventoryroles.ts` resolve correctly).
2. **Ensure dependencies:** Make sure your `deno.json` (or `deps.ts`) includes `npm:mongodb`, `jsr:@std/dotenv`, `jsr:@std/uuid`, `jsr:@std/csv`, and `jsr:@std/assert`. You might also need path aliases configured in `deno.json` or `tsconfig.json` for `@utils/*` imports if your `database.ts` and `inventoryroles.ts` are not directly next to `types.ts` in `src/utils/`. The provided code uses relative imports, so ensure the test file is co-located with `types.ts`, `database.ts`, and `inventoryroles.ts` (e.g., all in `src/utils/`).
3. **Set up MongoDB:** Have a MongoDB instance running and configure its connection URL in a `.env` file (e.g., `MONGODB_URL=mongodb://localhost:27017`) and a `DB_NAME` (e.g., `DB_NAME=inventory_db`). The `testDb()` function will create a temporary database like `test-inventory_db`.
4. **Run the test:**
   ```bash
   deno test --allow-env --allow-net --allow-read src/utils/inventoryroles.test.ts
   ```
   * `--allow-env`: For `Deno.env.get` (used by `database.ts`).
   * `--allow-net`: For `MongoClient` to connect to MongoDB.
   * `--allow-read`: While the test doesn't read `users.csv` as a file, `database.ts`'s `populateInitialData` (which we bypass for users) *would* try to read `inventory.csv`. `testDb` itself might not explicitly need `--allow-read`, but it's a good practice if other parts of `database.ts` might be invoked or for broader test utility. In this specific solution, `populateInitialData` is *not* called, so `--allow-read` isn't strictly necessary for *this* test code's file operations, but `database.ts` still imports it. It's safer to include it.
