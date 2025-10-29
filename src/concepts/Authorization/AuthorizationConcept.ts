type RegisterBody = {
  kerb?: string;
  email?: string;
  first?: string;
  last?: string;
  password?: string;
  role?: string; // Optional permission flag name to promote user to
};

type LoginBody = {
  kerb?: string;
  email?: string;
  password?: string;
};

interface AuthRecord {
  kerb: string; // unique
  email: string;
  first: string;
  last: string;
  passwordHash: string;
  salt: string;
  createdAt: Date;
  lastLoginAt?: Date;
  lastToken?: string;
  lastTokenAt?: Date;
}

const AUTH_COLLECTION = "userLogins";

export default class AuthorizationConcept {
  private db: MinimalDb;

  constructor(db: MinimalDb) {
    this.db = db;
    // Create unique index on kerb for quick lookup and uniqueness
    this.db.collection(AUTH_COLLECTION).createIndex(
      { kerb: 1 },
      { unique: true },
    ).catch((e: unknown) =>
      console.warn("[Authorization] index creation failed:", e)
    );
  }

  /**
   * Registers a new user. Requires kerb (alphanumeric), email, first, last, password.
   * The kerb must match the email prefix (before '@').
   * Optionally accepts a role field to auto-promote the user to that permission flag.
   * REST: POST /api/Authorization/register
   */
  async register(
    body: RegisterBody,
  ): Promise<
    { kerb: string; email: string; first: string; last: string; created: true }
  > {
    const kerb = String(body.kerb ?? extractKerbFromEmail(body.email)).trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const first = String(body.first ?? "").trim();
    const last = String(body.last ?? "").trim();
    const password = String(body.password ?? "");
    const role = body.role ? String(body.role).trim() : undefined;

    if (!kerb || !/^[a-zA-Z0-9]+$/.test(kerb)) {
      throw new Error("Invalid kerb: must be alphanumeric");
    }
    if (!email || !email.includes("@")) {
      throw new Error("Invalid email");
    }
    if (extractKerbFromEmail(email) !== kerb) {
      throw new Error("kerb must match the email prefix before '@'");
    }
    if (!first || !last) {
      throw new Error("Missing first or last name");
    }
    if (!password || password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    const existing = await this.db.collection(AUTH_COLLECTION).findOne({
      kerb,
    });
    if (existing) {
      throw new Error("User with this kerb already exists");
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);
    const record: AuthRecord = {
      kerb,
      email,
      first,
      last,
      passwordHash,
      salt,
      createdAt: new Date(),
    };

    await this.db.collection(AUTH_COLLECTION).insertOne(record);

    // Ensure a corresponding profile exists in the users collection for unified records
    const usersColl = this.db.collection("users");
    const existingUser = await usersColl.findOne({ kerb });
    let userId: string | undefined;
    if (!existingUser) {
      // Generate a unique ID for the new user
      const newUserId = `user_${kerb}_${Date.now()}`;
      const newUser = { _id: newUserId, kerb, first, last, role: "resident" };
      await usersColl.insertOne(newUser);
      userId = newUserId;
    } else {
      userId = getIdFromDoc(existingUser);
    }

    // If a role was specified, promote the user to that permission flag
    if (role && userId) {
      try {
        // Check if the permission flag exists
        const permFlag = await this.db.collection("Roles.permissionFlags")
          .findOne({ name: role });
        if (permFlag) {
          const flagId = getIdFromDoc(permFlag);
          if (flagId) {
            // Promote user to the role
            const userRolesDoc = await this.db.collection("Roles.userRoles")
              .findOne({ _id: userId }) as
                | { permissionFlags?: string[] }
                | null;

            if (userRolesDoc) {
              // Update existing document
              const currentFlags = userRolesDoc.permissionFlags || [];
              if (!currentFlags.includes(flagId)) {
                await this.db.collection("Roles.userRoles").updateOne(
                  { _id: userId },
                  { $set: { permissionFlags: [...currentFlags, flagId] } },
                );
              }
            } else {
              // Create new document
              await this.db.collection("Roles.userRoles").insertOne({
                _id: userId,
                permissionFlags: [flagId],
              });
            }
          }
        }
      } catch (_e) {
        // Silently fail role promotion; registration succeeds regardless
        console.warn(`Failed to promote user ${kerb} to role ${role}:`, _e);
      }
    }

    return { kerb, email, first, last, created: true };
  }

  /**
   * Logs a user in by validating kerb/email + password.
   * Returns a short-lived token (non-JWT) for demonstration; stored on the record.
   * REST: POST /api/Authorization/login
   */
  async login(
    body: LoginBody,
  ): Promise<{ success: true; kerb: string; token: string; userId?: string }> {
    const email = String(body.email ?? "").trim().toLowerCase();
    const kerb = String(body.kerb ?? (email ? extractKerbFromEmail(email) : ""))
      .trim();
    const password = String(body.password ?? "");

    if (!kerb) throw new Error("Missing kerb/email");
    if (!password) throw new Error("Missing password");

    const rec = await this.db.collection(AUTH_COLLECTION).findOne({
      kerb,
    }) as unknown as AuthRecord | null;
    if (!rec) throw new Error("Invalid credentials");

    const computed = await hashPassword(password, rec.salt);
    if (computed !== rec.passwordHash) {
      throw new Error("Invalid credentials");
    }

    const token = await issueToken(kerb);
    await this.db.collection(AUTH_COLLECTION).updateOne(
      { kerb },
      {
        $set: {
          lastLoginAt: new Date(),
          lastToken: token,
          lastTokenAt: new Date(),
        },
      },
    );

    // Try to include userId from users collection when available (Mongo or MinimalDb)
    let userId: string | undefined = undefined;
    try {
      const userDoc = await this.db.collection("users").findOne({ kerb });
      const maybeId = getIdFromDoc(userDoc);
      if (maybeId) userId = maybeId;
    } catch (_e) {
      // Ignore lookup errors; userId is optional in response
    }

    return { success: true, kerb, token, userId };
  }

  /**
   * Logout by invalidating the stored token.
   * Accepts kerb and token (both recommended). If kerb not provided, attempts token-based lookup.
   * REST: POST /api/Authorization/logout
   */
  async logout(
    body: { kerb?: string; token?: string },
  ): Promise<{ success: true; invalidated: boolean }> {
    const kerb = String(body.kerb ?? "").trim();
    const token = String(body.token ?? "").trim();
    const coll = this.db.collection(AUTH_COLLECTION);

    let rec = null as unknown as AuthRecord | null;
    if (kerb) {
      rec = await coll.findOne({ kerb }) as unknown as AuthRecord | null;
    } else if (token) {
      rec = await coll.findOne({ lastToken: token }) as unknown as
        | AuthRecord
        | null;
    }

    if (!rec) return { success: true, invalidated: false };
    if (token && rec.lastToken && token !== rec.lastToken) {
      // Provided token doesn't match the stored one
      return { success: true, invalidated: false };
    }

    await coll.updateOne({ kerb: rec.kerb }, {
      $set: { lastToken: null, lastTokenAt: null },
    });
    return { success: true, invalidated: true };
  }

  /**
   * Validate a token. Simple check: token must match stored lastToken and be recent (<= 24h old).
   * REST: POST /api/Authorization/validateToken
   */
  async validateToken(
    body: { kerb?: string; token?: string },
  ): Promise<{ valid: boolean; kerb?: string }> {
    const kerb = String(body.kerb ?? "").trim();
    const token = String(body.token ?? "").trim();
    if (!kerb && !token) return { valid: false };

    const coll = this.db.collection(AUTH_COLLECTION);
    const rec = kerb
      ? await coll.findOne({ kerb }) as unknown as AuthRecord | null
      : await coll.findOne({ lastToken: token }) as unknown as
        | AuthRecord
        | null;

    if (!rec || !rec.lastToken || !rec.lastTokenAt) return { valid: false };
    if (token && token !== rec.lastToken) return { valid: false };

    const ageMs = Date.now() - new Date(rec.lastTokenAt).getTime();
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24h
    if (ageMs > maxAgeMs) return { valid: false };

    return { valid: true, kerb: rec.kerb };
  }

  /**
   * whoami: given a token (and/or kerb), return the current identity and RBAC snapshot.
   * REST: POST /api/Authorization/whoami
   */
  async whoami(body: { kerb?: string; token?: string }): Promise<
    | { userId: string; kerb: string; flags: string[]; actions: string[] }
    | { error: string }
  > {
    // Validate token and derive kerb if not provided
    const v = await this.validateToken({ kerb: body.kerb, token: body.token });
    if (!v.valid || !v.kerb) {
      return { error: "Invalid token" };
    }

    const kerb = v.kerb;

    // Resolve userId from users collection; fallback to kerb if missing
    let userId = kerb;
    try {
      const userDoc = await this.db.collection("users").findOne({ kerb });
      const maybeId = getIdFromDoc(userDoc);
      if (maybeId) userId = maybeId;
    } catch (_e) {
      // keep fallback
    }

    // Gather permission flags from Roles.userRoles
    let flags: string[] = [];
    try {
      const rolesDoc = await this.db.collection("Roles.userRoles").findOne({
        _id: userId,
      }) as { permissionFlags?: string[] } | null;
      flags = rolesDoc?.permissionFlags ?? [];
    } catch (_e) {
      // no roles data available
      flags = [];
    }

    // Gather actions: loop flags and fetch each permission doc to remain compatible with MinimalDb
    const actionsSet = new Set<string>();
    for (const fid of flags) {
      try {
        const permDoc = await this.db.collection("Roles.permissionFlags")
          .findOne({ _id: fid });
        const actions = getActionsFromDoc(permDoc);
        if (actions) {
          for (const a of actions) actionsSet.add(String(a));
        }
      } catch (_e) {
        // ignore
      }
    }

    return { userId, kerb, flags, actions: Array.from(actionsSet) };
  }
}

// Type guard helpers to avoid any casts and keep types strict
function getIdFromDoc(doc: unknown): string | undefined {
  if (
    doc && typeof doc === "object" && "_id" in (doc as Record<string, unknown>)
  ) {
    const id = (doc as Record<string, unknown>)["_id"];
    if (id != null) return String(id);
  }
  return undefined;
}

function getActionsFromDoc(doc: unknown): string[] | undefined {
  if (
    doc && typeof doc === "object" &&
    "actions" in (doc as Record<string, unknown>)
  ) {
    const actions = (doc as Record<string, unknown>)["actions"];
    if (Array.isArray(actions)) return actions.map(String);
  }
  return undefined;
}

// Minimal types to avoid importing external Db type
type Collection = {
  createIndex: (index: unknown, options?: unknown) => Promise<unknown>;
  findOne: (query: unknown) => Promise<unknown>;
  insertOne: (doc: unknown) => Promise<unknown>;
  updateOne: (query: unknown, update: unknown) => Promise<unknown>;
};

type MinimalDb = {
  collection: (name: string) => Collection;
};

function extractKerbFromEmail(email?: string): string {
  if (!email) return "";
  const idx = email.indexOf("@");
  return idx > 0 ? email.slice(0, idx) : email;
}

function generateSalt(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

async function issueToken(kerb: string): Promise<string> {
  const time = Date.now().toString(36);
  const rnd = generateSalt(12);
  const encoder = new TextEncoder();
  const data = encoder.encode(`${kerb}:${time}:${rnd}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}
