import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";
import type { PostgresQueryExecutor } from "../../src/database/postgres.js";
import { PostgresFileStore, type StoredFile } from "../../src/files/file-service.js";
import { PostgresHandoffService } from "../../src/handoff/handoff-service.js";
import {
  PostgresSpecificationAnalysisStore,
  type SpecificationAnalysis
} from "../../src/specifications/specification-service.js";

class RecordingExecutor implements PostgresQueryExecutor {
  public readonly calls: Array<{ readonly text: string; readonly values?: readonly unknown[] }> =
    [];
  public rows: QueryResultRow[] = [];

  public async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<Row>> {
    this.calls.push({ text, ...(values === undefined ? {} : { values }) });
    return { rows: this.rows as Row[] } as QueryResult<Row>;
  }
}

describe("PostgreSQL auxiliary stores", () => {
  it("persists and restores extracted-file metadata including ignored instruction count", async () => {
    const database = new RecordingExecutor();
    const store = new PostgresFileStore(database);
    const file: StoredFile = {
      id: "1c17a0b8-4bf7-45ca-879a-87bb76bde46b",
      filename: "spec.csv",
      mimeType: "text/csv",
      kind: "text",
      sizeBytes: 12,
      sha256: "hash",
      uploadedAt: "2026-09-23T10:00:00.000Z",
      extracted: { text: "name,qty", rows: [{ cells: ["name", "qty"] }], warnings: [] },
      ignoredInstructionCount: 2
    };

    await store.save(file);

    expect(database.calls[0]?.text).toContain("ignored_instruction_count");
    expect(database.calls[0]?.values?.[8]).toBe(2);

    database.rows = [
      {
        id: file.id,
        filename: file.filename,
        mime_type: file.mimeType,
        file_kind: file.kind,
        size_bytes: file.sizeBytes,
        sha256: file.sha256,
        extracted_data: file.extracted,
        created_at: new Date(file.uploadedAt),
        ignored_instruction_count: file.ignoredInstructionCount
      }
    ];

    await expect(store.get(file.id)).resolves.toEqual(file);
  });

  it("round-trips specification result snapshots", async () => {
    const database = new RecordingExecutor();
    const store = new PostgresSpecificationAnalysisStore(database);
    const analysis: SpecificationAnalysis = {
      id: "2c17a0b8-4bf7-45ca-879a-87bb76bde46b",
      fileId: "1c17a0b8-4bf7-45ca-879a-87bb76bde46b",
      city: "Almaty",
      createdAt: "2026-09-23T10:00:00.000Z",
      lines: [],
      coveragePercent: 100,
      totalEstimatedItems: 3
    };

    await store.save(analysis);

    const persistedResult = database.calls[0]?.values?.[3];
    expect(database.calls[0]?.text).toContain("specification_analyses");
    expect(JSON.parse(String(persistedResult))).toEqual({
      lines: [],
      coveragePercent: 100,
      totalEstimatedItems: 3
    });

    database.rows = [
      {
        id: analysis.id,
        file_id: analysis.fileId,
        city: analysis.city,
        result: persistedResult,
        created_at: new Date(analysis.createdAt)
      }
    ];

    await expect(store.get(analysis.id)).resolves.toEqual(analysis);
  });

  it("writes a manager handoff to the required durable table", async () => {
    const database = new RecordingExecutor();
    const service = new PostgresHandoffService(database);

    const handoff = await service.create({
      sessionId: "3c17a0b8-4bf7-45ca-879a-87bb76bde46b",
      customerQuestion: "Need a project discount",
      city: "Astana",
      productReferences: ["EKT-MCB-019"],
      requestedQuantity: 10,
      checkedInformation: ["stock"],
      unresolvedIssue: "Discount policy needs manager review"
    });

    expect(database.calls[0]?.text).toContain("manager_handoffs");
    expect(database.calls[0]?.values).toEqual([
      handoff.id,
      handoff.sessionId,
      handoff.customerQuestion,
      handoff.city,
      JSON.stringify(handoff.productReferences),
      handoff.requestedQuantity,
      JSON.stringify(handoff.checkedInformation),
      handoff.unresolvedIssue,
      "open",
      handoff.createdAt
    ]);
  });
});
