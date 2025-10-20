---
timestamp: 'Wed Oct 15 2025 15:23:54 GMT-0400 (Eastern Daylight Time)'
parent: '[[../20251015_152354.3c718c73.md]]'
content_id: d06b4d5d5da9a564cd0d9c81e7538ac575da781683495e3bbef54e6b47f8bab5
---

# file: src/concepts/Reservation/inventoryreservation.ts

```typescript
import { promises as fs } from "fs";
import * as path from "path";
import { GeminiLLM } from "./gemini-llm";
import { InventoryViewer, Item } from "./inventoryviewer";
/**
 * Reservation
 * - Operates directly on CSV files (inventory.csv and users.csv)
 * - Keeps an in-memory map of current reservations (itemName -> {kerb, expiry})
 * - Does not access InventoryViewer internals (representation independent)
 */
export class Reservation {
  private inventoryPath: string;
  private usersPath: string;
  private reservations: Map<string, { kerb: string; expiry: Date }> = new Map();
  private defaultDays: number;

  constructor(
    inventoryCsvPath?: string,
    usersCsvPath?: string,
    defaultDurationDays = 14,
  ) {
    this.inventoryPath = inventoryCsvPath ??
      path.resolve(__dirname, "inventory.csv");
    this.usersPath = usersCsvPath ?? path.resolve(__dirname, "users.csv");
    this.defaultDays = defaultDurationDays;
  }

  /**
   * Checkout an item for a kerb (kerb must be a resident).
   * item can be an Item object or an itemName string.
   * Effects: sets Available=0, sets LastCheckout to the expiry date (ISO Y-M-D), sets LastKerb to the kerb,
   * and records an in-memory expiry for notifyCheckout.
   */
  async checkoutItem(
    kerb: string,
    item: string | Item,
    durationDays?: number,
  ): Promise<void> {
    const itemName = typeof item === "string" ? item : item.itemName;
    const user = await this.findUser(kerb);
    if (!user) throw new Error(`Kerb not found: ${kerb}`);
    if (!user.role || user.role.toLowerCase() !== "resident") {
      throw new Error(`Kerb is not a resident: ${kerb}`);
    }

    const { header, rows } = await this.readCsv(this.inventoryPath);
    const idxItemName = this.colIndex(header, "ItemName");
    const idxAvailable = this.colIndex(header, "Available");
    const idxLastCheckout = this.colIndex(header, "LastCheckout");
    const idxLastKerb = this.colIndex(header, "LastKerb");

    if (idxItemName < 0) {
      throw new Error("inventory.csv missing ItemName column");
    }

    const rowIdx = rows.findIndex((r) =>
      (r[idxItemName] || "").toLowerCase() === itemName.toLowerCase()
    );
    if (rowIdx === -1) throw new Error(`Item not found: ${itemName}`);
    // If the inventory row indicates the item is not available, treat as already checked out
    if (idxAvailable >= 0) {
      const availVal = (rows[rowIdx][idxAvailable] || "").toString().trim();
      if (availVal === "0" || availVal.toLowerCase() === "false") {
        throw new Error(`Item already checked out: ${itemName}`);
      }
    }

    // Also guard against double-reserving in-memory
    if (this.reservations.has(itemName)) {
      const rec = this.reservations.get(itemName)!;
      if (rec && rec.expiry > new Date()) {
        throw new Error(`Item already checked out: ${itemName}`);
      }
    }
    const days = durationDays ?? this.defaultDays;
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);

    if (idxAvailable >= 0) rows[rowIdx][idxAvailable] = "0";
    if (idxLastCheckout >= 0) {
      rows[rowIdx][idxLastCheckout] = expiry.toISOString().slice(0, 10);
    }
    if (idxLastKerb >= 0) rows[rowIdx][idxLastKerb] = kerb;

    await this.writeCsv(this.inventoryPath, header, rows);

    this.reservations.set(itemName, { kerb, expiry });
  }

  /**
   * Check an item back in. Removes in-memory reservation and marks item Available=1 in inventory.csv
   */
  async checkinItem(item: string | Item): Promise<void> {
    const itemName = typeof item === "string" ? item : item.itemName;
    const { header, rows } = await this.readCsv(this.inventoryPath);
    const idxItemName = this.colIndex(header, "ItemName");
    const idxAvailable = this.colIndex(header, "Available");
    const idxLastKerb = this.colIndex(header, "LastKerb");

    if (idxItemName < 0) {
      throw new Error("inventory.csv missing ItemName column");
    }

    const rowIdx = rows.findIndex((r) =>
      (r[idxItemName] || "").toLowerCase() === itemName.toLowerCase()
    );
    if (rowIdx === -1) throw new Error(`Item not found: ${itemName}`);

    // Only allow checkin if we have a reservation recorded
    if (!this.reservations.has(itemName)) {
      throw new Error(`Item is not currently checked out: ${itemName}`);
    }

    if (idxAvailable >= 0) rows[rowIdx][idxAvailable] = "1";
    if (idxLastKerb >= 0) rows[rowIdx][idxLastKerb] = "";

    await this.writeCsv(this.inventoryPath, header, rows);

    this.reservations.delete(itemName);
  }

  /**
   * Notify users with expired reservations. For now this is a stub that logs the message and returns the list
   * of kerbs that were notified. It does not remove reservations (that is handled by checkinItem).
   */
  async notifyCheckout(): Promise<string[]> {
    const now = new Date();
    const notified: string[] = [];
    for (const [itemName, rec] of Array.from(this.reservations.entries())) {
      if (rec.expiry <= now) {
        // best-effort: find user and send a notification
        await this.sendEmail(
          rec.kerb,
          `Overdue item: ${itemName}`,
          `Please return ${itemName} which was due ${
            rec.expiry.toISOString().slice(0, 10)
          }.`,
        );
        notified.push(rec.kerb);
      }
    }
    return notified;
  }

  /* ======= CSV + user helpers (self-contained) ======= */
  private async readCsv(
    p: string,
  ): Promise<{ header: string[]; rows: string[][] }> {
    const raw = await fs.readFile(p, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { header: [], rows: [] };
    const header = lines[0].split(",").map((h) => h.trim());
    const rows: string[][] = [];
    for (let i = 1; i < lines.length; i++) {
      rows.push(this.parseCsvLine(lines[i]));
    }
    return { header, rows };
  }

  private async writeCsv(
    p: string,
    header: string[],
    rows: string[][],
  ): Promise<void> {
    const lines: string[] = [header.join(",")];
    for (const r of rows) {
      lines.push(r.map((c) => this.escapeCsv(c ?? "")).join(","));
    }
    await fs.writeFile(p, lines.join("\n"), "utf8");
  }

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

  private colIndex(header: string[], name: string): number {
    return header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  }

  private async findUser(
    kerb: string,
  ): Promise<
    { kerb: string; first?: string; last?: string; role?: string } | null
  > {
    const raw = await fs.readFile(this.usersPath, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return null;
    const header = lines[0].split(",").map((h) => h.trim());
    const rows = lines.slice(1).map((l) => this.parseCsvLine(l));
    const idxKerb = this.colIndex(header, "kerb");
    const idxFirst = this.colIndex(header, "first");
    const idxLast = this.colIndex(header, "last");
    const idxRole = this.colIndex(header, "role");
    if (idxKerb < 0) return null;
    const row = rows.find((r) =>
      (r[idxKerb] || "").toLowerCase() === kerb.toLowerCase()
    );
    if (!row) return null;
    return {
      kerb: row[idxKerb] || "",
      first: row[idxFirst] || "",
      last: row[idxLast] || "",
      role: row[idxRole] || "",
    };
  }

  private async sendEmail(
    kerb: string,
    subject: string,
    body: string,
  ): Promise<void> {
    // stubbed email sender; in real deployments replace with actual email transport
    console.log(`Reservation: sending email to ${kerb} — ${subject}\n${body}`);
  }
}

```
