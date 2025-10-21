---
timestamp: 'Mon Oct 20 2025 23:39:24 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251020_233924.43ea7e1a.md]]'
content_id: 2e600d975d66c184970fa2d4e2468d19404738b9fe4dd0eca3350b3e2b371ee5
---

# prompt: Suggest a modification to @ViewerConcept.ts to use @database.ts to initialize and manage a MongoDB database

## database.ts

```typescript
// This import loads the `.env` file as environment variables
import "jsr:@std/dotenv/load";
import { Db, MongoClient } from "npm:mongodb";
import { ID } from "@utils/types.ts";
import { generate } from "jsr:@std/uuid/unstable-v7";
import { parse } from "jsr:@std/csv"; // New import for CSV parsing

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

interface User {
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
 */
export async function populateInitialData(db: Db): Promise<void> {
  console.log("Starting database population...");

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
  const inventoryCsvPath = "src/utils/inventory.csv"; // Path relative to project root
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
      console.log("No inventory items found in inventory.csv to insert.");
    }
  } catch (error) {
    console.error(
      `Failed to populate inventory from ${inventoryCsvPath}:`,
      error,
    );
  }

  // --- Populate Users from users.csv ---
  const usersCsvPath = "src/utils/users.csv"; // Path relative to project root
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
      console.log("No users found in users.csv to insert.");
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
  const test_DB_NAME = `test-${DB_NAME}`;
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

## ViewerConcept.ts

```typescript
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { GeminiLLM } from "../../gemini-llm.ts";

export interface Item {
  itemName: string;
  lastCheckout: Date | null;
  available: boolean;
  lastKerb: string;
  categories: string[];
  tags: string[];
}

export default class ViewerConcept {
  private items: Item[] = [];
  private csvPath: string;

  constructor() {
    console.log("Creating a new Viewer constructor!");
    this.csvPath = "src/utils/inventory.csv"; //path.resolve(__dirname, "inventory.csv");
  }

  /** Load items from inventory.csv into memory */
  async loadItems(): Promise<void> {
    const raw = await fs.readFile(this.csvPath, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      this.items = [];
      return;
    }

    const header = lines[0].split(",").map((h) => h.trim());
    const colIndex = (name: string) =>
      header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

    const idxItemName = colIndex("ItemName");
    const idxCategory = colIndex("Category");
    const idxTags = colIndex("Tags");
    const idxAvailable = colIndex("Available");
    const idxLastCheckout = colIndex("LastCheckout");
    const idxLastKerb = colIndex("LastKerb");

    this.items = [];

    for (let i = 1; i < lines.length; i++) {
      const row = this.parseCsvLine(lines[i]);
      const itemName = row[idxItemName] ?? "";
      const categoryField = row[idxCategory] ?? "";
      const tagsField = row[idxTags] ?? "";
      const availableField = row[idxAvailable] ?? "";
      const lastCheckoutField = row[idxLastCheckout] ?? "";
      const lastKerbField = row[idxLastKerb] ?? "";

      const categories = categoryField.split(";").map((s) => s.trim()).filter(
        Boolean,
      );
      const tags = tagsField.split(";").map((s) => s.trim()).filter(Boolean);
      const available = availableField.trim() === "1" ||
        availableField.trim().toLowerCase() === "true";
      const lastCheckout = lastCheckoutField
        ? new Date(lastCheckoutField)
        : null;

      this.items.push({
        itemName: itemName.trim(),
        lastCheckout,
        available,
        lastKerb: (lastKerbField || "").trim(),
        categories,
        tags,
      });
    }
  }

  /** Persist in-memory items back to inventory.csv (overwrites) */
  async saveItems(): Promise<void> {
    const header = [
      "ItemName",
      "Category",
      "Tags",
      "Available",
      "LastCheckout",
      "LastKerb",
    ];
    const lines = [header.join(",")];
    for (const it of this.items) {
      const category = it.categories.join(";");
      const tags = it.tags.join(";");
      const available = it.available ? "1" : "0";
      const lastCheckout = it.lastCheckout
        ? this.formatDate(it.lastCheckout)
        : "";
      const lastKerb = it.lastKerb ?? "";
      lines.push([
        this.escapeCsv(it.itemName),
        this.escapeCsv(category),
        this.escapeCsv(tags),
        available,
        lastCheckout,
        this.escapeCsv(lastKerb),
      ].join(","));
    }
    await fs.writeFile(this.csvPath, lines.join("\n"), "utf8");
  }

  /*=============== Query methods ===============*/
  viewAvailable(): Item[] {
    return this.items.filter((i) => i.available);
  }

  viewItem(itemName: string): Item {
    const it = this.items.find((i) =>
      i.itemName.toLowerCase() === itemName.toLowerCase()
    );
    if (!it) throw new Error(`Item not found: ${itemName}`);
    return it;
  }

  viewCategory(category: string): Item[] {
    return this.items.filter((i) =>
      i.categories.some((c) => c.toLowerCase() === category.toLowerCase())
    );
  }

  viewTag(tag: string): Item[] {
    return this.items.filter((i) =>
      i.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
    );
  }

  viewLastCheckedoutDate(itemName: string): Date {
    const it = this.viewItem(itemName);
    if (!it.lastCheckout) {
      throw new Error(`No lastCheckout recorded for ${itemName}`);
    }
    // return date-only (zero time)
    return new Date(it.lastCheckout.toISOString().slice(0, 10));
  }

  viewLastCheckedoutFull(itemName: string): Date {
    const it = this.viewItem(itemName);
    if (!it.lastCheckout) {
      throw new Error(`No lastCheckout recorded for ${itemName}`);
    }
    return new Date(it.lastCheckout); // full Date object
  }

  /*=============== AI-augmented methods ===============*/
  async viewAdjacent(itemName: string, llm: GeminiLLM): Promise<Item[]> {
    const it = this.items.find((i) =>
      i.itemName.toLowerCase() === itemName.toLowerCase()
    );
    if (!it) throw new Error(`Item not found: ${itemName}`);

    const prompt = this.createAdjacentPrompt(it);
    const text = await llm.executeLLM(prompt);
    const names = this.extractNameListFromLLM(text);
    return this.items.filter((i) => names.includes(i.itemName));
  }

  async viewAutocomplete(prefix: string, llm: GeminiLLM): Promise<Item[]> {
    const prompt = this.createAutocompletePrompt(prefix);
    const text = await llm.executeLLM(prompt);
    const names = this.extractNameListFromLLM(text);
    // match with available items by exact name
    return this.items.filter((i) => names.includes(i.itemName));
  }

  async recommendItems(
    interests: string,
    llm: GeminiLLM,
  ): Promise<{ item: Item; suggestion: string }[]> {
    const prompt = this.createRecommendPrompt(interests);
    const text = await llm.executeLLM(prompt);
    // Expect JSON: [{"itemName":"...","suggestion":"..."}, ...]
    const json = this.extractJson(text);
    if (!Array.isArray(json)) {
      throw new Error("LLM recommendItems returned invalid format");
    }
    const results: { item: Item; suggestion: string }[] = [];
    for (const entry of json) {
      if (!entry || typeof entry.itemName !== "string") continue;
      const item = this.items.find((i) => i.itemName === entry.itemName);
      if (item) {
        results.push({ item, suggestion: String(entry.suggestion ?? "") });
      }
    }
    return results;
  }

  /*=============== Helpers ===============*/
  private parseCsvLine(line: string): string[] {
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

  private escapeCsv(s: string): string {
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  private formatDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private createAdjacentPrompt(target: Item): string {
    const inventorySummary = this.items.map((i) =>
      `${i.itemName} | categories:${i.categories.join(";")} | tags:${
        i.tags.join(";")
      }`
    ).join("\n");
    return `You are an assistant that, given a target inventory item, returns a JSON array of itemName strings representing the most similar items from the inventory.
Target item:\n${target.itemName} | categories:${
      target.categories.join(";")
    } | tags:${target.tags.join(";")}

INVENTORY:\n${inventorySummary}

Return exactly a JSON array of itemName strings, in order of similarity.`;
  }

  private createAutocompletePrompt(prefix: string): string {
    const names = this.items.map((i) => i.itemName).join("\n");
    return `You are an assistant that returns up to 8 item names from the inventory that best match the user's partial input. User input: "${prefix}"\nINVENTORY NAMES:\n${names}\nReturn exactly a JSON array of matching itemName strings.`;
  }

  private createRecommendPrompt(interests: string): string {
    // Provide limited inventory context + interests, request itemName + suggestion
    const shortList = this.items.slice(0, 60).map((i) => ({
      itemName: i.itemName,
      tags: i.tags,
      categories: i.categories,
    }));
    return `You are an assistant that recommends inventory items for a user based on their interests. INTERESTS: ${interests}\n
INVENTORY SAMPLE:\n${JSON.stringify(shortList, null, 2)}\n
Return a JSON array of objects with fields: {"itemName": string, "suggestion": string} where suggestion is a one-sentence activity idea using the item that matches the interests. Return only JSON.`;
  }

  private extractNameListFromLLM(text: string): string[] {
    const json = this.extractJson(text);
    if (Array.isArray(json)) return json.filter((v) => typeof v === "string");
    return [];
  }

  private extractJson(text: string): any {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON found in LLM response");
    try {
      return JSON.parse(match[0]);
    } catch (e) {
      throw new Error("Failed to parse JSON from LLM response");
    }
  }
}

// Export a small helper for quick CLI testing (not required by the spec)
export async function createViewerFromCsv(): Promise<ViewerConcept> {
  const v = new ViewerConcept();
  await v.loadItems();
  return v;
}

```
