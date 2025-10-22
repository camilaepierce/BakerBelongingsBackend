// Remove these file system imports as data will be loaded from MongoDB
// import { promises as fs } from "node:fs";
// import * as path from "node:path";

import { Db, MongoClient } from "npm:mongodb"; // Import MongoDB types
import {
  getDb,
  InventoryItem as DbInventoryItem,
  populateInitialData,
} from "@utils/database.ts"; // Import getDb and InventoryItem from database.ts
import { GeminiLLM } from "../../gemini-llm.ts";
import { ID } from "../../utils/types.ts"; // Import ID type

// Updated Item interface to align with MongoDB structure while retaining ViewerConcept's logic
export interface Item {
  _id?: ID; // Added for MongoDB unique identifier
  itemName: string;
  lastCheckout: Date | null;
  available: boolean; // Retain boolean as per original ViewerConcept
  lastKerb: string | null; // Allow null to match DbInventoryItem
  categories: string[]; // Retain array as per original ViewerConcept's parsing logic
  tags: string[];
  expiryDate?: Date | string | null; // Optional expiry date
}

export default class ViewerConcept {
  private items: Item[] = [];
  // private csvPath: string; // Removed, no longer using CSV files

  private db!: Db; // MongoDB Db instance
  private client!: MongoClient; // MongoDB Client instance for connection management
  private dbReady: Promise<void>; // Ensures DB is initialized before use

  // Constructor now initializes MongoDB internally without external arguments
  constructor() {
    console.log("Creating a new Viewer constructor!");
    this.dbReady = (async () => {
      const [db, client] = await getDb();
      if (db instanceof Db) {
        this.db = db;
      } else {
        throw Error("MongoDB not returning Db");
      }
      if (client instanceof MongoClient) {
        this.client = client;
      } else {
        throw Error("MongoDB not returning MongoClient");
      }
      populateInitialData(this.db);
    })();

    // Auto-load items once DB is ready (useful for REST server usage)
    this.dbReady
      .then(() => this.loadItems())
      .catch((e) => console.warn("ViewerConcept auto-load failed:", e));
  }

  // Ensure items are loaded when called from API (server constructs without calling loadItems)
  private async ensureItemsLoaded(): Promise<void> {
    if (this.items.length === 0) {
      await this.loadItems();
    }
  }

  // Create an LLM instance using provided apiKey or environment variables
  private createLLM(possibleApiKey?: string): GeminiLLM {
    const apiKey = possibleApiKey || Deno.env.get("GEMINI_API_KEY") ||
      Deno.env.get("GOOGLE_API_KEY") || Deno.env.get("GENAI_API_KEY");
    if (!apiKey) {
      throw new Error(
        "Missing Gemini API key. Set GEMINI_API_KEY (or GOOGLE_API_KEY) in environment or provide apiKey in request body.",
      );
    }
    return new GeminiLLM({ apiKey });
  }

  // Helper to map a DbInventoryItem (from MongoDB) to ViewerConcept's Item
  private mapDbInventoryItemToItem(dbItem: DbInventoryItem): Item {
    return {
      _id: dbItem._id,
      itemName: dbItem.itemName,
      lastCheckout: dbItem.lastCheckout,
      available: dbItem.available === 1, // Convert number (1/0) to boolean (true/false)
      lastKerb: dbItem.lastKerb,
      // Split the single category string from DB into an array, mimicking original CSV parsing
      categories: dbItem.category.split(";").map((s) => s.trim()).filter(
        Boolean,
      ),
      tags: dbItem.tags,
    };
  }

  /** Load items from MongoDB into memory */
  async loadItems(): Promise<void> {
    try {
      await this.dbReady; // Ensure DB is initialized
      const dbItems = await this.db.collection<DbInventoryItem>("items").find()
        .toArray();
      this.items = dbItems.map(this.mapDbInventoryItemToItem);
      console.log(`Loaded ${this.items.length} items from MongoDB.`);
    } catch (error) {
      console.error("Failed to load items from MongoDB:", error);
      this.items = []; // Ensure items array is cleared on error
      throw error; // Re-throw to indicate failure
    }
  }

  /** Close the MongoDB client connection */
  async closeDb(): Promise<void> {
    await this.dbReady; // Ensure client is initialized
    await this.client.close();
    console.log("MongoDB client closed.");
  }

  // Removed `saveItems` as the ViewerConcept is primarily for reading,
  // and data persistence logic would typically be handled by a dedicated
  // data access layer or specific mutation methods for MongoDB.
  // async saveItems(): Promise<void> { ... }

  // Removed CSV-specific helper methods
  // private parseCsvLine(line: string): string[] { ... }
  // private escapeCsv(s: string): string { ... }
  // private formatDate(d: Date): string { ... }

  /*=============== Query methods ===============*/
  // These methods now operate on the `this.items` array, which is loaded from MongoDB
  async viewAvailable(): Promise<Item[]> {
    await this.ensureItemsLoaded();
    return this.items.filter((i) => i.available);
  }

  /**
   * Returns all items that are currently checked out (available === false).
   * REST API: GET /api/viewer/viewCheckedOut
   */
  async viewCheckedOut(): Promise<Item[]> {
    await this.ensureItemsLoaded();
    return this.items.filter((i) => !i.available);
  }

  async viewItem(itemName: string): Promise<Item> {
    await this.ensureItemsLoaded();
    // Accept either a string or an object with itemName property
    let name: string;
    if (typeof itemName === "string") {
      name = itemName;
    } else if (
      itemName && typeof itemName === "object" &&
      typeof (itemName as { itemName?: unknown }).itemName === "string"
    ) {
      name = (itemName as { itemName: string }).itemName;
    } else {
      throw new Error(
        `Invalid argument to viewItem: ${JSON.stringify(itemName)}`,
      );
    }
    name = name.trim().toLowerCase();
    console.log("viewItem called with:", name);
    console.log(
      "Filtered items:",
      this.items.find((i) => i.itemName.trim().toLowerCase() == name),
    );
    const it = this.items.find((i) => i.itemName.trim().toLowerCase() == name);
    if (!it) throw new Error(`Item not found: ${name}`);
    return it;
  }

  async viewCategory(
    category: string | { category?: string },
  ): Promise<Item[]> {
    await this.ensureItemsLoaded();
    const search =
      (typeof category === "string" ? category : (category?.category ?? ""))
        .trim().toLowerCase();
    console.log("viewCategory called with:", search);
    console.log("Available categories:", this.items.map((i) => i.categories));
    return this.items.filter((i) =>
      i.categories.some((c) => c.trim().toLowerCase() === search)
    );
  }

  async viewTag(tag: string | { tag?: string }): Promise<Item[]> {
    await this.ensureItemsLoaded();
    const search = (typeof tag === "string" ? tag : (tag?.tag ?? "")).trim()
      .toLowerCase();
    console.log("viewTag called with:", search);
    // For each item, split tags by semicolon, trim, and lowercase
    return this.items.filter((item) => {
      const tagSet = item.tags
        .flatMap((t) => t.split(";").map((s) => s.trim().toLowerCase()))
        .filter(Boolean);
      return tagSet.includes(search);
    });
  }

  async viewLastCheckedoutDate(
    itemName: string | { itemName?: string; item?: string },
  ): Promise<Date> {
    const name = typeof itemName === "string"
      ? itemName
      : (itemName?.itemName ?? itemName?.item ?? "");
    const it = await this.viewItem(name);
    if (!it.lastCheckout) {
      throw new Error(`No lastCheckout recorded for ${name}`);
    }
    // return date-only (zero time)
    return new Date(it.lastCheckout.toISOString().slice(0, 10));
  }

  async viewLastCheckedoutFull(
    itemName: string | { itemName?: string; item?: string },
  ): Promise<Date> {
    const name = typeof itemName === "string"
      ? itemName
      : (itemName?.itemName ?? itemName?.item ?? "");
    const it = await this.viewItem(name);
    if (!it.lastCheckout) {
      throw new Error(`No lastCheckout recorded for ${name}`);
    }
    return new Date(it.lastCheckout); // full Date object
  }

  /*=============== AI-augmented methods ===============*/
  // These methods rely on the in-memory `this.items` array for prompt generation
  // and filtering, so their logic remains unchanged.
  async viewAdjacent(
    input: string | { itemName?: string; item?: string; apiKey?: string },
    llm?: GeminiLLM,
  ): Promise<Item[]> {
    await this.ensureItemsLoaded();
    const name =
      (typeof input === "string"
        ? input
        : (input?.itemName ?? input?.item ?? "")).trim();
    if (!name) throw new Error("viewAdjacent requires an itemName");

    const it = this.items.find((i) =>
      i.itemName.toLowerCase() === name.toLowerCase()
    );
    if (!it) throw new Error(`Item not found: ${name}`);

    const llmToUse = llm ?? this.createLLM(
      typeof input === "object" ? input?.apiKey : undefined,
    );

    const prompt = this.createAdjacentPrompt(it);
    const text = await llmToUse.executeLLM(prompt);
    const names = this.extractNameListFromLLM(text);
    return this.items.filter((i) => names.includes(i.itemName));
  }

  async viewAutocomplete(
    input: string | { prefix?: string; q?: string; apiKey?: string },
    llm?: GeminiLLM,
  ): Promise<Item[]> {
    await this.ensureItemsLoaded();
    const prefix =
      (typeof input === "string" ? input : (input?.prefix ?? input?.q ?? ""))
        .trim();
    if (!prefix) throw new Error("viewAutocomplete requires a prefix");

    const llmToUse = llm ?? this.createLLM(
      typeof input === "object" ? input?.apiKey : undefined,
    );

    const prompt = this.createAutocompletePrompt(prefix);
    const text = await llmToUse.executeLLM(prompt);
    const names = this.extractNameListFromLLM(text);
    // match with available items by exact name
    return this.items.filter((i) => names.includes(i.itemName));
  }

  async recommendItems(
    input: string | { interests?: string; apiKey?: string },
    llm?: GeminiLLM,
  ): Promise<{ item: Item; suggestion: string }[]> {
    await this.ensureItemsLoaded();
    const interests =
      (typeof input === "string" ? input : (input?.interests ?? "")).trim();
    if (!interests) throw new Error("recommendItems requires interests");

    const llmToUse = llm ?? this.createLLM(
      typeof input === "object" ? input?.apiKey : undefined,
    );

    const prompt = this.createRecommendPrompt(interests);
    const text = await llmToUse.executeLLM(prompt);
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

  /*=============== Helpers (LLM Prompt Generation & Response Parsing) ===============*/
  // These helper methods also rely on `this.items` and remain unchanged.
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

  /**
   * Returns items that have exceeded their expiry date (expiryDate < today).
   * REST API: POST /api/viewer/viewExpired
   */
  async viewExpired(): Promise<Item[]> {
    await this.ensureItemsLoaded();
    const today = new Date();
    return this.items.filter((item) => {
      if (!item.expiryDate) return false;
      const expiry = typeof item.expiryDate === "string"
        ? new Date(item.expiryDate)
        : item.expiryDate;
      return expiry < today;
    });
  }

  private extractNameListFromLLM(text: string): string[] {
    const json = this.extractJson(text);
    if (Array.isArray(json)) return json.filter((v) => typeof v === "string");
    return [];
  }

  private extractJson(text: string): unknown {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON found in LLM response");
    try {
      return JSON.parse(match[0]) as unknown;
    } catch (_e) {
      throw new Error("Failed to parse JSON from LLM response");
    }
  }
}

// Updated helper for quick CLI testing
export async function createViewer(): Promise<ViewerConcept> {
  const v = new ViewerConcept();
  await v.loadItems(); // Load items from MongoDB
  return v;
}
