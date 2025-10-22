// This import loads the `.env` file as environment variables, required by database.ts
import "jsr:@std/dotenv/load";

// Assume these modules are in the same directory (e.g., `src/utils/`) or correctly aliased
import { Empty, ID } from "./../../utils/types.ts";
import { freshID, testDb } from "./../../utils/database.ts";
import RolesConcept from "./RolesConcept.ts";
import { Db, MongoClient } from "npm:mongodb";
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

/**
 * Helper function to encapsulate common test setup logic.
 * Initializes a clean database, populates it with test users,
 * creates a RolesConcept instance, and identifies specific test users.
 * @returns An object containing the initialized DB, client, RolesConcept, and test users.
 */
async function setupTestEnvironment(): Promise<{
  db: Db;
  client: MongoClient;
  rolesConcept: RolesConcept;
  testUsers: TestUser[];
  adminUser: TestUser;
  deskUser: TestUser;
  residentUser: TestUser;
  houseTeamUser: TestUser;
}> {
  const [db, client] = await testDb();
  const rolesConcept = new RolesConcept();
  const testUsers = await populateTestUsers(db);

  // Identify specific users from the populated data for consistent testing
  const adminUser = testUsers.find((u) => u.kerb === "zoeclark")!; // Using a 'houseteam' member for potential admin role
  const deskUser = testUsers.find((u) => u.kerb === "samdoer")!; // A 'desk' member
  const residentUser = testUsers.find((u) => u.kerb === "camjohnson")!; // A 'resident' member
  const houseTeamUser = testUsers.find((u) => u.kerb === "sopjay")!; // Another 'houseteam' member

  // Assert that the test users were found
  assertExists(adminUser, "adminUser should be found during setup");
  assertExists(deskUser, "deskUser should be found during setup");
  assertExists(residentUser, "residentUser should be found during setup");
  assertExists(houseTeamUser, "houseTeamUser should be found during setup");

  return {
    db,
    client,
    rolesConcept,
    testUsers,
    adminUser,
    deskUser,
    residentUser,
    houseTeamUser,
  };
}

// Each t.step is converted to a Deno.test, with its own setup and teardown.

Deno.test("RolesConcept functionality - should create permission flags correctly", async () => {
  let client: MongoClient | undefined; // Declared for finally block
  try {
    const { rolesConcept, client: _client } = await setupTestEnvironment();
    client = _client; // Assign to the outer client variable for cleanup

    // Define unique actions for different roles
    const adminActions: ID[] = [
      freshID() as ID,
      freshID() as ID,
      freshID() as ID,
    ];
    const deskActions: ID[] = [freshID() as ID, freshID() as ID];

    // Create an "Admin" permission flag
    const adminPermResult = await rolesConcept.createPermissionFlag({
      name: "Admin",
      actions: adminActions,
    });
    assert(
      "permissionFlag" in adminPermResult,
      "Admin permission flag creation should succeed",
    );
    const adminPermissionId = adminPermResult.permissionFlag;

    // Create a "DeskStaff" permission flag
    const deskPermResult = await rolesConcept.createPermissionFlag({
      name: "DeskStaff",
      actions: deskActions,
    });
    assert(
      "permissionFlag" in deskPermResult,
      "DeskStaff permission flag creation should succeed",
    );
    const deskPermissionId = deskPermResult.permissionFlag;

    // List all created permission flags and verify their details
    const listFlags = await rolesConcept._listAllPermissionFlags();
    assertEquals(listFlags.length, 2, "Should have exactly 2 permission flags");

    const adminFlag = listFlags.find((f) => f.name === "Admin");
    assertExists(adminFlag, "Admin flag should exist in the list");
    assertEquals(adminFlag.id, adminPermissionId, "Admin flag ID should match");
    assertEquals(
      adminFlag.actions.sort(),
      adminActions.sort(),
      "Admin flag actions should match",
    );

    const deskFlag = listFlags.find((f) => f.name === "DeskStaff");
    assertExists(deskFlag, "DeskStaff flag should exist in the list");
    assertEquals(
      deskFlag.id,
      deskPermissionId,
      "DeskStaff flag ID should match",
    );
    assertEquals(
      deskFlag.actions.sort(),
      deskActions.sort(),
      "DeskStaff flag actions should match",
    );

    // Attempt to create a permission flag with a duplicate name, expecting an error
    const duplicateResult = await rolesConcept.createPermissionFlag({
      name: "Admin",
      actions: [],
    });
    assert(
      "error" in duplicateResult,
      "Creating duplicate flag should return an error",
    );
    assertEquals(
      duplicateResult.error,
      "Permission Flag with name 'Admin' already exists.",
      "Error message for duplicate name should be correct",
    );
  } finally {
    // Teardown: Close the MongoDB connection for this specific test
    if (client) {
      await client.close();
    }
  }
});

Deno.test("RolesConcept functionality - should add actions to a permission flag", async () => {
  let client: MongoClient | undefined;
  try {
    const { rolesConcept, client: _client } = await setupTestEnvironment();
    client = _client;

    // Create an initial permission flag with one action
    const initialAction: ID = freshID() as ID;
    const permResult = await rolesConcept.createPermissionFlag({
      name: "Editor",
      actions: [initialAction],
    });
    assert(
      "permissionFlag" in permResult,
      "Editor permission flag creation should succeed",
    );
    const editorPermissionId = permResult.permissionFlag;

    // Add a new action to the flag
    const newAction: ID = freshID() as ID;
    const addResult = await rolesConcept.addActionsToPermissionFlag({
      permission: editorPermissionId,
      newActions: [newAction],
    });
    assert(
      !("error" in addResult),
      "Adding new action should not return an error",
    );

    // Verify the flag now has two actions
    const updatedFlagActions = await rolesConcept._getPermissionFlagActions({
      permission: editorPermissionId,
    });
    assert(
      Array.isArray(updatedFlagActions),
      "Should return an array of actions",
    );
    assertEquals(
      (updatedFlagActions[0] as any).actions.length,
      2,
      "Flag should now have 2 actions",
    );
    assert(
      (updatedFlagActions[0] as any).actions.includes(newAction),
      "New action should be included",
    );
    assert(
      (updatedFlagActions[0] as any).actions.includes(initialAction),
      "Initial action should still be included",
    );

    // Attempt to add an existing action, ensuring no duplicates are added
    const addExistingResult = await rolesConcept.addActionsToPermissionFlag({
      permission: editorPermissionId,
      newActions: [initialAction],
    });
    assert(
      !("error" in addExistingResult),
      "Adding existing action should not return an error",
    );
    const afterAddExisting = await rolesConcept._getPermissionFlagActions({
      permission: editorPermissionId,
    });

    // Test adding actions to a non-existent permission flag, expecting an error
    const nonExistentPerm: ID = freshID() as ID;
    const errorResult = await rolesConcept.addActionsToPermissionFlag({
      permission: nonExistentPerm,
      newActions: [freshID() as ID],
    });
    assert(
      "error" in errorResult,
      "Adding action to non-existent flag should return an error",
    );
    assertEquals(
      errorResult.error,
      `Permission Flag with ID '${nonExistentPerm}' not found.`,
      "Error message for non-existent flag should be correct",
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});

Deno.test("RolesConcept functionality - should remove actions from a permission flag", async () => {
  let client: MongoClient | undefined;
  try {
    const { rolesConcept, client: _client } = await setupTestEnvironment();
    client = _client;

    // Create a permission flag with three actions
    const action1: ID = freshID() as ID;
    const action2: ID = freshID() as ID;
    const action3: ID = freshID() as ID;

    const permResult = await rolesConcept.createPermissionFlag({
      name: "Viewer",
      actions: [action1, action2, action3],
    });
    assert(
      "permissionFlag" in permResult,
      "Viewer permission flag creation should succeed",
    );
    const viewerPermissionId = permResult.permissionFlag;

    // Remove one action
    const removeResult = await rolesConcept.removeActionsFromPermissionFlag({
      permission: viewerPermissionId,
      actionsToRemove: [action2],
    });
    assert(
      !("error" in removeResult),
      "Removing action should not return an error",
    );

    // Verify the flag now has two actions and the removed action is gone
    const updatedFlagActions = await rolesConcept._getPermissionFlagActions({
      permission: viewerPermissionId,
    });
    assert(
      Array.isArray(updatedFlagActions),
      "Should return an array of actions",
    );
    assertEquals(
      (updatedFlagActions[0] as any).actions.length,
      2,
      "Flag should now have 2 actions",
    );
    assert(
      !(updatedFlagActions[0] as any).actions.includes(action2),
      "Removed action should not be present",
    );
    assert(
      (updatedFlagActions[0] as any).actions.includes(action1),
      "Action 1 should still be present",
    );
    assert(
      (updatedFlagActions[0] as any).actions.includes(action3),
      "Action 3 should still be present",
    );

    // Attempt to remove a non-existent action, ensuring no error or change
    const nonExistentAction: ID = freshID() as ID;
    const removeNonExistentResult = await rolesConcept
      .removeActionsFromPermissionFlag(
        {
          permission: viewerPermissionId,
          actionsToRemove: [nonExistentAction],
        },
      );
    assert(
      !("error" in removeNonExistentResult),
      "Removing non-existent action should not return an error",
    );
    const afterRemoveNonExistent = await rolesConcept._getPermissionFlagActions(
      { permission: viewerPermissionId },
    );

    // Test removing actions from a non-existent permission flag, expecting an error
    const nonExistentPerm: ID = freshID() as ID;
    const errorResult = await rolesConcept.removeActionsFromPermissionFlag({
      permission: nonExistentPerm,
      actionsToRemove: [freshID() as ID],
    });
    assert(
      "error" in errorResult,
      "Removing action from non-existent flag should return an error",
    );
    assertEquals(
      errorResult.error,
      `Permission Flag with ID '${nonExistentPerm}' not found.`,
      "Error message for non-existent flag should be correct",
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});

Deno.test("RolesConcept functionality - should promote a user to a role", async () => {
  let client: MongoClient | undefined;
  try {
    const { rolesConcept, client: _client, adminUser, residentUser } =
      await setupTestEnvironment();
    client = _client;

    const adminAction: ID = freshID() as ID;
    const permResult = await rolesConcept.createPermissionFlag({
      name: "Admin",
      actions: [adminAction],
    });
    assert(
      "permissionFlag" in permResult,
      "Admin permission flag creation should succeed",
    );
    const adminPermissionId = permResult.permissionFlag;

    // Promote 'adminUser' to the "Admin" role
    const promoteResult = await rolesConcept.promoteUser({
      user: adminUser._id,
      permission: adminPermissionId,
    });
    assert(
      !("error" in promoteResult),
      "Promoting user should not return an error",
    );

    // Verify 'adminUser' now has the "Admin" permission
    const userPermissions = await rolesConcept._getUserPermissions({
      user: adminUser._id,
    });
    assert(
      Array.isArray(userPermissions),
      "Should return an array of permissions",
    );
    assertEquals(
      (userPermissions[0] as any).permissionFlags.length,
      1,
      "User should have 1 permission flag",
    );
    assert(
      (userPermissions[0] as any).permissionFlags.includes(adminPermissionId),
      "User should have Admin permission",
    );

    // Promote the same user to the same role again, should not add duplicates
    await rolesConcept.promoteUser({
      user: adminUser._id,
      permission: adminPermissionId,
    });

    // Attempt to promote a user to a non-existent permission flag, expecting an error
    const nonExistentPerm: ID = freshID() as ID;
    const errorResult = await rolesConcept.promoteUser({
      user: residentUser._id,
      permission: nonExistentPerm,
    });
    assert(
      "error" in errorResult,
      "Promoting to non-existent flag should return an error",
    );
    assertEquals(
      errorResult.error,
      `Permission Flag with ID '${nonExistentPerm}' is not valid.`,
      "Error message for non-existent permission should be correct",
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});

Deno.test("RolesConcept functionality - should demote a user from a role", async () => {
  let client: MongoClient | undefined;
  try {
    const { rolesConcept, client: _client, adminUser, residentUser } =
      await setupTestEnvironment();
    client = _client;

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

    // Demote 'adminUser' from the "Admin" role
    const demoteResult = await rolesConcept.demoteUser({
      user: adminUser._id,
      permission: adminPermissionId,
    });
    assert(
      !("error" in demoteResult),
      "Demoting user should not return an error",
    );

    // Verify 'adminUser' now only has the "DeskStaff" permission
    userPermissions = await rolesConcept._getUserPermissions({
      user: adminUser._id,
    });

    // Demote 'adminUser' from the last remaining role ("DeskStaff"),
    // which should remove the user's role document entirely.
    const demoteLastResult = await rolesConcept.demoteUser({
      user: adminUser._id,
      permission: deskPermissionId,
    });
    assert(
      !("error" in demoteLastResult),
      "Demoting last permission should not return an error",
    );
    userPermissions = await rolesConcept._getUserPermissions({
      user: adminUser._id,
    });

    // Attempt to demote a user from a role they are not part of, expecting an error
    const errorResult = await rolesConcept.demoteUser({
      user: residentUser._id,
      permission: adminPermissionId,
    });
    assert(
      "error" in errorResult,
      "Demoting from a role not in should return an error",
    );
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
    assert(
      "error" in errorResult2,
      "Demoting from non-existent permission should return an error",
    );
    assertEquals(
      errorResult2.error,
      `Permission Flag with ID '${nonExistentPerm}' is not valid.`,
      "Error message for non-existent permission should be correct",
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});

Deno.test("RolesConcept functionality - should allow action if user has required permission", async () => {
  let client: MongoClient | undefined;
  try {
    const {
      rolesConcept,
      client: _client,
      adminUser,
      deskUser,
      residentUser,
      testUsers,
    } = await setupTestEnvironment();
    client = _client;

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
    assertEquals(
      allowResult.allowed,
      false,
      "Viewer should NOT be allowed to edit",
    );

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
    assertEquals(
      allowResult.allowed,
      false,
      "Editor should NOT be allowed to delete",
    );

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
    assertEquals(
      allowResult.allowed,
      true,
      "Admin should be allowed to delete",
    );

    // Test a user with no roles
    const userWithNoRoles = testUsers.find((u) => u.kerb === "liamnguyen")!;
    assertExists(userWithNoRoles);
    const noRolesResult = await rolesConcept.allowAction({
      user: userWithNoRoles._id,
      action: viewAction,
    });
    assert("allowed" in noRolesResult);
    assertEquals(
      noRolesResult.allowed,
      false,
      "User with no roles should not be allowed any action",
    );

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
    assertEquals(
      allowResult.allowed,
      true,
      "User with multiple roles should have combined permissions",
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});

Deno.test("RolesConcept functionality - should retrieve user permissions", async () => {
  let client: MongoClient | undefined;
  try {
    const { rolesConcept, client: _client, residentUser, testUsers } =
      await setupTestEnvironment();
    client = _client;

    // Create two permission flags
    const perm1Id: ID = ((await rolesConcept.createPermissionFlag({
      name: "Perm1",
      actions: [freshID() as ID],
    })) as any)
      .permissionFlag as ID;
    const perm2Id: ID = ((await rolesConcept.createPermissionFlag({
      name: "Perm2",
      actions: [freshID() as ID],
    })) as any)
      .permissionFlag as ID;

    // Promote 'residentUser' to both permissions
    await rolesConcept.promoteUser({
      user: residentUser._id,
      permission: perm1Id,
    });
    await rolesConcept.promoteUser({
      user: residentUser._id,
      permission: perm2Id,
    });

    // Retrieve and verify 'residentUser's permissions
    const userPermissions = await rolesConcept._getUserPermissions({
      user: residentUser._id,
    });
    assert(
      Array.isArray(userPermissions),
      "Should return an array of permissions",
    );
    assertEquals(
      (userPermissions[0] as any).permissionFlags.length,
      2,
      "User should have 2 permission flags",
    );
    assert(
      (userPermissions[0] as any).permissionFlags.includes(perm1Id),
      "User should have Perm1",
    );
    assert(
      (userPermissions[0] as any).permissionFlags.includes(perm2Id),
      "User should have Perm2",
    );

    // Test for a user with no permissions (e.g., 'liamnguyen')
    const userWithNoRoles = testUsers.find((u) => u.kerb === "liamnguyen")!;
    assertExists(userWithNoRoles);
    const emptyPermissions = await rolesConcept._getUserPermissions({
      user: userWithNoRoles._id,
    });
    assert(
      Array.isArray(emptyPermissions),
      "Should return an array for user with no roles",
    );
    assertEquals(
      (emptyPermissions[0] as any).permissionFlags.length,
      0,
      "User with no roles should have 0 permission flags",
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});

Deno.test("RolesConcept functionality - should retrieve permission flag actions", async () => {
  let client: MongoClient | undefined;
  try {
    const { rolesConcept, client: _client } = await setupTestEnvironment();
    client = _client;

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
    assertEquals(
      (actions[0] as any).actions.length,
      3,
      "ComplexPerm should have 3 actions",
    );
    assert(
      (actions[0] as any).actions.includes(actionA),
      "Action A should be included",
    );
    assert(
      (actions[0] as any).actions.includes(actionB),
      "Action B should be included",
    );
    assert(
      (actions[0] as any).actions.includes(actionC),
      "Action C should be included",
    );

    // Test with a non-existent permission flag, expecting an error
    const nonExistentPerm: ID = freshID() as ID;
    const errorResult = await rolesConcept._getPermissionFlagActions({
      permission: nonExistentPerm,
    });
    assert(
      "error" in errorResult,
      "Retrieving actions for non-existent flag should return an error",
    );
    assertEquals(
      errorResult.error,
      `Permission Flag with ID '${nonExistentPerm}' not found.`,
      "Error message for non-existent permission should be correct",
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});

Deno.test("RolesConcept functionality - should list all permission flags", async () => {
  let client: MongoClient | undefined;
  try {
    const { rolesConcept, client: _client } = await setupTestEnvironment();
    client = _client;

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
  } finally {
    if (client) {
      await client.close();
    }
  }
});
