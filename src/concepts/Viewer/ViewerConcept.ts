// Remove these file system imports as data will be loaded from MongoDB
// import { promises as fs } from "node:fs";
// import * as path from "node:path";

import { Db, MongoClient } from "npm:mongodb"; // Import MongoDB types
import { getDb, InventoryItem as DbInventoryItem } from "@src/utils/database.ts"; // Import getDb and InventoryItem from database.ts
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
      this.db = db;
      this.client = client;
    })();
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
  // These methods rely on the in-memory `this.items` array for prompt generation
  // and filtering, so their logic remains unchanged.
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

// Updated helper for quick CLI testing
export async function createViewer(): Promise<ViewerConcept> {
  const v = new ViewerConcept();
  await v.loadItems(); // Load items from MongoDB
  return v;
}
