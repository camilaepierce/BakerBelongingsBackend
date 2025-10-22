import { Collection, Db } from "npm:mongodb";
import { Empty, ID } from "@utils/types.ts";
import { freshID, getDb, User as DbUser } from "@utils/database.ts";

// Declare collection prefix using the concept name
const PREFIX = "Roles" + ".";

// Generic types for the concept
type User = ID;
type Action = ID;
type PermissionFlag = ID;

/**
 * Represents the association between a User and the PermissionFlags they possess.
 * This effectively defines which roles a user is part of.
 * Corresponds to the interpretation of "a set of Roles with ... a set of Users"
 * where a Role is implicitly identified by its Permission Flag.
 * A document for a user will be created when they are first promoted to a role.
 */
interface UserRoles {
  _id: User; // The ID of the user
  permissionFlags: PermissionFlag[]; // The set of PermissionFlag IDs (roles) this user is part of
}

/**
 * Represents a Permission Flag and the set of Actions it allows.
 * Corresponds to "a set of Permission Flags with a set of Actions"
 */
interface PermissionFlagDocument {
  _id: PermissionFlag; // The ID of the permission flag
  name: string; // A human-readable name for the permission flag (e.g., "Admin", "Editor")
  actions: Action[]; // The set of actions allowed by this permission flag
}

/**
 * **concept** Roles
 * **purpose** maintain security of what actions different types of users can perform
 * **principle** A User can be a part of a specific role that can perform a given set of actions.
 * Users can be promoted and demoted depending on need.
 */
export default class RolesConcept {
  // MongoDB collections for the concept's state
  private userRoles!: Collection<UserRoles>;
  private permissionFlags!: Collection<PermissionFlagDocument>;
  private users!: Collection<DbUser>; // Underlying Users collection
  private db!: Db;
  private dbReady: Promise<void>;

  constructor() {
    this.dbReady = (async () => {
      const [db] = await getDb();
      if (db instanceof Db) {
        this.db = db;
      }
      this.userRoles = this.db.collection(PREFIX + "userRoles");
      this.permissionFlags = this.db.collection(PREFIX + "permissionFlags");
      this.users = this.db.collection<DbUser>("users");
    })();
  }

  // --- Internal Helper Actions (for managing Permission Flags, not user-facing concept actions) ---

  /**
   * createPermissionFlag (name: String, actions: Action[]): (permissionFlag: PermissionFlag)
   *
   * **requires** No PermissionFlag with the given `name` already exists.
   *
   * **effects** Creates a new PermissionFlag `p` with the given `name` and `actions`;
   *             returns `p` as `permissionFlag`.
   */
  async createPermissionFlag(
    { name, actions }: { name: string; actions: Action[] },
  ): Promise<{ permissionFlag: PermissionFlag } | { error: string }> {
    await this.dbReady;
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

  /**
   * addActionsToPermissionFlag (permission: PermissionFlag, newActions: Action[]): Empty
   *
   * **requires** The `permission` must be a valid PermissionFlag.
   *
   * **effects** Adds the `newActions` to the existing actions of the specified `permission`.
   */
  async addActionsToPermissionFlag(
    { permission, newActions }: {
      permission: PermissionFlag;
      newActions: Action[];
    },
  ): Promise<Empty | { error: string }> {
    await this.dbReady;
    const result = await this.permissionFlags.updateOne(
      { _id: permission },
      { $addToSet: { actions: { $each: newActions } } },
    );

    if (result.matchedCount === 0) {
      return { error: `Permission Flag with ID '${permission}' not found.` };
    }
    return {};
  }

  /**
   * removeActionsFromPermissionFlag (permission: PermissionFlag, actionsToRemove: Action[]): Empty
   *
   * **requires** The `permission` must be a valid PermissionFlag.
   *
   * **effects** Removes the `actionsToRemove` from the existing actions of the specified `permission`.
   */
  async removeActionsFromPermissionFlag(
    { permission, actionsToRemove }: {
      permission: PermissionFlag;
      actionsToRemove: Action[];
    },
  ): Promise<Empty | { error: string }> {
    await this.dbReady;
    const result = await this.permissionFlags.updateOne(
      { _id: permission },
      { $pullAll: { actions: actionsToRemove } },
    );

    if (result.matchedCount === 0) {
      return { error: `Permission Flag with ID '${permission}' not found.` };
    }
    return {};
  }

  // --- User-facing Concept Actions ---

  /**
   * promoteUser (user: User, permission: PermissionFlag): Empty
   *
   * **requires** user is a valid User, permission is a valid Permission Flag
   *
   * **effects** adds user to Role containing given Permission Flag
   */
  async promoteUser(
    { user, permission }: { user: User; permission: PermissionFlag },
  ): Promise<Empty | { error: string }> {
    await this.dbReady;
    // Check if permission is valid
    const permissionExists = await this.permissionFlags.findOne({
      _id: permission,
    });
    if (!permissionExists) {
      return { error: `Permission Flag with ID '${permission}' is not valid.` };
    }

    // Add the permission to the user's roles.
    // Use $addToSet to ensure no duplicate permissions for a user.
    await this.userRoles.updateOne(
      { _id: user },
      { $addToSet: { permissionFlags: permission } },
      { upsert: true }, // Create the user's role document if it doesn't exist
    );

    return {};
  }

  /**
   * demoteUser (user: User, permission: PermissionFlag): Empty
   *
   * **requires** user is a valid User, permission is a valid Permission Flag, user is within the role permission refers to
   *
   * **effects** removes user from Role containing given Permission Flag
   */
  async demoteUser(
    { user, permission }: { user: User; permission: PermissionFlag },
  ): Promise<Empty | { error: string }> {
    await this.dbReady;
    // Check if permission is valid
    const permissionExists = await this.permissionFlags.findOne({
      _id: permission,
    });
    if (!permissionExists) {
      return { error: `Permission Flag with ID '${permission}' is not valid.` };
    }

    // Check if user is actually in the role
    const userRoleDoc = await this.userRoles.findOne({ _id: user });
    if (!userRoleDoc || !userRoleDoc.permissionFlags.includes(permission)) {
      return {
        error:
          `User '${user}' is not part of the role defined by Permission Flag '${permission}'.`,
      };
    }

    // Remove the permission from the user's roles
    const result = await this.userRoles.updateOne(
      { _id: user },
      { $pull: { permissionFlags: permission } },
    );

    // If the user's permissionFlags array becomes empty after removal, optionally delete the document
    if (result.modifiedCount > 0) {
      const updatedUserRoleDoc = await this.userRoles.findOne({ _id: user });
      if (updatedUserRoleDoc?.permissionFlags.length === 0) {
        await this.userRoles.deleteOne({ _id: user });
      }
    }

    return {};
  }

  /**
   * allowAction (user: User, action: Action): { allowed: Boolean }
   *
   * **requires** user is a valid User, action is a valid Action
   *
   * **effects** returns True if action is an action corresponding to the user's permission flags
   */
  async allowAction(
    { user, action }: { user: User; action: Action },
  ): Promise<{ allowed: boolean } | { error: string }> {
    await this.dbReady;
    // Find the user's roles
    const userRoleDoc = await this.userRoles.findOne({ _id: user });

    // If the user has no roles, they cannot perform any action
    if (!userRoleDoc || userRoleDoc.permissionFlags.length === 0) {
      return { allowed: false };
    }

    // Find all permission flags associated with the user
    const userPermissions = await this.permissionFlags.find({
      _id: { $in: userRoleDoc.permissionFlags },
    }).toArray();

    // Check if any of these permission flags allow the given action
    const allowed = userPermissions.some((perm) =>
      perm.actions.includes(action)
    );

    return { allowed };
  }

  // --- Queries ---

  /**
   * _getUserPermissions (user: User): (permissionFlags: PermissionFlag[])
   *
   * **requires** user exists (optional, returns empty array if not found)
   *
   * **effects** returns the set of all PermissionFlags associated with the user.
   */
  async _getUserPermissions(
    { user }: { user: User },
  ): Promise<{ permissionFlags: PermissionFlag[] }[] | { error: string }> {
    await this.dbReady;
    const userRoleDoc = await this.userRoles.findOne({ _id: user });
    if (!userRoleDoc) console.log("no userRoleDoc?");
    return [{ permissionFlags: userRoleDoc?.permissionFlags || [] }];
  }

  /**
   * _getPermissionFlagActions (permission: PermissionFlag): (actions: Action[])
   *
   * **requires** permission exists
   *
   * **effects** returns the set of all Actions associated with the given PermissionFlag.
   */
  async _getPermissionFlagActions(
    { permission }: { permission: PermissionFlag },
  ): Promise<{ actions: Action[] }[] | { error: string }> {
    await this.dbReady;
    const permissionDoc = await this.permissionFlags.findOne({
      _id: permission,
    });
    if (!permissionDoc) {
      return { error: `Permission Flag with ID '${permission}' not found.` };
    }
    return [{ actions: permissionDoc.actions }];
  }

  /**
   * _listAllPermissionFlags (): (permissionFlag: {id: PermissionFlag, name: string, actions: Action[]})
   *
   * **requires** true
   *
   * **effects** returns a list of all defined Permission Flags with their details.
   */
  async _listAllPermissionFlags(): Promise<
    { id: PermissionFlag; name: string; actions: Action[] }[]
  > {
    await this.dbReady;
    const flags = await this.permissionFlags.find({}).toArray();
    return flags.map((flag) => ({
      id: flag._id,
      name: flag.name,
      actions: flag.actions,
    }));
  }
}
