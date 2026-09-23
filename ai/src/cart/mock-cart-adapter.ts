import { randomUUID } from "node:crypto";

import { AppError } from "../errors/app-error.js";
import type { AddCartItemsInput, CartAdapter, CartItem, CartSnapshot } from "./contracts.js";

interface StoredCart {
  readonly cartId: string;
  readonly ownerKey: string;
  readonly items: readonly CartItem[];
  readonly currency: string;
  readonly updatedAt: string;
}

interface IdempotencyRecord {
  readonly fingerprint: string;
  readonly result: CartSnapshot;
}

export interface MockCartAdapterOptions {
  readonly siteUrl?: string;
  readonly now?: () => Date;
  readonly cartIdGenerator?: () => string;
}

function ownerKey(sessionId: string, userId: string | undefined): string {
  return `${sessionId}\u0000${userId ?? "anonymous"}`;
}

function copyCartItem(item: CartItem): CartItem {
  return {
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    currency: item.currency
  };
}

function cartUrl(siteUrl: URL, cartId: string): string {
  const url = new URL("/cart", siteUrl);
  url.searchParams.set("cartId", cartId);
  return url.toString();
}

function copySnapshot(cart: StoredCart, siteUrl: URL): CartSnapshot {
  return {
    cartId: cart.cartId,
    cartUrl: cartUrl(siteUrl, cart.cartId),
    items: cart.items.map(copyCartItem),
    subtotal: cart.items.reduce((total, item) => total + item.lineTotal, 0),
    currency: cart.currency,
    updatedAt: cart.updatedAt
  };
}

function mutationFingerprint(input: AddCartItemsInput): string {
  const lines = [...input.items]
    .sort((left, right) => left.productId.localeCompare(right.productId))
    .map((line) => [line.productId, line.quantity, line.unitPrice, line.lineTotal, line.currency]);
  return JSON.stringify([input.proposalId, lines]);
}

function validateMutation(input: AddCartItemsInput): void {
  if (input.items.length === 0) {
    throw new AppError("VALIDATION_ERROR", "At least one cart item is required.", 400);
  }

  const currencies = new Set(input.items.map((item) => item.currency));
  if (currencies.size !== 1) {
    throw new AppError("PRICE_UNAVAILABLE", "A cart cannot contain mixed quote currencies.", 409);
  }

  for (const item of input.items) {
    if (
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0 ||
      !Number.isFinite(item.unitPrice) ||
      item.unitPrice < 0 ||
      !Number.isFinite(item.lineTotal) ||
      item.lineTotal < 0
    ) {
      throw new AppError("VALIDATION_ERROR", "Cart mutation contains an invalid line.", 400);
    }
  }
}

/**
 * In-memory EKT Cart API substitute. It provides a real mutation boundary and
 * idempotency behavior, rather than pretending a cart was updated in chat.
 */
export class MockCartAdapter implements CartAdapter {
  private readonly cartsByOwner = new Map<string, StoredCart>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly siteUrl: URL;
  private readonly now: () => Date;
  private readonly cartIdGenerator: () => string;
  private mutations = 0;

  public constructor(options: MockCartAdapterOptions = {}) {
    this.siteUrl = new URL(options.siteUrl ?? "https://ekt.kz");
    this.now = options.now ?? (() => new Date());
    this.cartIdGenerator = options.cartIdGenerator ?? randomUUID;
  }

  public async addItems(input: AddCartItemsInput): Promise<CartSnapshot> {
    validateMutation(input);
    const key = ownerKey(input.sessionId, input.userId);
    const idempotencyKey = `${key}\u0000${input.idempotencyKey}`;
    const fingerprint = mutationFingerprint(input);
    const existingRequest = this.idempotency.get(idempotencyKey);

    if (existingRequest !== undefined) {
      if (existingRequest.fingerprint !== fingerprint) {
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          "This idempotency key was already used for a different cart mutation.",
          409
        );
      }

      return this.copySnapshot(existingRequest.result);
    }

    const existingCart = this.cartsByOwner.get(key);
    const currency = input.items[0]?.currency;
    if (currency === undefined) {
      throw new AppError("VALIDATION_ERROR", "At least one cart item is required.", 400);
    }
    if (existingCart !== undefined && existingCart.currency !== currency) {
      throw new AppError("PRICE_UNAVAILABLE", "Cart currency does not match the price quote.", 409);
    }

    const merged = new Map<string, CartItem>();
    for (const item of existingCart?.items ?? []) {
      merged.set(item.productId, copyCartItem(item));
    }

    for (const item of input.items) {
      const previous = merged.get(item.productId);
      const quantity = (previous?.quantity ?? 0) + item.quantity;
      if (!Number.isSafeInteger(quantity)) {
        throw new AppError("VALIDATION_ERROR", "Cart item quantity is too large.", 400);
      }

      // A new cart API mutation establishes the currently revalidated price.
      merged.set(item.productId, {
        productId: item.productId,
        quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.unitPrice * quantity,
        currency: item.currency
      });
    }

    const cart: StoredCart = {
      cartId: existingCart?.cartId ?? this.cartIdGenerator(),
      ownerKey: key,
      items: [...merged.values()].sort((left, right) =>
        left.productId.localeCompare(right.productId)
      ),
      currency,
      updatedAt: this.now().toISOString()
    };
    this.cartsByOwner.set(key, cart);
    this.mutations += 1;

    const snapshot = copySnapshot(cart, this.siteUrl);
    this.idempotency.set(idempotencyKey, {
      fingerprint,
      result: this.copySnapshot(snapshot)
    });
    return snapshot;
  }

  public async getCart(input: {
    readonly sessionId: string;
    readonly userId?: string;
  }): Promise<CartSnapshot | null> {
    const cart = this.cartsByOwner.get(ownerKey(input.sessionId, input.userId));
    return cart === undefined ? null : copySnapshot(cart, this.siteUrl);
  }

  /** Useful for deterministic safety assertions in unit tests. */
  public getMutationCount(): number {
    return this.mutations;
  }

  private copySnapshot(snapshot: CartSnapshot): CartSnapshot {
    return {
      cartId: snapshot.cartId,
      cartUrl: snapshot.cartUrl,
      items: snapshot.items.map(copyCartItem),
      subtotal: snapshot.subtotal,
      currency: snapshot.currency,
      updatedAt: snapshot.updatedAt
    };
  }
}
