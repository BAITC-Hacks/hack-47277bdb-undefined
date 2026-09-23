import { describe, expect, it } from "vitest";

import {
  CartService,
  MockCartAdapter,
  type CartCatalogPort,
  type CartCatalogPriceRequest,
  type CartCatalogPriceResult,
  type CartCatalogStockRequest,
  type CartCatalogStockResult
} from "../../src/cart/index.js";
import { InMemorySessionStore, SessionService } from "../../src/sessions/index.js";

class MutableCatalog implements CartCatalogPort {
  public unitPrice = 16_090;
  public availableQuantity = 10;
  public readonly currency = "KZT";
  private readonly now: () => Date;

  public constructor(now: () => Date) {
    this.now = now;
  }

  public async getPrice(input: CartCatalogPriceRequest): Promise<CartCatalogPriceResult | null> {
    return {
      productId: input.productId,
      unitPrice: this.unitPrice,
      totalPrice: this.unitPrice * input.quantity,
      currency: this.currency,
      updatedAt: this.now().toISOString()
    };
  }

  public async getStock(input: CartCatalogStockRequest): Promise<CartCatalogStockResult | null> {
    return {
      productId: input.productId,
      availableQuantity: this.availableQuantity,
      canFulfillRequestedQuantity: this.availableQuantity >= input.requestedQuantity,
      status: this.availableQuantity > 0 ? "in_stock" : "out_of_stock",
      updatedAt: this.now().toISOString()
    };
  }
}

function createFixture(options: { readonly userId?: string; readonly ttlMs?: number } = {}) {
  let time = new Date("2026-09-23T09:00:00.000Z");
  const now = (): Date => new Date(time);
  const sessionStore = new InMemorySessionStore(now);
  const sessions = new SessionService({
    store: sessionStore,
    now,
    idGenerator: () => "7bcf4ace-2de1-4d8a-a486-2b9a583bd6fb"
  });
  const catalog = new MutableCatalog(now);
  const cart = new MockCartAdapter({ now, cartIdGenerator: () => "cart-test" });
  const service = new CartService({
    sessions,
    catalog,
    cart,
    now,
    proposalTtlMs: options.ttlMs,
    proposalIdGenerator: () => "96d9b3bd-7284-4d1c-a30e-a260183b1c67",
    confirmationTokenGenerator: () => "safe-confirmation-token-for-tests-0123456789"
  });

  return {
    sessions,
    catalog,
    cart,
    service,
    advance(milliseconds: number): void {
      time = new Date(time.getTime() + milliseconds);
    }
  };
}

describe("CartService", () => {
  it("does not mutate a cart in the prepare phase", async () => {
    const fixture = createFixture();
    const session = await fixture.sessions.create({ city: "Almaty" });

    const proposal = await fixture.service.prepare({
      sessionId: session.sessionId,
      productId: "breaker-3p-50a",
      quantity: 3
    });

    expect(proposal.subtotal).toBe(48_270);
    expect(fixture.cart.getMutationCount()).toBe(0);

    const confirmation = await fixture.service.confirm({
      sessionId: session.sessionId,
      proposalId: proposal.proposalId,
      confirmationToken: proposal.confirmationToken,
      idempotencyKey: "add-breaker-3"
    });

    expect(confirmation.cartUrl).toContain("cartId=cart-test");
    expect(fixture.cart.getMutationCount()).toBe(1);
  });

  it("requires the opaque confirmation token", async () => {
    const fixture = createFixture();
    const session = await fixture.sessions.create({ city: "Almaty" });
    const proposal = await fixture.service.prepare({
      sessionId: session.sessionId,
      productId: "breaker-3p-50a",
      quantity: 1
    });

    await expect(
      fixture.service.confirm({
        sessionId: session.sessionId,
        proposalId: proposal.proposalId,
        confirmationToken: "wrong-confirmation-token-0123456789",
        idempotencyKey: "wrong-token"
      })
    ).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });

    expect(fixture.cart.getMutationCount()).toBe(0);
  });

  it("makes duplicate confirmation requests idempotent", async () => {
    const fixture = createFixture();
    const session = await fixture.sessions.create({ city: "Almaty" });
    const proposal = await fixture.service.prepare({
      sessionId: session.sessionId,
      productId: "breaker-3p-50a",
      quantity: 2
    });
    const request = {
      sessionId: session.sessionId,
      proposalId: proposal.proposalId,
      confirmationToken: proposal.confirmationToken,
      idempotencyKey: "retry-safe-key"
    };

    const [first, second] = await Promise.all([
      fixture.service.confirm(request),
      fixture.service.confirm(request)
    ]);

    expect(first).toEqual(second);
    expect(fixture.cart.getMutationCount()).toBe(1);
  });

  it("invalidates a proposal if price changes before confirmation", async () => {
    const fixture = createFixture();
    const session = await fixture.sessions.create({ city: "Almaty" });
    const proposal = await fixture.service.prepare({
      sessionId: session.sessionId,
      productId: "breaker-3p-50a",
      quantity: 2
    });
    fixture.catalog.unitPrice = 17_000;

    await expect(
      fixture.service.confirm({
        sessionId: session.sessionId,
        proposalId: proposal.proposalId,
        confirmationToken: proposal.confirmationToken,
        idempotencyKey: "new-price"
      })
    ).rejects.toMatchObject({ code: "PROPOSAL_CHANGED" });

    expect(fixture.cart.getMutationCount()).toBe(0);
  });

  it("rejects expired proposals without mutation", async () => {
    const fixture = createFixture({ ttlMs: 1_000 });
    const session = await fixture.sessions.create({ city: "Almaty" });
    const proposal = await fixture.service.prepare({
      sessionId: session.sessionId,
      productId: "breaker-3p-50a",
      quantity: 1
    });
    fixture.advance(1_000);

    await expect(
      fixture.service.confirm({
        sessionId: session.sessionId,
        proposalId: proposal.proposalId,
        confirmationToken: proposal.confirmationToken,
        idempotencyKey: "expired"
      })
    ).rejects.toMatchObject({ code: "PROPOSAL_EXPIRED" });

    expect(fixture.cart.getMutationCount()).toBe(0);
  });

  it("binds a proposal to its authenticated session owner", async () => {
    const fixture = createFixture();
    const session = await fixture.sessions.create({
      city: "Almaty",
      userId: "customer-a"
    });
    const proposal = await fixture.service.prepare({
      sessionId: session.sessionId,
      actorUserId: "customer-a",
      productId: "breaker-3p-50a",
      quantity: 1
    });

    await expect(
      fixture.service.confirm({
        sessionId: session.sessionId,
        actorUserId: "customer-b",
        proposalId: proposal.proposalId,
        confirmationToken: proposal.confirmationToken,
        idempotencyKey: "wrong-owner"
      })
    ).rejects.toMatchObject({ code: "PROPOSAL_OWNERSHIP_MISMATCH" });

    expect(fixture.cart.getMutationCount()).toBe(0);
  });
});
