import * as readline from "node:readline";
import * as path from "node:path";
import process from "node:process";
import { createViewerFromCsv } from "@concepts/Viewer/ViewerConcept.ts";
import {
  InventoryReservationConcept,
  // ReservationConcept,
} from "@concepts/Reservation/ReservationConcept.ts";

async function question(rl: readline.Interface, q: string) {
  return new Promise<string>((res) => rl.question(q, (ans) => res(ans.trim())));
}

async function runCli() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  // Resolve CSVs from the project working directory so compiled code (in dist/) finds them
  const inventoryPath = path.resolve(process.cwd(), "src/utils/inventory.csv");
  const usersPath = path.resolve(process.cwd(), "src/utils/users.csv");

  console.log("Loading inventory...");
  const viewer = await createViewerFromCsv();
  const reservation = new InventoryReservationConcept(
    inventoryPath,
    usersPath,
    14,
  );

  console.log('Inventory CLI ready. Type "help" for commands.');

  const help = `Commands:
  help                         show this message
  list                         list all item names
  available                    list available items
  view <item name>             show details for an item
  category <category>          list items in a category
  tag <tag>                    list items with a tag
  checkout <kerb> <item> [d]   checkout item for kerb (days optional)
  checkin <item>               check an item back in
  notify                       notify expired checkouts (prints emails)
  reload                       reload inventory.csv from disk
  quit                         exit
`;

  while (true) {
    try {
      const line = await question(rl, "> ");
      if (!line) continue;
      const [cmd, ...rest] = line.split(" ");
      const args = rest.join(" ").trim();

      if (cmd === "help") {
        console.log(help);
        continue;
      }
      if (cmd === "list") {
        console.log(viewer["items"].map((i: any) => i.itemName).join("\n"));
        continue;
      }
      if (cmd === "available") {
        const a = viewer.viewAvailable();
        console.log(a.map((i) => i.itemName).join("\n"));
        continue;
      }
      if (cmd === "view") {
        if (!args) {
          console.log("usage: view <item name>");
          continue;
        }
        try {
          const it = viewer.viewItem(args);
          console.log(it);
        } catch (e: any) {
          console.log(String(e));
        }
        continue;
      }
      if (cmd === "category") {
        const c = viewer.viewCategory(args);
        console.log(c.map((i) => i.itemName).join("\n"));
        continue;
      }
      if (cmd === "tag") {
        const t = viewer.viewTag(args);
        console.log(t.map((i) => i.itemName).join("\n"));
        continue;
      }
      if (cmd === "checkout") {
        const parts = args.split(" ").filter(Boolean);
        if (parts.length < 2) {
          console.log("usage: checkout <kerb> <item name> [days]");
          continue;
        }
        const kerb = parts.shift() as string;
        const daysPart = parts[parts.length - 1];
        let days: number | undefined = undefined;
        // if last token is a number, treat as days
        if (/^-?\d+$/.test(daysPart)) {
          days = parseInt(daysPart, 10);
          parts.pop();
        }
        const itemName = parts.join(" ");
        try {
          await reservation.checkoutItem(kerb, itemName, days ? days : 10);
          // reload viewer so subsequent queries reflect change
          await viewer.loadItems();
          console.log(`Checked out ${itemName} to ${kerb}`);
        } catch (e: any) {
          console.log("Error:", e.message || e);
        }
        continue;
      }
      if (cmd === "checkin") {
        if (!args) {
          console.log("usage: checkin <item name>");
          continue;
        }
        try {
          await reservation.checkinItem(args);
          await viewer.loadItems();
          console.log(`Checked in ${args}`);
        } catch (e: any) {
          console.log("Error:", e.message || e);
        }
        continue;
      }
      if (cmd === "notify") {
        const notified = await reservation.notifyCheckout();
        console.log("Notified:", notified.join(", "));
        continue;
      }
      if (cmd === "reload") {
        await viewer.loadItems();
        console.log("Reloaded inventory");
        continue;
      }
      if (cmd === "quit" || cmd === "exit") break;

      console.log('Unknown command, type "help"');
    } catch (e) {
      console.error("Error in loop:", e);
    }
  }

  rl.close();
  console.log("Goodbye");
}

// if (require.main === module) {
runCli().catch((e) => {
  console.error(e);
  process.exit(1);
});
// }
