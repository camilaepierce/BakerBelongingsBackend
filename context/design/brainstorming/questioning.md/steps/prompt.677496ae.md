---
timestamp: 'Thu Oct 16 2025 02:09:23 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251016_020923.6cc86b8c.md]]'
content_id: 677496aec898af9df6163ea683fe1415bd7cef6733df44fb81c600a4f02a33a6
---

# prompt: Modify the given typescript code to run tests using the Deno format:

```typescript
/**
 * Inventory Roles Test Cases
 *
 * Demonstrates both manual viewing and checkout and LLM-assisted viewing
 */

import {
  createViewerFromCsv,
  InventoryViewer,
  Item,
} from "../Viewer/inventoryviewer.ts";
import { Reservation } from "../Reservation/inventoryreservation.ts";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";
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

async function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function testQueries(csvPath: string) {
  // Resident View
  const v = await createViewerFromCsv(csvPath);
  // ensure loadItems populated something
  const available = v.viewAvailable();
  console.log(`Available items: ${available.length}`);
  console.log(
    "TEST: viewAvailable returns an array ->",
    Array.isArray(available) ? "PASS" : "FAIL",
  );
  await assert(Array.isArray(available), "viewAvailable should return array");

  // pick a known item
  const item = v.viewItem("Music Room Key");
  const itemMatch = item.itemName === "Music Room Key";
  console.log(
    `TEST: viewItem('Music Room Key') ->`,
    itemMatch ? "PASS" : `FAIL (got ${item.itemName})`,
  );
  await assert(itemMatch, "viewItem returned wrong item");

  const games = v.viewCategory("Games");
  console.log(
    'TEST: viewCategory("Games") finds items ->',
    games.length > 0 ? "PASS" : "FAIL",
  );
  await assert(games.length > 0, "viewCategory should find games");

  const tagSearch = v.viewTag("key");
  console.log(
    'TEST: viewTag("key") finds items ->',
    tagSearch.length > 0 ? "PASS" : "FAIL",
  );
  await assert(tagSearch.length > 0, "viewTag should find key-tagged items");

  // Edge case: non-existent item should throw
  let threw = false;
  try {
    v.viewItem("This Item Does Not Exist");
  } catch (e) {
    threw = true;
  }
  console.log(
    "EDGE: viewItem(non-existent) throws ->",
    threw ? "PASS" : "FAIL",
  );
  await assert(threw, "viewItem should throw for missing item");

  // Edge case: category with no items
  const emptyCat = v.viewCategory("NoSuchCategory");
  console.log(
    "EDGE: viewCategory(no items) returns empty ->",
    Array.isArray(emptyCat) && emptyCat.length === 0 ? "PASS" : "FAIL",
  );
  await assert(
    Array.isArray(emptyCat) && emptyCat.length === 0,
    "viewCategory should return empty array for unknown category",
  );

  console.log("testQueries passed");
}

// Add LLM-backed tests for adjacency and autocomplete
async function testQueriesWithLLM(csvPath: string) {
  const v = await createViewerFromCsv(csvPath);
  const llm = await createLlmFromConfig();

  // If the LLM returns the empty-fallback, use a deterministic fake for these tests
  let useLLM = llm;
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
      } as any;
    }
  } catch (e) {
    useLLM = {
      async executeLLM(_prompt: string) {
        return JSON.stringify(["Music Room Key"]);
      },
    } as any;
  }

  const loggingLLM = {
    async executeLLM(prompt: string) {
      const raw = await useLLM.executeLLM(prompt);
      console.log(`LLM called for view tests -> raw response: ${raw}`);
      return raw;
    },
  } as any;

  // viewAdjacent should return items similar to Music Room Key when fed Music Room Key
  const adjacent = await v.viewAdjacent("Music Room Key", loggingLLM as any);
  const adjacentNames = adjacent.map((a) => a.itemName);
  console.log("LLM-adjacent returned ->", adjacentNames);
  await assert(
    adjacentNames.includes("Music Room Key"),
    "viewAdjacent should include Music Room Key",
  );

  // viewAutocomplete should return completions including Music Room Key for prefix 'Music'
  const autocomplete = await v.viewAutocomplete("Music", loggingLLM as any);
  const autoNames = autocomplete.map((a) => a.itemName);
  console.log("LLM-autocomplete returned ->", autoNames);
  await assert(
    autoNames.includes("Music Room Key"),
    "viewAutocomplete should include Music Room Key",
  );

  console.log("testQueriesWithLLM passed");
}

async function testReservationFlow(inventoryPath: string, usersPath: string) {
  // Desk View
  const r = new Reservation(inventoryPath, usersPath, 1); // 1-day expiry for quick test

  // pick available items dynamically to avoid relying on hard-coded names
  const v = await createViewerFromCsv(inventoryPath);
  const available = v.viewAvailable();
  console.log(`Available for reservation: ${available.length}`);
  await assert(
    available.length >= 3,
    "need at least 3 available items for reservation tests",
  );
  const kerb = "camjohnson";
  const itemName = available[0].itemName;
  const otherItem = available[1].itemName; // used for expired notify
  const spareItem = available[2].itemName; // used for non-reserved checkin test

  // ensure checkout succeeds
  await r.checkoutItem(kerb, itemName, 1);
  console.log("TEST: checkoutItem should succeed -> PASS");

  // Edge: attempting to checkout the same item again should throw
  let doubleCheckoutThrew = false;
  try {
    await r.checkoutItem(kerb, itemName, 1);
  } catch (e) {
    doubleCheckoutThrew = true;
  }
  console.log(
    "EDGE: double checkout throws ->",
    doubleCheckoutThrew ? "PASS" : "FAIL",
  );
  await assert(
    doubleCheckoutThrew,
    "checkoutItem should throw when item already checked out",
  );

  // notify (should not notify immediately because expiry is ~tomorrow). We'll simulate expiry by checking out another item with -1 days.
  // (This relies on Reservation.reservations shape; we emulate by calling checkout with -1 days.)
  await r.checkoutItem(kerb, otherItem, -1); // immediate expired
  const notified = await r.notifyCheckout();
  const notifiedOk = notified.includes(kerb);
  console.log(
    "TEST: notifyCheckout should notify expired kerb ->",
    notifiedOk ? "PASS" : "FAIL",
  );
  await assert(notifiedOk, "notifyCheckout should notify expired kerb");

  // checkin item
  await r.checkinItem(itemName);
  console.log("TEST: checkinItem should succeed -> PASS");

  // Edge case: checkout with invalid kerb
  let badKerbThrew = false;
  try {
    await r.checkoutItem("not-a-user", spareItem);
  } catch (e) {
    badKerbThrew = true;
  }
  console.log(
    "EDGE: checkout with invalid kerb ->",
    badKerbThrew ? "PASS" : "FAIL",
  );
  await assert(badKerbThrew, "checkoutItem should fail for missing kerb");

  // Edge case: checkout non-existent item
  let badItemThrew = false;
  try {
    await r.checkoutItem(kerb, "This Item Does Not Exist");
  } catch (e) {
    badItemThrew = true;
  }
  console.log(
    "EDGE: checkout non-existent item ->",
    badItemThrew ? "PASS" : "FAIL",
  );
  await assert(badItemThrew, "checkoutItem should fail for missing item");

  // Edge case: checkin an item not reserved should throw
  let checkinThrew = false;
  try {
    await r.checkinItem(spareItem);
  } catch (e) {
    checkinThrew = true;
  }
  console.log(
    "EDGE: checkin non-reserved item throws ->",
    checkinThrew ? "PASS" : "FAIL",
  );
  await assert(
    checkinThrew,
    "checkinItem should throw for unknown reservation",
  );

  console.log("testReservationFlow passed");
}

/**
 * Mixed flow test:
 * - Load viewer and pick an available item
 * - Checkout the item via Reservation
 * - Reload viewer and assert the item is no longer available
 * - Checkin the item via Reservation
 * - Reload viewer and assert the item is available again
 */
async function testMixedFlow(inventoryPath: string, usersPath: string) {
  const v1 = await createViewerFromCsv(inventoryPath);
  const avail = v1.viewAvailable();
  console.log(`MIXED: available before mixed test: ${avail.length}`);
  await assert(
    avail.length >= 1,
    "need at least one available item for mixed flow",
  );

  const chosen = avail[0].itemName;
  const kerb = "camjohnson";

  const r = new Reservation(inventoryPath, usersPath, 1);

  // Checkout
  await r.checkoutItem(kerb, chosen, 1);
  console.log("MIXED: checkout performed");

  // Reload viewer and ensure chosen is not available
  const v2 = await createViewerFromCsv(inventoryPath);
  const stillAvail = v2.viewAvailable().some((i) => i.itemName === chosen);
  console.log(
    "MIXED: item is unavailable after checkout ->",
    !stillAvail ? "PASS" : "FAIL",
  );
  await assert(!stillAvail, "item should be unavailable after checkout");

  // Checkin
  await r.checkinItem(chosen);
  console.log("MIXED: checkin performed");

  // Reload viewer and ensure chosen is available again
  const v3 = await createViewerFromCsv(inventoryPath);
  const backAvail = v3.viewAvailable().some((i) => i.itemName === chosen);
  console.log(
    "MIXED: item is available after checkin ->",
    backAvail ? "PASS" : "FAIL",
  );
  await assert(backAvail, "item should be available after checkin");

  console.log("testMixedFlow passed");
}

/**
 * Concurrent + LLM mixed flow:
 * - Create two Reservation instances to simulate two desks operating concurrently
 * - Both attempt to checkout the same item; one should succeed, the other should throw
 * - Between these actions, invoke an LLM recommendItems to ensure the viewer can be queried
 *   while reservations are happening.
 */
async function testConcurrentAndLLMFlow(
  inventoryPath: string,
  usersPath: string,
) {
  const viewer = await createViewerFromCsv(inventoryPath);
  const available = viewer.viewAvailable();
  console.log(`CONCURRENCY: starting available count: ${available.length}`);
  await assert(
    available.length >= 2,
    "need at least 2 available items for concurrency test",
  );

  const target = available[0].itemName;
  const kerbA = "camjohnson";
  const kerbB = "alewilson";

  // create an LLM from config (or fallback to a fake LLM)
  const llm = await createLlmFromConfig();
  // If we're using the fake default that returns '[]', replace with a test fake that recommends the target
  let testLLM = llm;
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
      } as any;
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
    } as any;
  }

  // Use two separate reservation instances pointing to the same CSV
  const r1 = new Reservation(inventoryPath, usersPath, 1);
  const r2 = new Reservation(inventoryPath, usersPath, 1);

  // Wrap the chosen LLM with a logging proxy so we can see raw responses and the test target
  const loggingLLM = {
    async executeLLM(prompt: string) {
      const raw = await testLLM.executeLLM(prompt);
      console.log(`LLM called for target=${target} -> raw response: ${raw}`);
      return raw;
    },
  } as any;

  // Start by calling LLM-assisted recommend to ensure viewer integration works
  const naturalLanguageRequest = "music practice";
  console.log(
    "CONCURRENCY: Natural language request was - ",
    naturalLanguageRequest,
  );
  const recs = await viewer.recommendItems(
    naturalLanguageRequest,
    loggingLLM as any,
  );
  const recNames = recs.map((r) => r.item.itemName);
  console.log(
    "CONCURRENCY: processed LLM recommendations ->",
    recs.map((r) => ({ itemName: r.item.itemName, suggestion: r.suggestion })),
  );
  console.log(
    "CONCURRENCY: LLM recommended names include target ->",
    recNames.includes(target) ? "PASS" : "FAIL",
  );
  await assert(
    recNames.includes(target),
    "LLM recommendation should include target",
  );

  // r1 checks out the target
  await r1.checkoutItem(kerbA, target, 1);
  console.log("CONCURRENCY: r1 checked out target");

  // r2 attempts to check out the same target and should throw
  let r2Threw = false;
  try {
    await r2.checkoutItem(kerbB, target, 1);
  } catch (e) {
    r2Threw = true;
    console.log(
      "CONCURRENCY: r2 checkout threw as expected ->",
      (e as Error).message,
    );
  }
  console.log(
    "CONCURRENCY: concurrent checkout throws ->",
    r2Threw ? "PASS" : "FAIL",
  );
  await assert(r2Threw, "Second concurrent checkout should throw");

  // After r1 checkin, r2 can checkout successfully
  await r1.checkinItem(target);
  console.log("CONCURRENCY: r1 checked in target");

  // Now r2 should be able to checkout
  await r2.checkoutItem(kerbB, target, 1);
  console.log("CONCURRENCY: r2 checked out target after r1 checkin -> PASS");

  // cleanup: checkin by r2
  await r2.checkinItem(target);

  console.log("testConcurrentAndLLMFlow passed");
}

export async function runTests() {
  const tmpDir = os.tmpdir();
  const srcInventory = path.resolve(process.cwd(), "inventory.csv");
  const srcUsers = path.resolve(process.cwd(), "users.csv");
  const tmpInventory = path.join(tmpDir, `inventory.test.${Date.now()}.csv`);
  const tmpUsers = path.join(tmpDir, `users.test.${Date.now()}.csv`);
  try {
    await fs.copyFile(srcInventory, tmpInventory);
    await fs.copyFile(srcUsers, tmpUsers);

    await testQueries(tmpInventory);
    await testQueriesWithLLM(tmpInventory);
    await testReservationFlow(tmpInventory, tmpUsers);
    // mixed flow: interleave queries and reservations
    await testMixedFlow(tmpInventory, tmpUsers);
    // concurrent + LLM mixed flow
    await testConcurrentAndLLMFlow(tmpInventory, tmpUsers);
    console.log("ALL TESTS PASSED");
  } catch (e) {
    console.error("TEST FAILED:", e instanceof Error ? e.message : String(e));
    process.exitCode = 2;
  } finally {
    try {
      await fs.unlink(tmpInventory);
    } catch (_) {}
    try {
      await fs.unlink(tmpUsers);
    } catch (_) {}
  }
}

// if (require.main === module) runTests();
```
