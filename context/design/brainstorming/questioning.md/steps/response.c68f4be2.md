---
timestamp: 'Thu Oct 16 2025 02:06:08 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251016_020608.0daeab94.md]]'
content_id: c68f4be2a5fcd4b09a98d2779bcfd6edda10f5f489f4e8c24a30cc03ae94b6af
---

# response:

To modify the TypeScript code to run tests using the Deno format, we'll primarily restructure the test logic into `Deno.test` blocks, replace custom `assert` functions with Deno's standard library assertions, and adjust the setup/teardown of temporary files for test isolation.

Here's a step-by-step breakdown of the changes:

1. **Import Deno Assertions:** Replace the custom `assert` function with specific assertion functions from Deno's standard library (`assert`, `assertEquals`, `assertThrows`, `assertArrayIncludes`).
2. **Restructure with `Deno.test`:** Each logical test function (e.g., `testQueries`, `testReservationFlow`) will become a top-level `Deno.test` call. Inside these, individual assertions will be wrapped in `t.step` for better reporting and organization within a test suite.
3. **Temporary File Management:** The `runTests` function's logic for copying and cleaning up `inventory.csv` and `users.csv` needs to be adapted. Since different tests modify these files, each `Deno.test` suite will perform its own setup and teardown to ensure test isolation. Helper functions `setupTestFiles` and `teardownTestFiles` will be created for this.
4. **Remove Custom Test Runner:** The `runTests` function and its `if (require.main === module)` guard are removed, as Deno's test runner will automatically discover and execute `Deno.test` calls when the file is run with `deno test`.
5. **Remove `console.log` as Assertions:** Lines like `console.log("TEST: ... PASS/FAIL")` are replaced by actual Deno assertions. Some `console.log` for debugging LLM interactions are retained.
6. **Error Messages:** Ensure `assertThrows` calls have specific error messages for better test clarity.

```typescript
/**
 * Inventory Viewer Test Cases
 *
 * Demonstrates both manual viewing and checkout and LLM-assisted viewing
 */

import {
  createViewerFromCsv,
  InventoryViewer,
  Item,
} from "./inventoryviewer.ts";
import { Reservation } from "../Reservation/inventoryreservation.ts";
// Deno std library for assertions
import {
  assert,
  assertEquals,
  assertThrows,
  assertArrayIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
// Node.js compatibility modules for file system and path operations
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as process from "node:process"; // For process.cwd()

import { GeminiLLM } from "../../gemini-llm.ts";

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

// --- Helper for temporary file setup/teardown ---
const srcInventory = path.resolve(Deno.cwd(), "inventory.csv");
const srcUsers = path.resolve(Deno.cwd(), "users.csv");

interface TestFilePaths {
  inventory: string;
  users: string;
}

/**
 * Copies inventory.csv and users.csv to temporary files for isolated testing.
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

Deno.test("InventoryViewer: Basic Queries", async (t) => {
  let paths: TestFilePaths | undefined;
  try {
    paths = await setupTestFiles();
    const csvPath = paths.inventory;

    const v = await createViewerFromCsv(csvPath);

    await t.step("viewAvailable returns an array of items", () => {
      const available = v.viewAvailable();
      assert(Array.isArray(available), "viewAvailable should return an array");
      assert(available.length > 0, "viewAvailable should return some items");
    });

    await t.step("viewItem retrieves a known item correctly", () => {
      const item = v.viewItem("Music Room Key");
      assertEquals(item.itemName, "Music Room Key", "viewItem returned the wrong item");
    });

    await t.step("viewCategory finds items for a valid category", () => {
      const games = v.viewCategory("Games");
      assert(games.length > 0, "viewCategory should find items in 'Games' category");
    });

    await t.step("viewTag finds items for a valid tag", () => {
      const tagSearch = v.viewTag("key");
      assert(tagSearch.length > 0, "viewTag should find items with 'key' tag");
    });

    await t.step("viewItem throws an error for a non-existent item", () => {
      assertThrows(
        () => {
          v.viewItem("This Item Does Not Exist");
        },
        Error,
        "Item 'This Item Does Not Exist' not found",
        "viewItem should throw for a missing item",
      );
    });

    await t.step("viewCategory returns an empty array for a non-existent category", () => {
      const emptyCat = v.viewCategory("NoSuchCategory");
      assert(
        Array.isArray(emptyCat) && emptyCat.length === 0,
        "viewCategory should return an empty array for an unknown category",
      );
    });
  } finally {
    if (paths) {
      await teardownTestFiles(paths);
    }
  }
});

Deno.test("InventoryViewer: LLM-Assisted Queries", async (t) => {
  let paths: TestFilePaths | undefined;
  try {
    paths = await setupTestFiles();
    const csvPath = paths.inventory;

    const v = await createViewerFromCsv(csvPath);
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

    await t.step("viewAdjacent returns relevant items based on LLM recommendation", async () => {
      const adjacent = await v.viewAdjacent("Music Room Key", loggingLLM);
      const adjacentNames = adjacent.map((a) => a.itemName);
      assertArrayIncludes(
        adjacentNames,
        ["Music Room Key"],
        "viewAdjacent should include 'Music Room Key' based on fake LLM",
      );
    });

    await t.step("viewAutocomplete returns completions based on LLM recommendation", async () => {
      const autocomplete = await v.viewAutocomplete("Music", loggingLLM);
      const autoNames = autocomplete.map((a) => a.itemName);
      assertArrayIncludes(
        autoNames,
        ["Music Room Key"],
        "viewAutocomplete should include 'Music Room Key' based on fake LLM",
      );
    });
  } finally {
    if (paths) {
      await teardownTestFiles(paths);
    }
  }
});

Deno.test("Reservation: Core Flow", async (t) => {
  let paths: TestFilePaths | undefined;
  try {
    paths = await setupTestFiles();
    const inventoryPath = paths.inventory;
    const usersPath = paths.users;

    const r = new Reservation(inventoryPath, usersPath, 1); // 1-day expiry for quick test

    // pick available items dynamically to avoid relying on hard-coded names
    const v = await createViewerFromCsv(inventoryPath);
    const available = v.viewAvailable();
    assert(
      available.length >= 3,
      "Need at least 3 available items for reservation tests",
    );
    const kerb = "camjohnson";
    const itemName = available[0].itemName;
    const otherItem = available[1].itemName; // used for expired notify
    const spareItem = available[2].itemName; // used for non-reserved checkin test

    await t.step("checkoutItem successfully reserves an item", async () => {
      await r.checkoutItem(kerb, itemName, 1);
      // Success is no throw
      assert(true, "checkoutItem should succeed for a valid reservation");
    });

    await t.step("attempting to double checkout the same item throws an error", async () => {
      await assertThrows(
        async () => {
          await r.checkoutItem(kerb, itemName, 1);
        },
        Error,
        `Item '${itemName}' is already checked out.`,
        "checkoutItem should throw when an item is already checked out",
      );
    });

    await t.step("notifyCheckout identifies and notifies expired reservations", async () => {
      // Simulate immediate expiry by checking out an item with -1 days.
      await r.checkoutItem(kerb, otherItem, -1);
      const notified = await r.notifyCheckout();
      assertArrayIncludes(
        notified,
        [kerb],
        "notifyCheckout should notify the kerb of an expired reservation",
      );
    });

    await t.step("checkinItem successfully returns a reserved item", async () => {
      await r.checkinItem(itemName);
      // Success is no throw
      assert(true, "checkinItem should succeed for a valid return");
    });

    await t.step("checkoutItem throws for an invalid kerb", async () => {
      await assertThrows(
        async () => {
          await r.checkoutItem("not-a-user", spareItem);
        },
        Error,
        "User 'not-a-user' not found",
        "checkoutItem should fail for a non-existent user",
      );
    });

    await t.step("checkoutItem throws for a non-existent item", async () => {
      await assertThrows(
        async () => {
          await r.checkoutItem(kerb, "This Item Does Not Exist");
        },
        Error,
        "Item 'This Item Does Not Exist' not found",
        "checkoutItem should fail for a non-existent item",
      );
    });

    await t.step("checkinItem throws for an item not currently reserved", async () => {
      await assertThrows(
        async () => {
          await r.checkinItem(spareItem);
        },
        Error,
        `Item '${spareItem}' is not currently checked out.`,
        "checkinItem should throw for an item not actively reserved",
      );
    });
  } finally {
    if (paths) {
      await teardownTestFiles(paths);
    }
  }
});

Deno.test("Mixed Flow: Viewer and Reservation Interaction", async (t) => {
  let paths: TestFilePaths | undefined;
  try {
    paths = await setupTestFiles();
    const inventoryPath = paths.inventory;
    const usersPath = paths.users;

    const v1 = await createViewerFromCsv(inventoryPath);
    const avail = v1.viewAvailable();
    assert(
      avail.length >= 1,
      "Need at least one available item for mixed flow tests",
    );

    const chosen = avail[0].itemName;
    const kerb = "camjohnson";

    const r = new Reservation(inventoryPath, usersPath, 1);

    await t.step("item becomes unavailable after checkout", async () => {
      await r.checkoutItem(kerb, chosen, 1);
      const v2 = await createViewerFromCsv(inventoryPath); // Reload viewer to reflect changes
      const stillAvail = v2.viewAvailable().some((i) => i.itemName === chosen);
      assert(!stillAvail, "Item should be unavailable after checkout");
    });

    await t.step("item becomes available again after checkin", async () => {
      await r.checkinItem(chosen);
      const v3 = await createViewerFromCsv(inventoryPath); // Reload viewer to reflect changes
      const backAvail = v3.viewAvailable().some((i) => i.itemName === chosen);
      assert(backAvail, "Item should be available again after checkin");
    });
  } finally {
    if (paths) {
      await teardownTestFiles(paths);
    }
  }
});

Deno.test("Concurrent + LLM Mixed Flow", async (t) => {
  let paths: TestFilePaths | undefined;
  try {
    paths = await setupTestFiles();
    const inventoryPath = paths.inventory;
    const usersPath = paths.users;

    const viewer = await createViewerFromCsv(inventoryPath);
    const available = viewer.viewAvailable();
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

    // Use two separate reservation instances pointing to the same CSV
    const r1 = new Reservation(inventoryPath, usersPath, 1);
    const r2 = new Reservation(inventoryPath, usersPath, 1);

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

    await t.step("concurrent checkout of the same item throws an error", async () => {
      await r1.checkoutItem(kerbA, target, 1); // r1 checks out the target
      await assertThrows(
        async () => {
          await r2.checkoutItem(kerbB, target, 1); // r2 attempts to check out the same target
        },
        Error,
        `Item '${target}' is already checked out.`,
        "Second concurrent checkout should throw an error",
      );
    });

    await t.step("second reservation can checkout after first reservation checks in", async () => {
      // After r1 checkin, r2 can checkout successfully
      await r1.checkinItem(target);
      await r2.checkoutItem(kerbB, target, 1);
      assert(true, "r2 should be able to checkout after r1 checkin");
    });

    // Cleanup: checkin by r2 to leave inventory clean
    await r2.checkinItem(target);
  } finally {
    if (paths) {
      await teardownTestFiles(paths);
    }
  }
});
```
