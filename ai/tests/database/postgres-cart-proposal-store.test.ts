import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import type { PostgresQueryExecutor } from "../../src/database/postgres.js";
import { PostgresCartProposalStore, type StoredCartProposal } from "../../src/cart/index.js";

class ScriptedExecutor implements PostgresQueryExecutor {
  public readonly calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> =
    [];
  public readonly responses: QueryResultRow[][];

  public constructor(responses: QueryResultRow[][] = []) {
    this.responses = responses;
  }

  public async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<Row>> {
    this.calls.push({ text, ...(values === undefined ? {} : { values }) });
    const rows = this.responses.shift() ?? [];
    return { rows: rows as Row[] } as QueryResult<Row>;
  }
}

function record(): StoredCartProposal {
  return {
    proposal: {
      proposalId: "7bcf4ace-2de1-4d8a-a486-2b9a583bd6fb",
      sessionId: "96d9b3bd-7284-4d1c-a30e-a260183b1c67",
      city: "Almaty",
      customerType: "retail",
      currency: "KZT",
      items: [
        {
          productId: "prd-mcb-019",
          quantity: 2,
          unitPrice: 16_090,
          lineTotal: 32_180,
          currency: "KZT",
          priceCheckedAt: "2026-09-23T09:00:00.000Z"
        }
      ],
      subtotal: 32_180,
      stockSnapshot: [
        {
          productId: "prd-mcb-019",
          requestedQuantity: 2,
          availableQuantity: 10,
          status: "in_stock",
          checkedAt: "2026-09-23T09:00:00.000Z"
        }
      ],
      createdAt: "2026-09-23T09:00:00.000Z",
      expiresAt: "2026-09-23T09:15:00.000Z"
    },
    ownerUserId: "customer-1",
    confirmationTokenHash: "a".repeat(64),
    status: "pending"
  };
}

function rowFrom(source: StoredCartProposal, status: StoredCartProposal["status"]): QueryResultRow {
  return {
    id: source.proposal.proposalId,
    session_id: source.proposal.sessionId,
    owner_user_id: source.ownerUserId,
    city: source.proposal.city,
    warehouse_id: null,
    customer_type: source.proposal.customerType,
    currency: source.proposal.currency,
    items: source.proposal.items,
    stock_snapshot: source.proposal.stockSnapshot,
    subtotal: String(source.proposal.subtotal),
    confirmation_token_hash: source.confirmationTokenHash,
    status,
    confirmation_idempotency_key: status === "confirming" ? "retry-key" : null,
    confirmation: null,
    invalidation_reason: null,
    created_at: new Date(source.proposal.createdAt),
    expires_at: new Date(source.proposal.expiresAt)
  };
}

describe("PostgresCartProposalStore", () => {
  it("persists only hashed confirmation data and JSONB proposal snapshots", async () => {
    const database = new ScriptedExecutor();
    const store = new PostgresCartProposalStore(database);
    const source = record();

    await store.create(source);

    const call = database.calls[0];
    expect(call?.text).toContain("confirmation_token_hash");
    expect(call?.text).not.toMatch(/\bconfirmation_token\b/u);
    expect(JSON.parse(String(call?.values?.[7]))).toEqual(source.proposal.items);
    expect(JSON.parse(String(call?.values?.[8]))).toEqual(source.proposal.stockSnapshot);
    expect(call?.values?.[10]).toBe(source.confirmationTokenHash);
  });

  it("claims an unexpired proposal using atomic conditional updates", async () => {
    const source = record();
    const database = new ScriptedExecutor([[], [rowFrom(source, "confirming")]]);
    const store = new PostgresCartProposalStore(database);
    const now = new Date("2026-09-23T09:01:00.000Z");

    const result = await store.claimConfirmation(source.proposal.proposalId, "retry-key", now);

    expect(result?.kind).toBe("claimed");
    expect(database.calls).toHaveLength(2);
    expect(database.calls[0]?.text).toContain("status = 'pending' AND expires_at <= $2");
    expect(database.calls[1]?.text).toContain("status = 'pending' AND expires_at > $3");
    expect(database.calls[1]?.values?.[1]).toBe("retry-key");
  });
});
