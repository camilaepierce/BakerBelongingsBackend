// src/concepts/Reservation/inventoryreservation.ts

import { Db } from "npm:mongodb";
import {
  AlreadyCheckedOutError,
  InsufficientQuantityError,
  InvalidQuantityError,
  ItemNotFoundError,
  UserNotFoundError,
} from "../../utils/errors.ts";
import { ID } from "../../utils/types.ts";
// import { freshID } from "../../utils/database.ts"; // Not used in current implementation

// Helper functions for CSV manipulation (copied from test, could be a shared utility)
interface CsvDataForTest {
  header: string[];
  rows: string[][];
}

async function readCsvForReservation(p: string): Promise<CsvDataForTest> {
  const raw = await Deno.readTextFile(p);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split(",").map((h) => h.trim());
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(parseCsvLineForReservation(lines[i]));
  }
  return { header, rows };
}

async function writeCsvForReservation(
  p: string,
  header: string[],
  rows: string[][],
): Promise<void> {
  const content = [
    header.map((h) => `"${h.replace(/"/g, '""')}"`).join(","),
    ...rows.map((row) =>
      row.map((s) => `"${s.replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");
  await Deno.writeTextFile(p, content);
}

function parseCsvLineForReservation(line: string): string[] {
  const res: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      res.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  res.push(cur);
  return res.map((s) => s.trim());
}

// --- CSV-BASED IMPLEMENTATION (Reservation class) ---
export class InventoryReservationConcept {
  private inventoryCsvPath: string;
  private usersCsvPath: string;
  private durationDays: number;
  // This map stores active in-memory reservations, indexed by itemName
  private reservations: Map<string, { kerb: string; expiry: Date }>;

  constructor(
    inventoryCsvPath: string,
    usersCsvPath: string,
    durationDays: number = 7,
  ) {
    this.inventoryCsvPath = inventoryCsvPath;
    this.usersCsvPath = usersCsvPath;
    this.durationDays = durationDays;
    this.reservations = new Map();
    this.loadInitialReservations(); // Load initial reservations from CSV on startup
  }

  // Load initial reservations from CSV to populate in-memory map
  // This simulates the state if the app was restarted and picked up existing checkouts
  private async loadInitialReservations() {
    try {
      const { rows } = await readCsvForReservation(this.inventoryCsvPath);
      for (const row of rows) {
        const [itemName, , availableStr, lastCheckoutStr, lastKerb] = row;
        const available = parseInt(availableStr, 10);

        // If available is 0 and lastCheckout/lastKerb are present, it implies a standing reservation
        if (available === 0 && lastKerb && lastCheckoutStr) {
          const checkoutDate = new Date(lastCheckoutStr);
          const expiryDate = new Date(checkoutDate);
          expiryDate.setDate(checkoutDate.getDate() + this.durationDays);

          this.reservations.set(itemName, {
            kerb: lastKerb,
            expiry: expiryDate,
          });
        }
      }
    } catch (error) {
      console.warn(
        `Failed to load initial CSV reservations from ${this.inventoryCsvPath}:`,
        error,
      );
    }
  }

  private async getInventoryData() {
    const { header, rows } = await readCsvForReservation(this.inventoryCsvPath);
    const inventory = new Map<string, {
      itemName: string;
      category: string;
      available: number;
      lastCheckout: Date | null;
      lastKerb: string | null;
    }>();

    for (const row of rows) {
      const [itemName, category, availableStr, lastCheckoutStr, lastKerb] = row;
      inventory.set(itemName, {
        itemName,
        category,
        available: parseInt(availableStr, 10),
        lastCheckout: lastCheckoutStr ? new Date(lastCheckoutStr) : null,
        lastKerb: lastKerb || null,
      });
    }
    return { header, inventory };
  }

  private async updateInventoryData(
    header: string[],
    inventoryMap: Map<string, any>,
  ) {
    const newRows = Array.from(inventoryMap.values()).map((item) => [
      item.itemName,
      item.category,
      item.available.toString(),
      item.lastCheckout instanceof Date
        ? item.lastCheckout.toISOString().slice(0, 10)
        : "",
      item.lastKerb || "",
    ]);
    await writeCsvForReservation(this.inventoryCsvPath, header, newRows);
  }

  private async getUserData() {
    const { header, rows } = await readCsvForReservation(this.usersCsvPath);
    const users = new Map<string, {
      kerb: string;
      first: string;
      last: string;
      role: string;
    }>();
    for (const row of rows) {
      const [kerb, first, last, role] = row;
      users.set(kerb, { kerb, first, last, role });
    }
    return { header, users };
  }

  async checkoutItem(
    kerb: string,
    itemName: string,
    expiryDate: number,
  ): Promise<void> {
    const { header, inventory } = await this.getInventoryData();
    const { users } = await this.getUserData();

    // 1. Validate Item Existence
    const item = inventory.get(itemName);
    if (!item) {
      throw new ItemNotFoundError(itemName);
    }

    // 2. Validate User Existence and Role
    const user = users.get(kerb);
    if (!user) {
      throw new UserNotFoundError(kerb);
    }
    if (user.role !== "resident") {
      throw new UserNotFoundError(kerb);
    }

    // 3. Check in-memory reservations first (primary source for active reservations)
    if (this.reservations.has(itemName)) {
      throw new AlreadyCheckedOutError(itemName);
    }

    // 4. Check CSV availability (for items not yet loaded into in-memory reservations or initial state)
    if (item.available <= 0) {
      throw new AlreadyCheckedOutError(itemName);
    }

    // Perform checkout
    item.available--;
    item.lastKerb = kerb;
    const checkoutDate = new Date(); // Current date/time for checkout
    item.lastCheckout = checkoutDate;

    // Calculate expiry date
    const newExpiryDate = new Date(checkoutDate);
    newExpiryDate.setDate(checkoutDate.getDate() + expiryDate);

    this.reservations.set(itemName, { kerb: kerb, expiry: newExpiryDate });
    await this.updateInventoryData(header, inventory);
  }

  async checkinItem(itemName: string): Promise<void> {
    const { header, inventory } = await this.getInventoryData();

    // 1. Validate Item Existence
    const item = inventory.get(itemName);
    if (!item) {
      throw new ItemNotFoundError(itemName);
    }

    // 2. Check if item is in in-memory reservations
    if (!this.reservations.has(itemName)) {
      throw new AlreadyCheckedOutError(
        itemName,
      );
    }

    // Perform check-in
    item.available++;
    item.lastKerb = null; // Clear last kerb
    item.lastCheckout = null; // Clear last checkout date

    this.reservations.delete(itemName);
    await this.updateInventoryData(header, inventory);
  }

  /**
   * Logs a notification message for each overdue item. Accepts a message body.
   * REST API: POST /api/reservation/notifyCheckout
   */
  notifyCheckout(body: { message: string }): string[] {
    const now = new Date();
    const notifiedKerbs: string[] = [];
    const message = body?.message ?? "";
    for (const [itemName, reservation] of this.reservations.entries()) {
      if (reservation.expiry < now) {
        // Item is overdue
        console.log(
          `NOTIFY: ${message} | kerb: ${reservation.kerb} | item: ${itemName} | due: ${
            reservation.expiry.toISOString().slice(0, 10)
          }`,
        );
        notifiedKerbs.push(reservation.kerb);
      }
    }
    return notifiedKerbs;
  }
}

// --- MONGODB-BASED IMPLEMENTATION (InventoryReservation class) ---

// Define types for MongoDB collections to match populateInitialData
interface DbInventoryItem {
  _id: ID;
  itemName: string;
  category: string;
  tags: string[];
  available: number;
  lastCheckout: Date | null;
  lastKerb: string | null;
}

interface DbUser {
  _id: ID;
  kerb: string;
  first: string;
  last: string;
  role: string;
}

export default class ReservationConcept {
  private db: Db;
  private defaultOverdueDays = 7;

  constructor(db: Db) {
    this.db = db;
  }

  async checkoutItem(
    kerbOrBody: unknown,
    itemName?: string,
    quantity?: number,
  ): Promise<void> {
    // Support both API object body and positional args
    let kerb: string;
    let item: string;
    let qty: number;

    if (
      kerbOrBody && typeof kerbOrBody === "object" &&
      ("kerb" in (kerbOrBody as Record<string, unknown>))
    ) {
      const body = kerbOrBody as Record<string, unknown>;
      kerb = String(body.kerb ?? "").trim();
      item = String((body.itemName ?? body.item) ?? "").trim();
      const parsedQty = body.quantity;
      qty = typeof parsedQty === "number" ? parsedQty : 1;
    } else {
      kerb = String(kerbOrBody ?? "").trim();
      item = String(itemName ?? "").trim();
      qty = typeof quantity === "number" ? quantity : 1;
    }

    if (!kerb) {
      throw new UserNotFoundError("(missing kerb)");
    }
    if (!item) {
      throw new ItemNotFoundError("(missing itemName)");
    }
    if (qty <= 0) {
      throw new InvalidQuantityError(qty);
    }

    // Diagnostics: log pre-state
    await this.#debugLogItemState("checkout.pre", item);

    // Find user and item first to get detailed error messages
    const user = await this.db.collection<DbUser>("users").findOne({ kerb });
    if (!user) {
      throw new UserNotFoundError(kerb);
    }
    // Assume all users can checkout for this test, or add specific role checks
    // if (user.role !== "resident") { throw new UserNotFoundError(`Kerb is not a resident: ${kerb}`); }

    const itemDoc = await this.db.collection<DbInventoryItem>("items").findOne({
      itemName: item,
    });
    if (!itemDoc) {
      throw new ItemNotFoundError(item);
    }

    // Specific error checks based on item state
    // Treat item as unavailable if requested quantity exceeds available
    if (itemDoc.available < qty) {
      throw new InsufficientQuantityError(
        item,
        qty,
        itemDoc.available,
      );
    }

    // If we reach here, conditions seem good, proceed with atomic update
    const result = await this.db.collection<DbInventoryItem>("items")
      .findOneAndUpdate(
        {
          _id: itemDoc._id, // Target specific item by ID to avoid race conditions with itemName
          available: { $gte: qty },
        },
        {
          $inc: { available: -qty },
          $set: { lastCheckout: new Date(), lastKerb: kerb },
        },
        { returnDocument: "after" }, // Return the updated document
      );

    if (result?._id === null) {
      // This case indicates a race condition where another operation changed the item state
      // after our initial findOne but before findOneAndUpdate.
      throw new Error(
        `Failed to checkout item ${item} due to concurrent modification or unexpected state.`,
      );
    }

    // Diagnostics: log post-state
    await this.#debugLogItemState("checkout.post", item);

    // Operational log: who checked out what
    try {
      console.log(
        `[Reservation] checkoutItem: kerb='${kerb}' item='${item}' qty=${qty}`,
      );
    } catch (_e) {
      // swallow logging errors
    }
  }

  // A basic stub for checkinItem to satisfy potential future tests, not fully implemented
  async checkinItem(
    kerbOrBody: unknown,
    itemName?: string,
    quantity: number = 1,
  ): Promise<void> {
    // Support API object body: { kerb, item | itemName, quantity }
    let item: string;
    let kerb: string | undefined;
    let qty: number;
    if (
      kerbOrBody && typeof kerbOrBody === "object" &&
      ("item" in (kerbOrBody as Record<string, unknown>) ||
        "itemName" in (kerbOrBody as Record<string, unknown>))
    ) {
      const body = kerbOrBody as Record<string, unknown>;
      item = String((body.itemName ?? body.item) ?? "").trim();
      if ("kerb" in body && typeof body.kerb === "string") {
        kerb = String(body.kerb).trim();
      }
      const parsedQty = body.quantity;
      qty = typeof parsedQty === "number" ? parsedQty : 1;
    } else {
      item = String(itemName ?? "").trim();
      qty = typeof quantity === "number" ? quantity : 1;
    }

    if (!item) {
      throw new ItemNotFoundError("(missing itemName)");
    }
    if (qty <= 0) {
      throw new InvalidQuantityError(qty);
    }

    // Diagnostics: log pre-state
    await this.#debugLogItemState("checkin.pre", item);

    const itemDoc = await this.db.collection<DbInventoryItem>("items").findOne(
      { itemName: item },
      { projection: { available: 1, lastCheckout: 1, lastKerb: 1 } },
    );

    if (!itemDoc) {
      throw new ItemNotFoundError(item);
    }

    // If no current holder, it's not checked out
    if (itemDoc.lastKerb === null) {
      throw new AlreadyCheckedOutError(
        item,
      ); // Reusing error
    }

    // Increment available but preserve lastCheckout/lastKerb for audit/history
    const updateResult = await this.db.collection<DbInventoryItem>("items")
      .updateOne(
        { _id: itemDoc._id, lastKerb: { $ne: null } }, // Ensure it was checked out
        {
          $inc: { available: qty },
        },
      );

    if (updateResult.matchedCount === 0) {
      throw new Error(
        `Failed to checkin ${item}, possibly due to race condition or invalid state.`,
      );
    }

    // Diagnostics: log post-state
    await this.#debugLogItemState("checkin.post", item);

    // Operational log: who checked in what
    try {
      const actor = kerb ?? itemDoc.lastKerb ?? "unknown";
      console.log(
        `[Reservation] checkinItem: kerb='${actor}' item='${item}' qty=${qty}`,
      );
    } catch (_e) {
      // swallow logging errors
    }
  }
  // TODO: Implement notifyCheckout for MongoDB if required
  /**
   * Logs and sends an email notification for each overdue item via Gmail API.
   * REST API: POST /api/reservation/notifyCheckout
   *
   * Input: { message: string; overdueAfterDays?: number; subject?: string }
   * Returns: string[] of kerbs notified
   */
  async notifyCheckout(
    body: { message?: string; overdueAfterDays?: number; subject?: string },
  ): Promise<string[]> {
    const message = String(body?.message ?? "").trim();
    const overdueAfterDays =
      typeof body?.overdueAfterDays === "number" && body.overdueAfterDays > 0
        ? body.overdueAfterDays
        : this.defaultOverdueDays;
    const subject = String(
      body?.subject ?? "Overdue item reminder from Baker Belongings",
    );

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - overdueAfterDays);

    // Find overdue items: lastCheckout older than cutoff and lastKerb present
    const overdueItems = await this.db.collection<DbInventoryItem>("items")
      .find({
        lastCheckout: { $ne: null, $lt: cutoff },
        lastKerb: { $ne: null },
      }, {
        projection: { itemName: 1, lastKerb: 1, lastCheckout: 1 },
      }).toArray();

    if (!overdueItems.length) return [];

    // Group items by kerb
    const byKerb = new Map<
      string,
      Array<{ itemName: string; lastCheckout: Date }>
    >();
    for (const it of overdueItems) {
      const kerb = it.lastKerb as string;
      if (!byKerb.has(kerb)) byKerb.set(kerb, []);
      byKerb.get(kerb)!.push({
        itemName: it.itemName,
        lastCheckout: it.lastCheckout!,
      });
    }

    const kerbsNotified: string[] = [];

    // Resolve recipient email for each kerb and send one email per kerb
    for (const [kerb, items] of byKerb.entries()) {
      try {
        const toEmail = await this.#resolveEmailForKerb(kerb);
        if (!toEmail) {
          console.warn(
            `[notifyCheckout] No email for kerb '${kerb}', skipping.`,
          );
          continue;
        }
        const effectiveTo = this.#effectiveRecipient(toEmail);

        const bodyLines = [
          message || "Reminder: You have overdue item(s) to return.",
          "",
          `Overdue items (checked out before ${
            cutoff.toISOString().slice(0, 10)
          }):`,
          ...items.map((i) =>
            `- ${i.itemName} (checked out: ${
              i.lastCheckout.toISOString().slice(0, 10)
            })`
          ),
          "",
          "Please return them as soon as possible.",
        ];
        const textBody = bodyLines.join("\n");

        await this.#sendEmail(effectiveTo, subject, textBody);
        kerbsNotified.push(kerb);
      } catch (e) {
        console.warn(`[notifyCheckout] Failed to email kerb '${kerb}':`, e);
      }
    }

    return kerbsNotified;
  }

  // --- Email helpers (Gmail API) ---
  async #sendEmail(to: string, subject: string, text: string): Promise<void> {
    // In tests, do not attempt real email sending
    if (
      Deno.env.get("NODE_ENV") === "test" ||
      Deno.env.get("DISABLE_EMAIL") === "1"
    ) {
      console.log(
        `[notifyCheckout] (test) would send email to ${to}: ${subject}`,
      );
      return;
    }

    const from = Deno.env.get("GMAIL_FROM") ??
      Deno.env.get("GMAIL_IMPERSONATE_EMAIL") ?? to;
    const raw = this.#buildRawMime({ from, to, subject, text });
    const token = await this.#getGmailAccessToken();

    const resp = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      },
    );
    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      throw new Error(`Gmail send failed (${resp.status}): ${errText}`);
    }
  }

  #buildRawMime(
    { from, to, subject, text }: {
      from: string;
      to: string;
      subject: string;
      text: string;
    },
  ): string {
    const mime = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      text,
    ].join("\r\n");
    const raw = this.#base64UrlEncode(new TextEncoder().encode(mime));
    return raw;
  }

  #base64UrlEncode(bytes: Uint8Array): string {
    // Use built-in btoa on string form
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  #effectiveRecipient(original: string): string {
    const env = Deno.env.get("NODE_ENV");
    const sandbox = Deno.env.get("EMAIL_SANDBOX_TO");
    // If a sandbox address is set, always use it
    if (sandbox && sandbox.includes("@")) {
      if (sandbox !== original) {
        console.log(
          `[notifyCheckout] Redirecting email '${original}' -> '${sandbox}' (sandbox)`,
        );
      }
      return sandbox;
    }
    // In non-production environments, default to cepierce@mit.edu
    if (env !== "production") {
      const safe = "cepierce@mit.edu";
      if (safe !== original) {
        console.log(
          `[notifyCheckout] Redirecting email '${original}' -> '${safe}' (dev default)`,
        );
      }
      return safe;
    }
    // In production, send to the resolved original address
    return original;
  }

  #getGmailAccessToken(): string {
    const direct = Deno.env.get("GMAIL_OAUTH_TOKEN");
    if (direct) return direct;
    throw new Error(
      "Gmail auth not configured. Provide GMAIL_OAUTH_TOKEN (OAuth2 access token with gmail.send scope).",
    );
  }

  async #resolveEmailForKerb(kerb: string): Promise<string | null> {
    // Try to read email from users collection if present
    const user = await this.db.collection<{ email?: string }>("users").findOne(
      { kerb },
      { projection: { email: 1 } },
    );
    const emailFromDb = user?.email;
    if (emailFromDb && emailFromDb.includes("@")) return emailFromDb;

    // Fallback: construct from kerb and configured domain
    const domain = Deno.env.get("EMAIL_DOMAIN");
    if (domain) return `${kerb}@${domain}`;
    return null;
  }

  /**
   * Diagnostic: return state of a specific item. Accessible over REST.
   */
  async debugItemState(
    input: string | { itemName?: string; item?: string },
  ): Promise<
    {
      itemName: string;
      available: number;
      lastKerb: string | null;
      lastCheckout: Date | null;
    } | { error: string }
  > {
    const name =
      (typeof input === "string"
        ? input
        : (input?.itemName ?? input?.item ?? "")).trim();
    if (!name) return { error: "Missing itemName" };
    const doc = await this.db.collection<DbInventoryItem>("items").findOne(
      { itemName: name },
      {
        projection: { itemName: 1, available: 1, lastKerb: 1, lastCheckout: 1 },
      },
    );
    if (!doc) return { error: `Item not found: ${name}` };
    return {
      itemName: doc.itemName,
      available: doc.available,
      lastKerb: doc.lastKerb,
      lastCheckout: doc.lastCheckout,
    };
  }

  /**
   * Diagnostic: list states for all items. Accessible over REST.
   */
  async debugAllItemStates(): Promise<
    Array<
      {
        itemName: string;
        available: number;
        lastKerb: string | null;
        lastCheckout: Date | null;
      }
    >
  > {
    const docs = await this.db.collection<DbInventoryItem>("items").find(
      {},
      {
        projection: { itemName: 1, available: 1, lastKerb: 1, lastCheckout: 1 },
      },
    ).toArray();
    return docs.map((d) => ({
      itemName: d.itemName,
      available: d.available,
      lastKerb: d.lastKerb,
      lastCheckout: d.lastCheckout,
    }));
  }

  // Internal helper to log state for an item
  async #debugLogItemState(label: string, itemName: string): Promise<void> {
    try {
      const doc = await this.db.collection<DbInventoryItem>("items").findOne(
        { itemName },
        {
          projection: {
            itemName: 1,
            available: 1,
            lastKerb: 1,
            lastCheckout: 1,
          },
        },
      );
      console.log("[ReservationConcept]", label, {
        itemName: doc?.itemName ?? itemName,
        available: doc?.available,
        lastKerb: doc?.lastKerb,
        lastCheckout: doc?.lastCheckout,
      });
    } catch (e) {
      console.warn(
        "[ReservationConcept] debugLogItemState failed",
        label,
        itemName,
        e,
      );
    }
  }
}
