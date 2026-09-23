import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import type { PostgresQueryExecutor } from "../../src/database/postgres.js";
import { PostgresSessionStore, type ConversationSession } from "../../src/sessions/index.js";

class RecordingExecutor implements PostgresQueryExecutor {
  public readonly calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> =
    [];

  public async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<Row>> {
    this.calls.push({ text, ...(values === undefined ? {} : { values }) });
    return { rows: [] } as QueryResult<Row>;
  }
}

describe("PostgresSessionStore", () => {
  it("writes recently viewed IDs as JSONB instead of a PostgreSQL array", async () => {
    const database = new RecordingExecutor();
    const store = new PostgresSessionStore(database);
    const session: ConversationSession = {
      sessionId: "7bcf4ace-2de1-4d8a-a486-2b9a583bd6fb",
      language: "kk",
      city: "Almaty",
      customerType: "retail",
      currency: "KZT",
      recentlyViewedProductIds: ["prd-mcb-019"],
      createdAt: "2026-09-23T09:00:00.000Z",
      updatedAt: "2026-09-23T09:00:00.000Z",
      expiresAt: "2026-09-24T09:00:00.000Z"
    };

    await store.create(session);

    expect(database.calls[0]?.text).toContain("$9::jsonb");
    expect(database.calls[0]?.values?.[8]).toBe(JSON.stringify(session.recentlyViewedProductIds));
  });
});
