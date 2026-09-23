import { randomUUID } from "node:crypto";

import type { QueryResultRow } from "pg";

import type { PostgresQueryExecutor } from "../database/postgres.js";
import type { AuditEvent, JsonObject } from "../types/domain.js";

export interface AuditLog {
  append(input: Omit<AuditEvent, "id" | "occurredAt">): Promise<AuditEvent>;
  listBySession(sessionId: string): Promise<readonly AuditEvent[]>;
}

/** Replace with a Postgres-backed append-only audit log for production. */
export class InMemoryAuditLog implements AuditLog {
  private readonly events: AuditEvent[] = [];

  public async append(input: Omit<AuditEvent, "id" | "occurredAt">): Promise<AuditEvent> {
    const event: AuditEvent = {
      ...input,
      id: randomUUID(),
      occurredAt: new Date().toISOString()
    };
    this.events.push(event);
    return event;
  }

  public async listBySession(sessionId: string): Promise<readonly AuditEvent[]> {
    return this.events.filter((event) => event.sessionId === sessionId);
  }
}

interface AuditEventRow extends QueryResultRow {
  readonly id: string;
  readonly occurred_at: Date | string;
  readonly request_id: string;
  readonly session_id: string | null;
  readonly event_type: string;
  readonly actor: AuditEvent["actor"];
  readonly payload: JsonObject;
}

function toIsoTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("PostgreSQL returned an invalid audit event timestamp.");
  }
  return date.toISOString();
}

function fromAuditRow(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    occurredAt: toIsoTimestamp(row.occurred_at),
    requestId: row.request_id,
    eventType: row.event_type,
    actor: row.actor,
    payload: row.payload,
    ...(row.session_id === null ? {} : { sessionId: row.session_id })
  };
}

/** Append-only PostgreSQL audit log, shared by API and cart workflows. */
export class PostgresAuditLog implements AuditLog {
  public constructor(private readonly database: PostgresQueryExecutor) {}

  public async append(input: Omit<AuditEvent, "id" | "occurredAt">): Promise<AuditEvent> {
    const event: AuditEvent = {
      ...input,
      id: randomUUID(),
      occurredAt: new Date().toISOString()
    };

    await this.database.query(
      `INSERT INTO audit_events (
        id,
        session_id,
        request_id,
        event_type,
        actor,
        payload,
        occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.id,
        event.sessionId ?? null,
        event.requestId,
        event.eventType,
        event.actor,
        safeAuditPayload(event.payload),
        event.occurredAt
      ]
    );

    return event;
  }

  public async listBySession(sessionId: string): Promise<readonly AuditEvent[]> {
    const result = await this.database.query<AuditEventRow>(
      `SELECT id, occurred_at, request_id, session_id, event_type, actor, payload
      FROM audit_events
      WHERE session_id = $1
      ORDER BY occurred_at ASC, id ASC`,
      [sessionId]
    );
    return result.rows.map(fromAuditRow);
  }
}

export function safeAuditPayload(input: JsonObject): JsonObject {
  const forbiddenKeys = new Set([
    "authorization",
    "cookie",
    "cvv",
    "cardNumber",
    "token",
    "apiKey"
  ]);
  const result: Record<string, JsonObject[string]> = {};
  for (const [key, value] of Object.entries(input)) {
    result[key] = forbiddenKeys.has(key.toLocaleLowerCase()) ? "[redacted]" : value;
  }
  return result;
}
