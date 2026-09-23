import { randomUUID } from "node:crypto";
import type { PostgresQueryExecutor } from "../database/postgres.js";

export interface HandoffInput {
  readonly sessionId: string;
  readonly customerQuestion: string;
  readonly city?: string;
  readonly productReferences: readonly string[];
  readonly requestedQuantity?: number;
  readonly checkedInformation: readonly string[];
  readonly unresolvedIssue: string;
}

export interface ManagerHandoff extends HandoffInput {
  readonly id: string;
  readonly createdAt: string;
  readonly status: "open" | "assigned" | "resolved";
}

export interface HandoffService {
  create(input: HandoffInput): Promise<ManagerHandoff>;
}

export class InMemoryHandoffService implements HandoffService {
  private readonly handoffs: ManagerHandoff[] = [];

  public async create(input: HandoffInput): Promise<ManagerHandoff> {
    const handoff: ManagerHandoff = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: "open"
    };
    this.handoffs.push(handoff);
    return handoff;
  }
}

/**
 * Production handoff sink. It intentionally has no in-memory fallback: a
 * configured PostgreSQL deployment must provide the `manager_handoffs` table
 * so a customer request cannot be silently lost.
 */
export class PostgresHandoffService implements HandoffService {
  public constructor(private readonly database: PostgresQueryExecutor) {}

  public async create(input: HandoffInput): Promise<ManagerHandoff> {
    const handoff: ManagerHandoff = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: "open"
    };

    await this.database.query(
      `INSERT INTO manager_handoffs (
        id,
        session_id,
        customer_question,
        city,
        product_references,
        requested_quantity,
        checked_information,
        unresolved_issue,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9, $10)`,
      [
        handoff.id,
        handoff.sessionId,
        handoff.customerQuestion,
        handoff.city ?? null,
        JSON.stringify(handoff.productReferences),
        handoff.requestedQuantity ?? null,
        JSON.stringify(handoff.checkedInformation),
        handoff.unresolvedIssue,
        handoff.status,
        handoff.createdAt
      ]
    );

    return handoff;
  }
}
