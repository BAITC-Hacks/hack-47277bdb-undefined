import type { QueryResultRow } from "pg";

import type { PostgresQueryExecutor } from "../database/postgres.js";
import { AppError } from "../errors/app-error.js";
import type { CustomerType, Language } from "../types/domain.js";
import { copySession, type ConversationSession, type SessionStore } from "./session.js";

interface ChatSessionRow extends QueryResultRow {
  readonly id: string;
  readonly user_id: string | null;
  readonly language: Language;
  readonly city: string | null;
  readonly warehouse_id: string | null;
  readonly customer_type: CustomerType;
  readonly currency: string;
  readonly active_proposal_id: string | null;
  readonly recently_viewed_product_ids: readonly string[] | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly expires_at: Date | string;
}

function optionalProperty<T>(key: string, value: T | null): Readonly<Record<string, T>> {
  return value === null ? {} : { [key]: value };
}

function toIsoTimestamp(value: Date | string, columnName: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`PostgreSQL returned an invalid ${columnName} timestamp.`);
  }
  return date.toISOString();
}

function fromRow(row: ChatSessionRow): ConversationSession {
  return copySession({
    sessionId: row.id,
    language: row.language,
    customerType: row.customer_type,
    currency: row.currency,
    recentlyViewedProductIds: [...(row.recently_viewed_product_ids ?? [])],
    createdAt: toIsoTimestamp(row.created_at, "created_at"),
    updatedAt: toIsoTimestamp(row.updated_at, "updated_at"),
    expiresAt: toIsoTimestamp(row.expires_at, "expires_at"),
    ...optionalProperty("city", row.city),
    ...optionalProperty("warehouseId", row.warehouse_id),
    ...optionalProperty("userId", row.user_id),
    ...optionalProperty("activeProposalId", row.active_proposal_id)
  });
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

/**
 * Durable session storage. `get` intentionally filters expired records so an
 * expired session cannot be revived by a later update.
 */
export class PostgresSessionStore implements SessionStore {
  public constructor(private readonly database: PostgresQueryExecutor) {}

  public async create(session: ConversationSession): Promise<void> {
    try {
      await this.database.query(
        `INSERT INTO chat_sessions (
          id,
          user_id,
          language,
          city,
          warehouse_id,
          customer_type,
          currency,
          active_proposal_id,
          recently_viewed_product_ids,
          created_at,
          updated_at,
          expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)`,
        [
          session.sessionId,
          session.userId ?? null,
          session.language,
          session.city ?? null,
          session.warehouseId ?? null,
          session.customerType,
          session.currency,
          session.activeProposalId ?? null,
          JSON.stringify([...session.recentlyViewedProductIds]),
          session.createdAt,
          session.updatedAt,
          session.expiresAt
        ]
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError("IDEMPOTENCY_CONFLICT", "Session ID already exists.", 409);
      }
      throw error;
    }
  }

  public async get(sessionId: string): Promise<ConversationSession | undefined> {
    const result = await this.database.query<ChatSessionRow>(
      `SELECT
        id,
        user_id,
        language,
        city,
        warehouse_id,
        customer_type,
        currency,
        active_proposal_id,
        recently_viewed_product_ids,
        created_at,
        updated_at,
        expires_at
      FROM chat_sessions
      WHERE id = $1 AND expires_at > NOW()
      LIMIT 1`,
      [sessionId]
    );
    const row = result.rows[0];
    return row === undefined ? undefined : fromRow(row);
  }

  public async replace(session: ConversationSession): Promise<void> {
    const result = await this.database.query<{ readonly id: string }>(
      `UPDATE chat_sessions
      SET
        user_id = $2,
        language = $3,
        city = $4,
        warehouse_id = $5,
        customer_type = $6,
        currency = $7,
        active_proposal_id = $8,
        recently_viewed_product_ids = $9::jsonb,
        updated_at = $10,
        expires_at = $11
      WHERE id = $1 AND expires_at > NOW()
      RETURNING id`,
      [
        session.sessionId,
        session.userId ?? null,
        session.language,
        session.city ?? null,
        session.warehouseId ?? null,
        session.customerType,
        session.currency,
        session.activeProposalId ?? null,
        JSON.stringify([...session.recentlyViewedProductIds]),
        session.updatedAt,
        session.expiresAt
      ]
    );

    if (result.rowCount !== 1) {
      throw new AppError("NOT_FOUND", "Session was not found or has expired.", 404);
    }
  }

  public async delete(sessionId: string): Promise<void> {
    await this.database.query("DELETE FROM chat_sessions WHERE id = $1", [sessionId]);
  }
}
