import { z } from "zod";
import { AppError } from "../errors/app-error.js";
import type { AddCartItemsInput, CartAdapter, CartSnapshot } from "./contracts.js";

const cartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
  currency: z.string().min(1)
});

const cartSnapshotSchema = z.object({
  cartId: z.string().min(1),
  cartUrl: z.string().url(),
  items: z.array(cartItemSchema),
  subtotal: z.number().nonnegative(),
  currency: z.string().min(1),
  updatedAt: z.string().datetime()
});

export interface LiveCartAdapterOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

/** The sole live HTTP mutation boundary for cart changes. */
export class LiveCartAdapter implements CartAdapter {
  private readonly baseUrl: URL;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: LiveCartAdapterOptions) {
    this.baseUrl = new URL(options.baseUrl);
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async addItems(input: AddCartItemsInput): Promise<CartSnapshot> {
    const snapshot = await this.request("cart/items", {
      method: "POST",
      body: input,
      idempotencyKey: input.idempotencyKey
    });
    if (snapshot === null) {
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        "EKT cart API did not return a cart snapshot.",
        503
      );
    }
    return snapshot;
  }

  public async getCart(input: {
    readonly sessionId: string;
    readonly userId?: string;
  }): Promise<CartSnapshot | null> {
    const query = new URLSearchParams({ sessionId: input.sessionId });
    if (input.userId !== undefined) query.set("userId", input.userId);
    return this.request(`cart?${query.toString()}`, { method: "GET" }, true);
  }

  private async request(
    path: string,
    request: {
      readonly method: "GET" | "POST";
      readonly body?: unknown;
      readonly idempotencyKey?: string;
    },
    allowNotFound = false
  ): Promise<CartSnapshot | null> {
    let response: Response;
    try {
      response = await this.fetchImpl(new URL(path, this.baseUrl), {
        method: request.method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(request.idempotencyKey === undefined
            ? {}
            : { "Idempotency-Key": request.idempotencyKey })
        },
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch {
      throw new AppError("UPSTREAM_UNAVAILABLE", "EKT cart API is unavailable.", 503);
    }
    if (response.status === 404 && allowNotFound) {
      return null;
    }
    if (!response.ok) {
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        `EKT cart API returned HTTP ${response.status}.`,
        503
      );
    }
    try {
      return cartSnapshotSchema.parse(await response.json());
    } catch {
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        "EKT cart API response failed contract validation.",
        503
      );
    }
  }
}
