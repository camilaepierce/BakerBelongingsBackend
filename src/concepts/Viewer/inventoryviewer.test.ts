/**
 * Inventory Viewer Test Cases
 *
 * Demonstrates both manual viewing and checkout and LLM-assisted viewing
 */

import ViewerConcept, { createViewer } from "./ViewerConcept.ts";
import ReservationConcept from "../Reservation/ReservationConcept.ts";
import * as path_deno from "https://deno.land/std@0.208.0/path/mod.ts";
// Deno std library for assertions
import {
  assert,
  assertArrayIncludes,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  AlreadyCheckedOutError,
  InsufficientQuantityError,
  InvalidQuantityError,
  InventoryError,
  ItemNotFoundError,
  ItemUnavailableError,
  UserNotFoundError,
} from "./../../utils/errors.ts"; // Correct path
// Node.js compatibility modules for file system and path operations
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as process from "node:process"; // For process.cwd()

import { GeminiLLM } from "../../gemini-llm.ts";
import { getDb } from "../../utils/database.ts";
import type { Db, MongoClient } from "npm:mongodb";

/**
 * Create an LLM instance from config.json in the repo root.
 * Falls back to a fake LLM if config is missing or creating the real LLM fails.
 */
async function createLlmFromConfig(): Promise<any> {
  const cfgPath = path.resolve(process.cwd(), "config.json");
  try {
    const raw = await fs.readFile(cfgPath, "utf8");
    const cfg = JSON.parse(raw);
    if (cfg && cfg.apiKey) {
      try {
        console.log("Using GeminiLLM");
        return new GeminiLLM({ apiKey: String(cfg.apiKey) });
      } catch (e) {
        console.warn(
          "Could not initialise GeminiLLM from config, falling back to fake LLM:",
          (e as Error).message,
        );
      }
    }
  } catch (e) {
    // file not found or parse error -> fall through to fake
    console.warn(
      "No config.json present or parse error, using fake LLM for tests",
    );
  }

  // Fake LLM fallback
  return {
    async executeLLM(prompt: string) {
      // conservative fake: return empty JSON array so caller can handle absence
      return "[]";
    },
  };
}

// // --- Helper for temporary file setup/teardown ---
// const srcInventory = path.resolve(Deno.cwd(), "/utils/inventory.csv");
// const srcUsers = path.resolve(Deno.cwd(), "/utils/users.csv");
const srcInventory = getSrcFilePath("/utils/inventory.csv");
const srcUsers = getSrcFilePath("/utils/users.csv");

interface TestFilePaths {
  inventory: string;
  users: string;
}
/**
 * Helper function to get the absolute path of source files
 * relative to the project root, assuming the test file is in `project_root/tests/`.
 */
function getSrcFilePath(relativePath: string): string {
  const currentDir = path.dirname(path_deno.fromFileUrl(import.meta.url));
  // Navigate up two levels from `tests/` to `project_root/`
  return path.join(currentDir, "../../", relativePath);
}

/**
 * Copies /utils/inventory.csv and /utils/users.csv to temporary files for isolated testing.
 * @returns An object containing the paths to the temporary inventory and users CSVs.
 */
async function setupTestFiles(): Promise<TestFilePaths> {
  const tmpDir = os.tmpdir();
  const timestamp = Date.now();
  const tmpInventory = path.join(tmpDir, `inventory.test.${timestamp}.csv`);
  const tmpUsers = path.join(tmpDir, `users.test.${timestamp}.csv`);

  await fs.copyFile(srcInventory, tmpInventory);
  await fs.copyFile(srcUsers, tmpUsers);
  return { inventory: tmpInventory, users: tmpUsers };
}

/**
 * Deletes the temporary test files.
 * @param paths The object containing paths to the temporary files.
 */
async function teardownTestFiles(paths: TestFilePaths) {
  try {
    await fs.unlink(paths.inventory);
  } catch (_) { /* ignore errors during cleanup */ }
  try {
    await fs.unlink(paths.users);
  } catch (_) { /* ignore errors during cleanup */ }
}

// --- Deno Test Structure ---

Deno.test({
  name: "InventoryViewer: Basic Queries",
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  let paths: TestFilePaths | undefined;
  let viewerToClose: ViewerConcept | undefined;
  try {
    paths = await setupTestFiles();
    const _csvPath = paths.inventory;

    const v = await createViewer();
    viewerToClose = v;

    await t.step("viewAvailable returns an array of items", async () => {
      const available = await v.viewAvailable();
      assert(Array.isArray(available), "viewAvailable should return an array");
      assert(available.length > 0, "viewAvailable should return some items");
    });

    await t.step("viewItem retrieves a known item correctly", async () => {
      const items = await v.viewItem("Music Room Key");
      assertEquals(items.length, 1, "viewItem should return exactly one item");
      assertEquals(
        items[0].itemName,
        "Music Room Key",
        "viewItem returned the wrong item",
      );
    });

    await t.step("viewCategory finds items for a valid category", async () => {
      const games = await v.viewCategory("Games");
      assert(
        games.length > 0,
        "viewCategory should find items in 'Games' category",
      );
    });

    await t.step("viewTag finds items for a valid tag", async () => {
      const tagSearch = await v.viewTag("key");
      assert(tagSearch.length > 0, "viewTag should find items with 'key' tag");
    });

    await t.step(
      "viewItem returns an empty array for a non-existent item",
      async () => {
        const items = await v.viewItem("This Item Does Not Exist");
        assertEquals(
          items.length,
          0,
          "viewItem should return empty array for non-existent item",
        );
      },
    );

    await t.step(
      "viewCategory returns an empty array for a non-existent category",
      async () => {
        const emptyCat = await v.viewCategory("NoSuchCategory");
        assert(
          Array.isArray(emptyCat) && emptyCat.length === 0,
          "viewCategory should return an empty array for an unknown category",
        );
      },
    );
  } finally {
    if (paths) {
      await teardownTestFiles(paths);
    }
    if (viewerToClose) {
      await viewerToClose.closeDb();
    }
  }
});

Deno.test({
  name: "InventoryViewer: LLM-Assisted Queries",
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  let paths: TestFilePaths | undefined;
  let viewerToClose: ViewerConcept | undefined;
  try {
    paths = await setupTestFiles();
    const _csvPath = paths.inventory;

    const v = await createViewer();
    viewerToClose = v;
    const llm = await createLlmFromConfig();

    // If the LLM returns the empty-fallback, use a deterministic fake for these tests
    let useLLM: any = llm;
    try {
      const probe = await llm.executeLLM("probe");
      if (typeof probe === "string" && probe.trim() === "[]") {
        useLLM = {
          async executeLLM(prompt: string) {
            // If the prompt looks like an adjacent prompt, return the Music Room Key
            if (/adjacent/i.test(prompt) || /similar items/i.test(prompt)) {
              return JSON.stringify(["Music Room Key"]);
            }
            // If the prompt looks like an autocomplete/prefix, return Music Room Key
            if (/partial input/i.test(prompt) || /User input/i.test(prompt)) {
              return JSON.stringify(["Music Room Key"]);
            }
            return "[]";
          },
        };
      }
    } catch (e) {
      // fallback to deterministic fake if the real LLM errors
      useLLM = {
        async executeLLM(_prompt: string) {
          return JSON.stringify(["Music Room Key"]);
        },
      };
    }

    const loggingLLM = {
      async executeLLM(prompt: string) {
        const raw = await useLLM.executeLLM(prompt);
        console.log(`LLM called for view tests -> raw response: ${raw}`); // Keep for debugging
        return raw;
      },
    } as any; // Cast as any for flexibility with fake LLM structure

    await t.step(
      "viewAdjacent returns relevant items based on LLM recommendation",
      async () => {
        const adjacent = await v.viewAdjacent("Music Room Key", loggingLLM);
        const adjacentNames = adjacent.map((a) => a.itemName);
        assertArrayIncludes(
          adjacentNames,
          ["Music Room Key"],
          "viewAdjacent should include 'Music Room Key' based on fake LLM",
        );
      },
    );

    await t.step(
      "viewAutocomplete returns completions based on LLM recommendation",
      async () => {
        const autocomplete = await v.viewAutocomplete("Music", loggingLLM);
        const autoNames = autocomplete.map((a) => a.itemName);
        assertArrayIncludes(
          autoNames,
          ["Music Room Key"],
          "viewAutocomplete should include 'Music Room Key' based on fake LLM",
        );
      },
    );
  } finally {
    if (paths) {
      await teardownTestFiles(paths);
    }
    if (viewerToClose) {
      await viewerToClose.closeDb();
    }
  }
});

Deno.test({
  name: "Mixed Flow: Viewer and Reservation Interaction",
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  let paths: TestFilePaths | undefined;
  try {
    paths = await setupTestFiles();
    const _inventoryPath = paths.inventory;
    const _usersPath = paths.users;

    const v1 = await createViewer();
    const avail = await v1.viewAvailable();
    assert(
      avail.length >= 1,
      "Need at least one available item for mixed flow tests",
    );

    const chosen = avail[0].itemName;
    const kerb = "camjohnson";

    const [db, client] = await getDb() as unknown as [Db, MongoClient];
    const r = new ReservationConcept(db);

    await t.step("item becomes unavailable after checkout", async () => {
      await r.checkoutItem(kerb, chosen, 1);
      const v2 = await createViewer(); // Reload viewer to reflect changes
      const stillAvail = (await v2.viewAvailable()).some((i) =>
        i.itemName === chosen
      );
      assert(!stillAvail, "Item should be unavailable after checkout");
      await v2.closeDb();
      await v1.closeDb();
      await client.close();
    });
  } finally {
    if (paths) {
      await teardownTestFiles(paths);
    }
  }
});

Deno.test({
  name: "LLM Mixed Flow",
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  let paths: TestFilePaths | undefined;
  let viewerToClose: ViewerConcept | undefined;
  try {
    paths = await setupTestFiles();
    const inventoryPath = paths.inventory;
    const usersPath = paths.users;
    const viewer = await createViewer();
    viewerToClose = viewer;
    const available = await viewer.viewAvailable();
    assert(
      available.length >= 2,
      "Need at least 2 available items for concurrency test",
    );

    const target = available[0].itemName;
    const kerbA = "camjohnson";
    const kerbB = "alewilson";

    // create an LLM from config (or fallback to a fake LLM)
    const llm = await createLlmFromConfig();
    // If we're using the fake default that returns '[]', replace with a test fake that recommends the target
    let testLLM: any = llm;
    try {
      const probe = await llm.executeLLM("probe");
      if (typeof probe === "string" && probe.trim() === "[]") {
        testLLM = {
          async executeLLM(_prompt: string) {
            return JSON.stringify([{
              itemName: target,
              suggestion: "Great for group practice",
            }]);
          },
        };
      }
    } catch (e) {
      // fallback to deterministic fake if the real LLM errors
      testLLM = {
        async executeLLM(_prompt: string) {
          return JSON.stringify([{
            itemName: target,
            suggestion: "Great for group practice",
          }]);
        },
      };
    }

    // Wrap the chosen LLM with a logging proxy so we can see raw responses and the test target
    const loggingLLM = {
      async executeLLM(prompt: string) {
        const raw = await testLLM.executeLLM(prompt);
        console.log(`LLM called for target=${target} -> raw response: ${raw}`); // Keep for debugging
        return raw;
      },
    } as any; // Cast as any for flexibility with fake LLM structure

    await t.step("LLM recommendation includes the target item", async () => {
      const naturalLanguageRequest = "music practice";
      const recs = await viewer.recommendItems(
        naturalLanguageRequest,
        loggingLLM,
      );
      const recNames = recs.map((r) => r.item.itemName);
      assertArrayIncludes(
        recNames,
        [target],
        "LLM recommendation should include the target item",
      );
    });

    // Cleanup: leave inventory clean
  } finally {
    if (paths) {
      await teardownTestFiles(paths);
    }
    if (viewerToClose) {
      await viewerToClose.closeDb();
    }
  }
});
