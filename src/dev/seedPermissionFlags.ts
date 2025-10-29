import { getDb } from "@utils/database.ts";
import { ID } from "@utils/types.ts";

// Canonical flags per three-tier restructure
const FLAGS: Array<{ id: ID; name: string; actions: ID[] }> = [
  { id: "Resident" as ID, name: "Resident", actions: ["inventory.view" as ID] },
  {
    id: "Desk" as ID,
    name: "Desk",
    actions: [
      "inventory.view" as ID,
      "management.view" as ID,
      "reservation.checkout" as ID,
      "reservation.checkin" as ID,
    ],
  },
  {
    id: "Houseteam" as ID,
    name: "Houseteam",
    actions: [
      "inventory.view" as ID,
      "management.view" as ID,
      "permissions.view" as ID,
      "permissions.manage" as ID,
      "reservation.checkout" as ID,
      "reservation.checkin" as ID,
    ],
  },
];

// Collection name we use in this codebase
const COLL_NAME = "Roles.permissionFlags";

async function main() {
  const [resolvedDb, client] = await getDb();
  type CollLike = {
    updateOne(
      q: unknown,
      u: unknown,
      o?: unknown,
    ): Promise<{ upsertedCount?: number; modifiedCount?: number }>;
    deleteMany(q: unknown): Promise<{ deletedCount?: number }>;
    find(
      q: unknown,
    ): { toArray(): Promise<Array<{ _id: string; actions?: string[] }>> };
  };
  const db = resolvedDb as unknown as { collection(name: string): CollLike };
  try {
    const coll = db.collection(COLL_NAME);

    // Upsert canonical flags
    let upserts = 0;
    for (const f of FLAGS) {
      const res = await coll.updateOne(
        { _id: f.id },
        { $set: { _id: f.id, name: f.name, actions: f.actions } },
        { upsert: true },
      );
      upserts += (res?.upsertedCount || 0) + (res?.modifiedCount || 0);
    }

    // Remove any legacy/obsolete flags not in canonical set
    const keep = FLAGS.map((f) => f.id);
    const delRes = await coll.deleteMany({ _id: { $nin: keep } });

    const finalDocs = await coll.find({}).toArray();

    console.log("\nSeed summary:");
    console.log(`  Upserts/updates: ${upserts}`);
    console.log(`  Deleted (legacy): ${delRes?.deletedCount || 0}`);
    console.log("  Final documents:");
    for (const d of finalDocs) {
      console.log(`    - ${d._id}: [${(d.actions || []).join(", ")}]`);
    }
    console.log("\n✓ Permission flags seeding complete.");
  } finally {
    try {
      // Attempt to close Mongo client if available in this environment
      const maybeClient = client as unknown as { close?: () => Promise<void> };
      if (typeof maybeClient.close === "function") {
        await maybeClient.close();
      }
    } catch (_e) {
      // non-fatal
    }
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("Seeding failed:", e);
    Deno.exit(1);
  });
}
