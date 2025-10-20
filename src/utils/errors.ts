// src/utils/errors.ts

export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name; // Sets name to the class name (e.g., "ItemNotFoundError")
  }
}

export class ItemNotFoundError extends InventoryError {
  constructor(itemName: string) {
    super(`Item not found: ${itemName}`);
  }
}

export class ItemUnavailableError extends InventoryError {
  constructor(itemName: string, reason?: string) {
    super(`Item '${itemName}' is unavailable. ${reason || ""}`.trim());
  }
}

export class AlreadyCheckedOutError extends ItemUnavailableError {
  constructor(itemName: string) {
    super(
      itemName,
      "It is already checked out.",
    );
  }
}

export class InsufficientQuantityError extends ItemUnavailableError {
  constructor(itemName: string, requested: number, available: number) {
    super(
      itemName,
      `Requested ${requested}, but only ${available} available.`,
    );
  }
}

export class InvalidQuantityError extends InventoryError {
  constructor(quantity: number) {
    super(`Quantity must be a positive number, received ${quantity}.`);
  }
}

export class UserNotFoundError extends InventoryError {
  constructor(kerb: string) {
    super(`User not found: ${kerb}`);
  }
}
