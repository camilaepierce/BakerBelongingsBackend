---
timestamp: 'Sun Oct 19 2025 21:18:35 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251019_211835.c3ef7e39.md]]'
content_id: 9224a7c759fc08ca4343966504cacc9d5e0f49ac026bc5ed490ae73a7aacf940
---

# response:

To modify the Deno test suite to use `assertThrows` and the specified error types, we'll perform the following steps:

1. **Update `std/assert` import**: Add `assertThrows` to the import list.
2. **Add `errors.ts` import**: Import the custom error types from the `errors.ts` file, assuming it's located in the `src/` directory at the project root (`../../src/errors.ts` relative to the test file).
3. **Replace `node:fs/promises`**: Update `fs.copyFile` to use `Deno.copyFile` as per the initial comment in the test file.
4. **Refactor `try/catch` blocks**: Replace the existing `try/catch` blocks that assert error throwing with `assertThrows`, specifying the expected custom error type for each case.

Here's the modified test suite:

```typescript
/**
 * Inventory Roles Test Cases
 *
 * Demonstrates both manual viewing and checkout and LLM-assisted viewing
 */

// Replace node:path, node:fs/promises with Deno standard library modules
import * as path from "https://deno.land/std@0.208.0/path/mod.ts";
// Add assertThrows to the import
import { assert, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";

// Replace node:fs/promises with Deno.copyFile
// import * as fs from "node:fs/promises"; // This line is removed, using Deno.copyFile directly

// Adjust imports for Deno's module resolution.
// Assuming this test file is in `project_root/tests/`,
// Viewer/Reservation are in `project_root/Viewer/` and `project_root/Reservation/`,
// and gemini-llm.ts is in `project_root/`.
import {
  createViewerFromCsv,
  InventoryViewer,
  Item,
} from "./../Viewer/inventoryviewer.ts";
import { Reservation } from "./../Reservation/inventoryreservation.ts";
import { GeminiLLM } from "./../../gemini-llm.ts";

// Import custom error types from errors.ts
import {
  ItemNotFoundError,
  CheckoutError,
  UserNotFoundError,
  NotReservedError,
} from "../../src/errors.ts"; // Adjust path if errors.ts is elsewhere

/**
 * Helper function to get the absolute path of source files
 * relative to the project root, assuming the test file is in `project_root/tests/`.
 */
function getSrcFilePath(relativePath: string): string {
  const currentDir = path.dirname(path.fromFileUrl(import.meta.url));
  // Navigate up two levels from `tests/` to `project_root/`
  return path.join(currentDir, "../../", relativePath);
}

/**
 * Create an LLM instance from config.json in the repo root.
 * Falls back to a fake LLM if config is missing or creating the real LLM fails.
 */
async function createLlmFromConfig(): Promise<any> {
  // config.json is assumed to be at the project root
  const cfgPath = getSrcFilePath("config.json");
  try {
    const raw = await Deno.readTextFile(cfgPath); // Use Deno.readTextFile
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

// --- Deno Test Suites ---

Deno.test("Inventory Viewer Queries", async (t) => {
  const tmpDir = await Deno.makeTempDir(); // Use Deno.makeTempDir for temp directory
  const srcInventory = getSrcFilePath("/utils/inventory.csv");
  const tmpInventory = path.join(tmpDir, `inventory.test.${Date.now()}.csv`);

  try {
    // Use Deno.copyFile
    await Deno.copyFile(srcInventory, tmpInventory);

    await t.step("Basic View Operations", async () => {
      const v = await createViewerFromCsv(tmpInventory);
      const available = v.viewAvailable();
      assert(Array.isArray(available), "viewAvailable should return an array");
      assert(available.length > 0, "viewAvailable should find items");

      const item = v.viewItem("Music Room Key");
      assert(
        item.itemName === "Music Room Key",
        `viewItem returned wrong item (got ${item.itemName})`,
      );

      const games = v.viewCategory("Games");
      assert(games.length > 0, "viewCategory('Games') should find items");

      const tagSearch = v.viewTag("key");
      assert(
        tagSearch.length > 0,
        "viewTag('key') should find key-tagged items",
      );
    });

    await t.step("View Edge Cases", async () => {
      const v = await createViewerFromCsv(tmpInventory);

      // Non-existent item should throw ItemNotFoundError
      assertThrows(
        () => {
          v.viewItem("This Item Does Not Exist");
        },
        ItemNotFoundError,
        "viewItem should throw ItemNotFoundError for a missing item",
      );

      // Category with no items
      const emptyCat = v.viewCategory("NoSuchCategory");
      assert(
        Array.isArray(emptyCat) && emptyCat.length === 0,
        "viewCategory should return an empty array for an unknown category",
      );
    });
  } finally {
    await Deno.remove(tmpDir, { recursive: true }); // Clean up the temporary directory
  }
});

Deno.test("Inventory Viewer Queries with LLM", async (t) => {
  const tmpDir = await Deno.makeTempDir();
  const srcInventory = getSrcFilePath("/utils/inventory.csv");
  const tmpInventory = path.join(tmpDir, `inventory.test.${Date.now()}.csv`);

  try {
    // Use Deno.copyFile
    await Deno.copyFile(srcInventory, tmpInventory);

    await t.step("LLM-backed adjacency and autocomplete", async () => {
      const v = await createViewerFromCsv(tmpInventory);
      const llm = await createLlmFromConfig();

      // If the LLM returns the empty-fallback, replace with a deterministic fake for these tests
      let testLLM = llm;
      try {
        const probe = await llm.executeLLM("probe");
        if (typeof probe === "string" && probe.trim() === "[]") {
          testLLM = {
            async executeLLM(prompt: string) {
              if (/adjacent/i.test(prompt) || /similar items/i.test(prompt)) {
                return JSON.stringify(["Music Room Key"]);
              }
              if (/partial input/i.test(prompt) || /User input/i.test(prompt)) {
                return JSON.stringify(["Music Room Key"]);
              }
              return "[]";
            },
          } as any;
        }
      } catch (e) {
        // Fallback to deterministic fake if the real LLM errors
        testLLM = {
          async executeLLM(_prompt: string) {
            return JSON.stringify(["Music Room Key"]);
          },
        } as any;
      }

      const loggingLLM = { // Wrap LLM to log interactions during tests
        async executeLLM(prompt: string) {
          const raw = await testLLM.executeLLM(prompt);
          // console.log(`LLM called for view tests -> raw response: ${raw}`); // Uncomment for debugging
          return raw;
        },
      } as any;

      // viewAdjacent should return items similar to Music Room Key
      const adjacent = await v.viewAdjacent(
        "Music Room Key",
        loggingLLM as any,
      );
      const adjacentNames = adjacent.map((a) => a.itemName);
      assert(
        adjacentNames.includes("Music Room Key"),
        "viewAdjacent should include 'Music Room Key'",
      );

      // viewAutocomplete should return completions for prefix 'Music'
      const autocomplete = await v.viewAutocomplete("Music", loggingLLM as any);
      const autoNames = autocomplete.map((a) => a.itemName);
      assert(
        autoNames.includes("Music Room Key"),
        "viewAutocomplete should include 'Music Room Key'",
      );
    });
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("Reservation System Flow", async (t) => {
  const tmpDir = await Deno.makeTempDir();
  const srcInventory = getSrcFilePath("/utils/inventory.csv");
  const srcUsers = getSrcFilePath("/utils/users.csv");
  const tmpInventory = path.join(tmpDir, `inventory.test.${Date.now()}.csv`);
  const tmpUsers = path.join(tmpDir, `users.test.${Date.now()}.csv`);

  try {
    // Use Deno.copyFile
    await Deno.copyFile(srcInventory, tmpInventory);
    await Deno.copyFile(srcUsers, tmpUsers);

    const r = new Reservation(tmpInventory, tmpUsers, 1); // 1-day expiry for quick test
    const v = await createViewerFromCsv(tmpInventory);
    const available = v.viewAvailable();
    assert(
      available.length >= 3,
      "Need at least 3 available items for reservation tests",
    );
    const kerb = "camjohnson";
    const itemName = available[0].itemName;
    const otherItem = available[1].itemName; // used for expired notify
    const spareItem = available[2].itemName; // used for non-reserved checkin test

    await t.step("Successful Checkout and Checkin", async () => {
      await r.checkoutItem(kerb, itemName, 1);
      // No explicit assert, successful execution implies pass
      await r.checkinItem(itemName);
      // No explicit assert, successful execution implies pass
    });

    await t.step("Edge Case: Double Checkout throws CheckoutError", async () => {
      await r.checkoutItem(kerb, itemName, 1); // Checkout first
      await assertThrows(
        async () => {
          await r.checkoutItem(kerb, itemName, 1); // Attempt double checkout
        },
        CheckoutError, // Expect CheckoutError
        "checkoutItem should throw CheckoutError when an item is already checked out",
      );
      await r.checkinItem(itemName); // Clean up for next tests
    });

    await t.step("Notify Expired Checkout identifies user", async () => {
      await r.checkoutItem(kerb, otherItem, -1); // Checkout with immediate expiry
      const notified = await r.notifyCheckout();
      assert(
        notified.includes(kerb),
        "notifyCheckout should notify expired kerb",
      );
    });

    await t.step(
      "Edge Case: Checkout with invalid kerb throws UserNotFoundError",
      async () => {
        await assertThrows(
          async () => {
            await r.checkoutItem("not-a-user", spareItem, 1);
          },
          UserNotFoundError, // Expect UserNotFoundError
          "checkoutItem should throw UserNotFoundError for a missing kerb (user)",
        );
      },
    );

    await t.step(
      "Edge Case: Checkout non-existent item throws ItemNotFoundError",
      async () => {
        await assertThrows(
          async () => {
            await r.checkoutItem(kerb, "This Item Does Not Exist", 1);
          },
          ItemNotFoundError, // Expect ItemNotFoundError
          "checkoutItem should throw ItemNotFoundError for a non-existent item",
        );
      },
    );

    await t.step(
      "Edge Case: Checkin non-reserved item throws NotReservedError",
      async () => {
        await assertThrows(
          async () => {
            await r.checkinItem(spareItem);
          },
          NotReservedError, // Expect NotReservedError
          "checkinItem should throw NotReservedError for an item not currently reserved",
        );
      },
    );
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("Mixed Flow: Viewer and Reservation Interaction", async (t) => {
  const tmpDir = await Deno.makeTempDir();
  const srcInventory = getSrcFilePath("/utils/inventory.csv");
  const srcUsers = getSrcFilePath("/utils/users.csv");
  const tmpInventory = path.join(tmpDir, `inventory.test.${Date.now()}.csv`);
  const tmpUsers = path.join(tmpDir, `users.test.${Date.now()}.csv`);

  try {
    // Use Deno.copyFile
    await Deno.copyFile(srcInventory, tmpInventory);
    await Deno.copyFile(srcUsers, tmpUsers);

    const v1 = await createViewerFromCsv(tmpInventory);
    const avail = v1.viewAvailable();
    assert(
      avail.length >= 1,
      "Need at least one available item for mixed flow test",
    );

    const chosen = avail[0].itemName;
    const kerb = "camjohnson";
    const r = new Reservation(tmpInventory, tmpUsers, 1);

    await t.step("Item is unavailable after checkout", async () => {
      await r.checkoutItem(kerb, chosen, 1);
      const v2 = await createViewerFromCsv(tmpInventory); // Reload viewer
      const stillAvail = v2.viewAvailable().some((i) => i.itemName === chosen);
      assert(!stillAvail, "Item should be unavailable after checkout");
    });

    await t.step("Item is available after checkin", async () => {
      await r.checkinItem(chosen);
      const v3 = await createViewerFromCsv(tmpInventory); // Reload viewer
      const backAvail = v3.viewAvailable().some((i) => i.itemName === chosen);
      assert(backAvail, "Item should be available after checkin");
    });
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("Concurrent Operations & LLM Integration", async (t) => {
  const tmpDir = await Deno.makeTempDir();
  const srcInventory = getSrcFilePath("/utils/inventory.csv");
  const srcUsers = getSrcFilePath("/utils/users.csv");
  const tmpInventory = path.join(tmpDir, `inventory.test.${Date.now()}.csv`);
  const tmpUsers = path.join(tmpDir, `users.test.${Date.now()}.csv`);

  try {
    // Use Deno.copyFile
    await Deno.copyFile(srcInventory, tmpInventory);
    await Deno.copyFile(srcUsers, tmpUsers);

    const viewer = await createViewerFromCsv(tmpInventory);
    const available = viewer.viewAvailable();
    assert(
      available.length >= 2,
      "Need at least 2 available items for concurrency test",
    );

    const target = available[0].itemName;
    const kerbA = "camjohnson";
    const kerbB = "alewilson";

    // Create LLM (real or test-fake)
    let testLLM = await createLlmFromConfig();
    try {
      const probe = await testLLM.executeLLM("probe");
      if (typeof probe === "string" && probe.trim() === "[]") {
        testLLM = {
          async executeLLM(_prompt: string) {
            return JSON.stringify([{
              itemName: target,
              suggestion: "Great for group practice",
            }]);
          },
        } as any;
      }
    } catch (e) {
      testLLM = {
        async executeLLM(_prompt: string) {
          return JSON.stringify([{
            itemName: target,
            suggestion: "Great for group practice",
          }]);
        },
      } as any;
    }

    const loggingLLM = { // Wrap LLM to log interactions during tests
      async executeLLM(prompt: string) {
        const raw = await testLLM.executeLLM(prompt);
        // console.log(`LLM called for target=${target} -> raw response: ${raw}`); // Uncomment for debugging
        return raw;
      },
    } as any;

    // Use two separate reservation instances to simulate concurrent desks
    const r1 = new Reservation(tmpInventory, tmpUsers, 1);
    const r2 = new Reservation(tmpInventory, tmpUsers, 1);

    await t.step("LLM Recommends Items", async () => {
      const naturalLanguageRequest = "music practice";
      const recs = await viewer.recommendItems(
        naturalLanguageRequest,
        loggingLLM as any,
      );
      const recNames = recs.map((r) => r.item.itemName);
      assert(
        recNames.includes(target),
        "LLM recommendation should include the target item",
      );
    });

    await t.step(
      "First concurrent checkout succeeds, second throws CheckoutError",
      async () => {
        await r1.checkoutItem(kerbA, target, 1); // r1 checks out the target

        await assertThrows(
          async () => {
            await r2.checkoutItem(kerbB, target, 1); // r2 attempts to checkout same item
          },
          CheckoutError, // Expect CheckoutError
          "Second concurrent checkout should throw CheckoutError",
        );
      },
    );

    await t.step(
      "Second checkout succeeds after first item is returned",
      async () => {
        await r1.checkinItem(target); // r1 checks in the item
        await r2.checkoutItem(kerbB, target, 1); // Now r2 should be able to checkout
        // No explicit assert, successful execution implies pass
      },
    );

    // Cleanup: checkin by r2
    await r2.checkinItem(target);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
```
