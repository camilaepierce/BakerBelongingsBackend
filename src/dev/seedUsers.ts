import { parse } from "jsr:@std/csv";
import { ID } from "@utils/types.ts";
import RolesConcept from "@concepts/Roles/RolesConcept.ts";
import { getDb } from "@utils/database.ts";

const AUTH_COLLECTION = "userLogins";

// Local copy of the hash helpers to match AuthorizationConcept behavior
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

function freshUserId(kerb: string): ID {
  return (`user_${kerb}_${Date.now()}`) as ID;
}

type UserProfile = {
  _id?: string;
  kerb: string;
  first: string;
  last: string;
  role: string;
};
type UserLogin = {
  kerb: string;
  email: string;
  first: string;
  last: string;
  passwordHash: string;
  salt: string;
  createdAt: Date;
  lastLoginAt?: Date;
  lastToken?: string | null;
  lastTokenAt?: Date | null;
};

export async function seedDevUsers() {
  try {
    const env = Deno.env.get("NODE_ENV") || "development";
    const shouldSeed = Deno.env.get("DEV_SEED");

    // Only seed in non-test environments; allow explicit opt-out via DEV_SEED=false
    if (env === "test" || shouldSeed === "false") {
      console.log("[seedUsers] Skipping seeding (env/test or DEV_SEED=false)");
      return;
    }

    console.log("[seedUsers] Seeding users from src/utils/users.csv ...");

    // Ensure reference permission flags exist (Resident, Desk, Houseteam)
    const roles = new RolesConcept();
    await roles.ensureReferenceFlagsAndActions();

    // Read and parse CSV
    const usersCsvPath = "src/utils/users.csv";
    const csvText = await Deno.readTextFile(usersCsvPath);
    const rows = parse(csvText, {
      skipFirstRow: true,
      columns: ["kerb", "first", "last", "role"],
    }) as Array<{ kerb: string; first: string; last: string; role: string }>;

    if (!rows.length) {
      console.warn("[seedUsers] No rows found in users.csv");
      return;
    }

    const password = "testpassword123";

    // Map CSV role -> Permission Flag
    const roleToFlag = (role: string): ID | null => {
      const r = (role || "").toLowerCase();
      if (r === "resident") return "Resident" as ID;
      if (r === "desk") return "Desk" as ID;
      if (r === "houseteam") return "Houseteam" as ID;
      return null; // unknown roles won't be promoted
    };

    type CollLike<T> = {
      findOne(q: unknown): Promise<unknown>;
      updateOne(q: unknown, u: unknown, o?: unknown): Promise<unknown>;
      insertOne(doc: unknown): Promise<unknown>;
      deleteOne?(q: unknown): Promise<unknown>;
      find?(q: unknown): { toArray(): Promise<unknown[]> };
    };
    type DbLike = { collection<T>(name: string): CollLike<T> };

    const [resolvedDb] = await getDb();
    const db = resolvedDb as unknown as DbLike;
    const usersColl = db.collection<UserProfile>("users");
    const authColl = db.collection<UserLogin>(AUTH_COLLECTION);

    for (const row of rows) {
      const kerb = String(row.kerb).trim();
      if (!kerb) continue;
      const first = String(row.first || "").trim();
      const last = String(row.last || "").trim();
      const profileRole = String(row.role || "").trim();
      const email = `${kerb}@example.com`;

      // Upsert users profile
      const existingUser = await usersColl.findOne({ kerb }) as
        | { _id?: string }
        | null;
      let userId: ID;
      if (existingUser && existingUser._id) {
        userId = existingUser._id as ID;
        await usersColl.updateOne({ kerb }, {
          $set: { first, last, role: profileRole },
        });
      } else {
        userId = freshUserId(kerb);
        await usersColl.insertOne({
          _id: userId,
          kerb,
          first,
          last,
          role: profileRole,
        });
      }

      // Upsert auth record with fixed password
      const salt = generateSalt();
      const passwordHash = await hashPassword(password, salt);
      const existingAuth = await authColl.findOne({ kerb });
      if (existingAuth) {
        await authColl.updateOne(
          { kerb },
          {
            $set: {
              email,
              first,
              last,
              passwordHash,
              salt,
              // do not touch token fields
            },
          },
        );
      } else {
        await authColl.insertOne({
          kerb,
          email,
          first,
          last,
          passwordHash,
          salt,
          createdAt: new Date(),
        });
      }

      // Assign permission flag based on CSV role
      const flag = roleToFlag(profileRole);
      if (flag) {
        await roles.promoteUser({ user: userId, permission: flag });
      }
    }

    console.log(`[seedUsers] Seeded ${rows.length} users.`);
  } catch (e) {
    console.error("[seedUsers] Failed:", e);
  }
}
