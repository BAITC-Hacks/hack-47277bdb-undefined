import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/api/app.js";

interface ChatResponse {
  readonly data: {
    readonly session: { readonly sessionId: string; readonly language: string };
    readonly response: { readonly products?: readonly { readonly id: string }[] };
  };
}

interface ProposalResponse {
  readonly data: {
    readonly proposalId: string;
    readonly confirmationToken: string;
  };
}

interface CartResponse {
  readonly data: { readonly cartId: string; readonly cartUrl: string } | null;
}

describe("EKT API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("detects Russian and searches the catalog with a natural-language query", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "Нужен автомат 3P 50A", session: { city: "Алматы" } }
    });

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body) as ChatResponse;
    expect(payload.data.session.language).toBe("ru");
    expect(payload.data.response.products?.length).toBeGreaterThan(0);
  });

  it("does not mutate a cart until a proposal is explicitly confirmed", async () => {
    const chat = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { message: "Нужен автомат 3P 50A", session: { city: "Алматы" } }
    });
    const sessionId = (JSON.parse(chat.body) as ChatResponse).data.session.sessionId;

    const prepared = await app.inject({
      method: "POST",
      url: "/api/cart/proposal",
      payload: { sessionId, productId: "prd-mcb-019", quantity: 2 }
    });
    expect(prepared.statusCode).toBe(200);
    const proposal = (JSON.parse(prepared.body) as ProposalResponse).data;

    const beforeConfirmation = await app.inject({
      method: "GET",
      url: `/api/cart?sessionId=${sessionId}`
    });
    expect((JSON.parse(beforeConfirmation.body) as CartResponse).data).toBeNull();

    const idempotencyKey = randomUUID();
    const confirmed = await app.inject({
      method: "POST",
      url: "/api/cart/confirm",
      payload: {
        sessionId,
        proposalId: proposal.proposalId,
        confirmationToken: proposal.confirmationToken,
        idempotencyKey
      }
    });
    expect(confirmed.statusCode).toBe(200);

    const afterConfirmation = await app.inject({
      method: "GET",
      url: `/api/cart?sessionId=${sessionId}`
    });
    const cart = JSON.parse(afterConfirmation.body) as CartResponse;
    expect(cart.data?.cartId).toBeTruthy();
    expect(cart.data?.cartUrl).toContain("cart");
  });

  it("returns CITY_REQUIRED instead of guessing a regional catalog location", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/products/search?query=3P%2050A"
    });
    expect(response.statusCode).toBe(422);
    const payload = JSON.parse(response.body) as { readonly error: { readonly code: string } };
    expect(payload.error.code).toBe("CITY_REQUIRED");
  });
});
