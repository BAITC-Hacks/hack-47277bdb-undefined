import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { AppError, isAppError } from "../errors/app-error.js";
import type {
  AddCartItemsInput,
  CartAdapter,
  CartCatalogPort,
  CartCatalogPriceResult,
  CartCatalogStockResult,
  CartConfirmation,
  CartItem,
  CartLocation,
  CartMutationItem,
  CartProposal,
  CartProposalLine,
  CartSnapshot,
  CartStockSnapshot,
  ConfirmCartProposalInput,
  PrepareCartProposalInput,
  PreparedCartProposal
} from "./contracts.js";
import {
  confirmationTokenSchema,
  confirmCartProposalInputSchema,
  prepareCartProposalInputSchema
} from "./contracts.js";
import {
  copyCartConfirmation,
  copyCartProposal,
  InMemoryCartProposalStore,
  type CartProposalStore,
  type ProposalInvalidationReason,
  type StoredCartProposal
} from "./proposal-store.js";
import type { CartSession, CartSessionPort } from "./session-port.js";

export const DEFAULT_CART_PROPOSAL_TTL_MS = 15 * 60 * 1_000;

export interface CartServiceOptions {
  readonly sessions: CartSessionPort;
  readonly catalog: CartCatalogPort;
  readonly cart: CartAdapter;
  readonly proposalStore?: CartProposalStore;
  readonly proposalTtlMs?: number;
  readonly now?: () => Date;
  readonly proposalIdGenerator?: () => string;
  readonly confirmationTokenGenerator?: () => string;
}

interface NormalizedPrepareInput {
  readonly sessionId: string;
  readonly actorUserId?: string;
  readonly items: readonly { readonly productId: string; readonly quantity: number }[];
}

interface NormalizedConfirmInput {
  readonly sessionId: string;
  readonly actorUserId?: string;
  readonly proposalId: string;
  readonly confirmationToken: string;
  readonly idempotencyKey: string;
}

interface PricedAndStockedLine {
  readonly item: CartProposalLine;
  readonly stock: CartStockSnapshot;
}

function addOptional<T>(key: string, value: T | undefined): Readonly<Record<string, T>> {
  return value === undefined ? {} : { [key]: value };
}

function copyPreparedProposal(
  proposal: CartProposal,
  confirmationToken: string
): PreparedCartProposal {
  return {
    ...copyCartProposal(proposal),
    confirmationToken
  };
}

function hashConfirmationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function confirmationTokenMatches(expectedHash: string, suppliedToken: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const supplied = Buffer.from(hashConfirmationToken(suppliedToken), "hex");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function sameOptionalValue(left: string | undefined, right: string | undefined): boolean {
  return left === right;
}

function safeDate(value: string): number | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function isValidMoney(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function buildAdapterIdempotencyKey(proposalId: string, idempotencyKey: string): string {
  // Scope a client retry key to its proposal before passing it to the cart API.
  return `cart-${createHash("sha256")
    .update(`${proposalId}\u0000${idempotencyKey}`)
    .digest("hex")}`;
}

function normalizePrepareInput(input: PrepareCartProposalInput): NormalizedPrepareInput {
  const parsed = prepareCartProposalInputSchema.parse(input);
  const actor = parsed.actorUserId;
  const rawItems = "items" in parsed ? parsed.items : [parsed];
  const quantities = new Map<string, number>();

  for (const rawItem of rawItems) {
    const previous = quantities.get(rawItem.productId) ?? 0;
    const combined = previous + rawItem.quantity;
    if (!Number.isSafeInteger(combined) || combined > 100_000) {
      throw new AppError("VALIDATION_ERROR", "Requested quantity is too large.", 400);
    }
    quantities.set(rawItem.productId, combined);
  }

  const items = [...quantities.entries()].map(([productId, quantity]) => ({
    productId,
    quantity
  }));

  return {
    sessionId: parsed.sessionId,
    items,
    ...addOptional("actorUserId", actor)
  };
}

function normalizeConfirmInput(input: ConfirmCartProposalInput): NormalizedConfirmInput {
  const parsed = confirmCartProposalInputSchema.parse(input);
  return {
    sessionId: parsed.sessionId,
    proposalId: parsed.proposalId,
    confirmationToken: parsed.confirmationToken,
    idempotencyKey: parsed.idempotencyKey,
    ...addOptional("actorUserId", parsed.actorUserId)
  };
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

/**
 * CartService enforces the irreversible-action boundary:
 *
 * prepare -> fresh quotes + opaque confirmation token -> explicit confirm ->
 * fresh quotes again -> adapter mutation.
 */
export class CartService {
  private readonly sessions: CartSessionPort;
  private readonly catalog: CartCatalogPort;
  private readonly cart: CartAdapter;
  private readonly proposalStore: CartProposalStore;
  private readonly proposalTtlMs: number;
  private readonly now: () => Date;
  private readonly proposalIdGenerator: () => string;
  private readonly confirmationTokenGenerator: () => string;
  private readonly inFlightConfirmations = new Map<string, Promise<CartConfirmation>>();

  public constructor(options: CartServiceOptions) {
    this.sessions = options.sessions;
    this.catalog = options.catalog;
    this.cart = options.cart;
    this.proposalStore = options.proposalStore ?? new InMemoryCartProposalStore();
    this.proposalTtlMs = options.proposalTtlMs ?? DEFAULT_CART_PROPOSAL_TTL_MS;
    this.now = options.now ?? (() => new Date());
    this.proposalIdGenerator = options.proposalIdGenerator ?? randomUUID;
    this.confirmationTokenGenerator =
      options.confirmationTokenGenerator ?? (() => randomBytes(32).toString("base64url"));

    if (
      !Number.isSafeInteger(this.proposalTtlMs) ||
      this.proposalTtlMs <= 0 ||
      this.proposalTtlMs > 24 * 60 * 60 * 1_000
    ) {
      throw new RangeError("Cart proposal TTL must be between 1 ms and 24 hours.");
    }
  }

  /** Phase 1: obtain live price/stock snapshots, without mutating a cart. */
  public async prepare(input: PrepareCartProposalInput): Promise<PreparedCartProposal> {
    const request = normalizePrepareInput(input);
    const session = await this.requireOwnedSession(request.sessionId, request.actorUserId);
    const city = this.requireCity(session);
    const quoted = await this.quoteLines(session, request.items);
    const now = this.now();
    const proposalId = this.proposalIdGenerator();
    const confirmationToken = this.confirmationTokenGenerator();

    // Keep malformed injectable generators from weakening the confirmation gate.
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(proposalId)
    ) {
      throw new AppError("INTERNAL_ERROR", "Proposal ID generator returned an invalid ID.", 500);
    }
    confirmationTokenSchema.parse(confirmationToken);

    const subtotal = quoted.reduce((total, line) => total + line.item.lineTotal, 0);
    if (!isValidMoney(subtotal)) {
      throw new AppError("UPSTREAM_UNAVAILABLE", "Catalog returned an invalid price total.", 502);
    }

    const proposal: CartProposal = {
      proposalId,
      sessionId: session.sessionId,
      city,
      customerType: session.customerType,
      currency: session.currency,
      items: quoted.map(({ item }) => item),
      subtotal,
      stockSnapshot: quoted.map(({ stock }) => stock),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.proposalTtlMs).toISOString(),
      ...addOptional("warehouseId", session.warehouseId)
    };

    const stored: StoredCartProposal = {
      proposal,
      confirmationTokenHash: hashConfirmationToken(confirmationToken),
      status: "pending",
      ...addOptional("ownerUserId", session.userId)
    };
    await this.proposalStore.create(stored);

    return copyPreparedProposal(proposal, confirmationToken);
  }

  /**
   * Phase 2: only a token plus an explicit confirmation endpoint can reach the
   * adapter. Reusing the same idempotency key returns the original result.
   */
  public async confirm(input: ConfirmCartProposalInput): Promise<CartConfirmation> {
    const request = normalizeConfirmInput(input);
    const session = await this.requireOwnedSession(request.sessionId, request.actorUserId);
    const now = this.now();
    const record = await this.proposalStore.get(request.proposalId, now);

    if (record === undefined) {
      throw new AppError("PROPOSAL_NOT_FOUND", "Cart proposal was not found.", 404);
    }
    this.assertProposalOwnership(record, session, request.actorUserId);
    this.assertConfirmationToken(record, request.confirmationToken);

    const claim = await this.proposalStore.claimConfirmation(
      request.proposalId,
      request.idempotencyKey,
      now
    );
    if (claim === undefined) {
      throw new AppError("PROPOSAL_NOT_FOUND", "Cart proposal was not found.", 404);
    }

    if (claim.kind === "expired") {
      throw new AppError("PROPOSAL_EXPIRED", "Cart proposal has expired. Prepare a new one.", 409);
    }
    if (claim.kind === "invalidated") {
      throw new AppError(
        "PROPOSAL_CHANGED",
        "Cart proposal is no longer valid. Prepare a new one.",
        409
      );
    }

    if (claim.kind === "already_confirmed") {
      return this.returnConfirmedForIdempotency(claim.record, request.idempotencyKey);
    }

    const operationKey = `${request.proposalId}\u0000${request.idempotencyKey}`;
    if (claim.kind === "already_confirming") {
      if (claim.record.confirmationIdempotencyKey !== request.idempotencyKey) {
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          "This cart proposal is already being confirmed by another request.",
          409
        );
      }

      const inFlight = this.inFlightConfirmations.get(operationKey);
      if (inFlight !== undefined) {
        return inFlight;
      }

      // A durable store can retain this state across a process restart. Do not
      // issue another mutation until its adapter-side idempotency key is reconciled.
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        "Cart confirmation is still being reconciled. Retry with the same idempotency key.",
        503
      );
    }

    const operation = this.executeConfirmation(claim.record, session, request.idempotencyKey);
    this.inFlightConfirmations.set(operationKey, operation);

    try {
      return await operation;
    } finally {
      this.inFlightConfirmations.delete(operationKey);
    }
  }

  /** Returns proposal data without ever reissuing the confirmation capability. */
  public async getProposal(
    sessionId: string,
    proposalId: string,
    actorUserId?: string
  ): Promise<CartProposal> {
    const session = await this.requireOwnedSession(sessionId, actorUserId);
    const record = await this.proposalStore.get(proposalId, this.now());
    if (record === undefined) {
      throw new AppError("PROPOSAL_NOT_FOUND", "Cart proposal was not found.", 404);
    }
    this.assertProposalOwnership(record, session, actorUserId);

    if (record.status === "expired") {
      throw new AppError("PROPOSAL_EXPIRED", "Cart proposal has expired.", 409);
    }
    if (record.status === "invalidated") {
      throw new AppError("PROPOSAL_CHANGED", "Cart proposal is no longer valid.", 409);
    }

    return copyCartProposal(record.proposal);
  }

  /** Reads the cart only after resolving the session's authenticated owner. */
  public async getCart(sessionId: string, actorUserId?: string): Promise<CartSnapshot | null> {
    const session = await this.requireOwnedSession(sessionId, actorUserId);
    const snapshot = await this.cart.getCart({
      sessionId: session.sessionId,
      ...addOptional("userId", session.userId)
    });

    if (snapshot === null) {
      return null;
    }

    return {
      cartId: snapshot.cartId,
      cartUrl: snapshot.cartUrl,
      items: snapshot.items.map(copyCartItem),
      subtotal: snapshot.subtotal,
      currency: snapshot.currency,
      updatedAt: snapshot.updatedAt
    };
  }

  private async executeConfirmation(
    record: StoredCartProposal,
    session: CartSession,
    idempotencyKey: string
  ): Promise<CartConfirmation> {
    try {
      const freshLines = await this.revalidateProposal(record.proposal, session);
      const mutationItems: readonly CartMutationItem[] = freshLines.map(({ item }) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        currency: item.currency
      }));
      const mutation: AddCartItemsInput = {
        sessionId: session.sessionId,
        proposalId: record.proposal.proposalId,
        idempotencyKey: buildAdapterIdempotencyKey(record.proposal.proposalId, idempotencyKey),
        items: mutationItems,
        ...addOptional("userId", session.userId)
      };
      const cartSnapshot = await this.cart.addItems(mutation);
      this.assertCartMutationResult(cartSnapshot, mutationItems, record.proposal.currency);

      const confirmation: CartConfirmation = {
        proposalId: record.proposal.proposalId,
        cartId: cartSnapshot.cartId,
        cartUrl: cartSnapshot.cartUrl,
        items: cartSnapshot.items.map(copyCartItem),
        subtotal: cartSnapshot.subtotal,
        currency: cartSnapshot.currency,
        confirmedAt: this.now().toISOString()
      };
      await this.proposalStore.markConfirmed(
        record.proposal.proposalId,
        idempotencyKey,
        confirmation
      );
      return copyCartConfirmation(confirmation);
    } catch (error: unknown) {
      if (isAppError(error) && this.isRevalidationFailure(error)) {
        await this.proposalStore.markInvalidated(
          record.proposal.proposalId,
          this.invalidationReason(error)
        );
      }
      throw error;
    }
  }

  private async revalidateProposal(
    proposal: CartProposal,
    session: CartSession
  ): Promise<readonly PricedAndStockedLine[]> {
    const city = this.requireCity(session);
    if (
      proposal.city !== city ||
      !sameOptionalValue(proposal.warehouseId, session.warehouseId) ||
      proposal.customerType !== session.customerType ||
      proposal.currency !== session.currency
    ) {
      throw new AppError(
        "PROPOSAL_CHANGED",
        "Your location or customer context changed. Prepare a new cart proposal.",
        409
      );
    }

    const requests = proposal.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity
    }));
    const fresh = await this.quoteLines(session, requests);

    for (let index = 0; index < proposal.items.length; index += 1) {
      const original = proposal.items[index];
      const current = fresh[index]?.item;
      if (original === undefined || current === undefined) {
        throw new AppError("UPSTREAM_UNAVAILABLE", "Catalog revalidation was incomplete.", 502);
      }
      if (
        original.productId !== current.productId ||
        original.quantity !== current.quantity ||
        original.unitPrice !== current.unitPrice ||
        original.lineTotal !== current.lineTotal ||
        original.currency !== current.currency
      ) {
        throw new AppError(
          "PROPOSAL_CHANGED",
          "Price changed after the proposal was prepared. Prepare a new proposal to confirm it.",
          409
        );
      }
    }

    return fresh;
  }

  private async quoteLines(
    session: CartSession,
    items: readonly { readonly productId: string; readonly quantity: number }[]
  ): Promise<readonly PricedAndStockedLine[]> {
    const city = this.requireCity(session);
    const location: CartLocation = {
      city,
      ...addOptional("warehouseId", session.warehouseId)
    };

    return Promise.all(
      items.map(async (item) => {
        let price: CartCatalogPriceResult | null;
        let stock: CartCatalogStockResult | null;

        try {
          [price, stock] = await Promise.all([
            this.catalog.getPrice({
              productId: item.productId,
              quantity: item.quantity,
              customerType: session.customerType,
              ...location
            }),
            this.catalog.getStock({
              productId: item.productId,
              requestedQuantity: item.quantity,
              ...location
            })
          ]);
        } catch (error: unknown) {
          if (isAppError(error)) {
            throw error;
          }
          throw new AppError(
            "UPSTREAM_UNAVAILABLE",
            "Live price or stock could not be checked.",
            503
          );
        }

        return this.toQuotedLine(session, item.productId, item.quantity, price, stock);
      })
    );
  }

  private toQuotedLine(
    session: CartSession,
    productId: string,
    quantity: number,
    price: CartCatalogPriceResult | null,
    stock: CartCatalogStockResult | null
  ): PricedAndStockedLine {
    if (price === null) {
      throw new AppError("PRICE_UNAVAILABLE", "Current product price is unavailable.", 409, {
        productId
      });
    }
    if (stock === null) {
      throw new AppError("STOCK_UNAVAILABLE", "Current product stock is unavailable.", 409, {
        productId
      });
    }
    if (
      price.productId !== productId ||
      !isValidMoney(price.unitPrice) ||
      !isValidMoney(price.totalPrice) ||
      safeDate(price.updatedAt) === undefined
    ) {
      throw new AppError("UPSTREAM_UNAVAILABLE", "Catalog returned an invalid price quote.", 502);
    }
    if (price.currency !== session.currency) {
      throw new AppError(
        "PRICE_UNAVAILABLE",
        "Catalog price currency does not match the selected session currency.",
        409
      );
    }
    const validUntilTimestamp =
      price.validUntil === undefined ? undefined : safeDate(price.validUntil);
    if (
      price.validUntil !== undefined &&
      (validUntilTimestamp === undefined || validUntilTimestamp <= this.now().getTime())
    ) {
      throw new AppError("PRICE_UNAVAILABLE", "Current product price quote has expired.", 409);
    }
    if (
      stock.productId !== productId ||
      !Number.isSafeInteger(stock.availableQuantity) ||
      stock.availableQuantity < 0 ||
      typeof stock.canFulfillRequestedQuantity !== "boolean" ||
      typeof stock.status !== "string" ||
      stock.status.length === 0 ||
      safeDate(stock.updatedAt) === undefined
    ) {
      throw new AppError("UPSTREAM_UNAVAILABLE", "Catalog returned an invalid stock result.", 502);
    }
    if (
      stock.orderable === false ||
      !stock.canFulfillRequestedQuantity ||
      stock.availableQuantity < quantity
    ) {
      throw new AppError(
        "STOCK_UNAVAILABLE",
        "The requested quantity is no longer available.",
        409,
        { productId, requestedQuantity: quantity, availableQuantity: stock.availableQuantity }
      );
    }

    return {
      item: {
        productId,
        quantity,
        unitPrice: price.unitPrice,
        lineTotal: price.totalPrice,
        currency: price.currency,
        priceCheckedAt: price.updatedAt,
        ...(price.validUntil === undefined ? {} : { priceValidUntil: price.validUntil })
      },
      stock: {
        productId,
        requestedQuantity: quantity,
        availableQuantity: stock.availableQuantity,
        status: stock.status,
        checkedAt: stock.updatedAt
      }
    };
  }

  private async requireOwnedSession(
    sessionId: string,
    actorUserId: string | undefined
  ): Promise<CartSession> {
    const session = await this.sessions.getSession(sessionId);
    if (session === undefined) {
      throw new AppError("NOT_FOUND", "Session was not found or has expired.", 404);
    }
    if (session.userId !== actorUserId) {
      throw new AppError(
        "PROPOSAL_OWNERSHIP_MISMATCH",
        "The session does not belong to this customer.",
        403
      );
    }
    return session;
  }

  private requireCity(session: CartSession): string {
    if (session.city === undefined) {
      throw new AppError(
        "CITY_REQUIRED",
        "Select a city before checking price, stock, or a cart proposal.",
        422
      );
    }
    return session.city;
  }

  private assertProposalOwnership(
    record: StoredCartProposal,
    session: CartSession,
    actorUserId: string | undefined
  ): void {
    if (
      record.proposal.sessionId !== session.sessionId ||
      record.ownerUserId !== session.userId ||
      record.ownerUserId !== actorUserId
    ) {
      throw new AppError(
        "PROPOSAL_OWNERSHIP_MISMATCH",
        "This cart proposal belongs to a different session or customer.",
        403
      );
    }
  }

  private assertConfirmationToken(record: StoredCartProposal, token: string): void {
    if (!confirmationTokenMatches(record.confirmationTokenHash, token)) {
      throw new AppError(
        "CONFIRMATION_REQUIRED",
        "A valid explicit cart confirmation token is required.",
        403
      );
    }
  }

  private returnConfirmedForIdempotency(
    record: StoredCartProposal,
    idempotencyKey: string
  ): CartConfirmation {
    if (record.confirmationIdempotencyKey !== idempotencyKey) {
      throw new AppError(
        "IDEMPOTENCY_CONFLICT",
        "This cart proposal was already confirmed with a different idempotency key.",
        409
      );
    }
    if (record.confirmation === undefined) {
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        "Cart confirmation is still being reconciled.",
        503
      );
    }
    return copyCartConfirmation(record.confirmation);
  }

  private assertCartMutationResult(
    snapshot: CartSnapshot,
    mutationItems: readonly CartMutationItem[],
    expectedCurrency: string
  ): void {
    if (
      snapshot.cartId.length === 0 ||
      snapshot.cartUrl.length === 0 ||
      snapshot.currency !== expectedCurrency ||
      !isValidMoney(snapshot.subtotal) ||
      safeDate(snapshot.updatedAt) === undefined
    ) {
      throw new AppError("UPSTREAM_UNAVAILABLE", "Cart API returned an invalid result.", 502);
    }

    for (const mutation of mutationItems) {
      const returned = snapshot.items.find((item) => item.productId === mutation.productId);
      if (
        returned === undefined ||
        returned.quantity < mutation.quantity ||
        returned.currency !== mutation.currency
      ) {
        throw new AppError(
          "UPSTREAM_UNAVAILABLE",
          "Cart API did not confirm every requested item.",
          502
        );
      }
    }
  }

  private isRevalidationFailure(error: AppError): boolean {
    return (
      error.code === "PROPOSAL_CHANGED" ||
      error.code === "PRICE_UNAVAILABLE" ||
      error.code === "STOCK_UNAVAILABLE"
    );
  }

  private invalidationReason(error: AppError): ProposalInvalidationReason {
    if (error.code === "STOCK_UNAVAILABLE") {
      return "stock_unavailable";
    }
    if (error.code === "PRICE_UNAVAILABLE") {
      return "price_unavailable";
    }
    return "price_changed";
  }
}
