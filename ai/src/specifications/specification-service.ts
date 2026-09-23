import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { PostgresQueryExecutor } from "../database/postgres.js";
import type { Product, StockResult } from "../types/domain.js";
import { AppError } from "../errors/app-error.js";
import type { StoredFile } from "../files/file-service.js";

export type SpecificationMatchStatus =
  | "EXACT_MATCH"
  | "LIKELY_MATCH"
  | "NEEDS_CLARIFICATION"
  | "OUT_OF_STOCK"
  | "ANALOG_FOUND"
  | "NOT_FOUND";

export interface SpecificationLineItem {
  readonly lineNumber: number;
  readonly name: string;
  readonly article?: string;
  readonly supplierArticle?: string;
  readonly quantity: number;
  readonly unit?: string;
  readonly technicalRequirements?: string;
}

export interface SpecificationProductCandidate {
  readonly product: Product;
  readonly confidence: number;
}

export interface SpecificationCatalogPort {
  search(
    query: string,
    city: string,
    limit: number
  ): Promise<readonly SpecificationProductCandidate[]>;
  getStock(productId: string, city: string, quantity: number): Promise<StockResult>;
  findAnalogs(
    source: SpecificationLineItem,
    city: string,
    quantity: number
  ): Promise<readonly SpecificationProductCandidate[]>;
}

export interface SpecificationResultLine {
  readonly source: SpecificationLineItem;
  readonly status: SpecificationMatchStatus;
  readonly product?: Product;
  readonly analog?: Product;
  readonly stock?: StockResult;
  readonly explanation: string;
}

export interface SpecificationAnalysis {
  readonly id: string;
  readonly fileId: string;
  readonly city: string;
  readonly createdAt: string;
  readonly lines: readonly SpecificationResultLine[];
  readonly coveragePercent: number;
  readonly totalEstimatedItems: number;
}

export interface SpecificationAnalysisStore {
  save(analysis: SpecificationAnalysis): Promise<void>;
  get(id: string): Promise<SpecificationAnalysis | undefined>;
}

export class InMemorySpecificationAnalysisStore implements SpecificationAnalysisStore {
  private readonly analyses = new Map<string, SpecificationAnalysis>();

  public async save(analysis: SpecificationAnalysis): Promise<void> {
    this.analyses.set(analysis.id, analysis);
  }

  public async get(id: string): Promise<SpecificationAnalysis | undefined> {
    return this.analyses.get(id);
  }
}

type SpecificationAnalysisRow = QueryResultRow & {
  readonly id: string;
  readonly file_id: string;
  readonly city: string;
  readonly result: unknown;
  readonly created_at: Date | string;
};

type PersistedSpecificationResult = Pick<
  SpecificationAnalysis,
  "lines" | "coveragePercent" | "totalEstimatedItems"
>;

/** Persists an analysis snapshot so future catalog changes do not rewrite its result. */
export class PostgresSpecificationAnalysisStore implements SpecificationAnalysisStore {
  public constructor(private readonly database: PostgresQueryExecutor) {}

  public async save(analysis: SpecificationAnalysis): Promise<void> {
    const result: PersistedSpecificationResult = {
      lines: analysis.lines,
      coveragePercent: analysis.coveragePercent,
      totalEstimatedItems: analysis.totalEstimatedItems
    };
    await this.database.query(
      `INSERT INTO specification_analyses (id, file_id, city, result, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [analysis.id, analysis.fileId, analysis.city, JSON.stringify(result), analysis.createdAt]
    );
  }

  public async get(id: string): Promise<SpecificationAnalysis | undefined> {
    const result = await this.database.query<SpecificationAnalysisRow>(
      `SELECT id, file_id, city, result, created_at
       FROM specification_analyses
       WHERE id = $1`,
      [id]
    );
    const row = result.rows[0];
    return row === undefined ? undefined : specificationAnalysisFromRow(row);
  }
}

export class SpecificationService {
  public constructor(
    private readonly catalog: SpecificationCatalogPort,
    private readonly store: SpecificationAnalysisStore
  ) {}

  public async analyze(file: StoredFile, city: string): Promise<SpecificationAnalysis> {
    const lines = extractLineItems(file);
    if (lines.length === 0) {
      throw new AppError("VALIDATION_ERROR", "В файле не найдены позиции спецификации.", 422);
    }
    const results: SpecificationResultLine[] = [];
    for (const batch of chunk(lines, 20)) {
      const batchResults = await Promise.all(batch.map((line) => this.matchLine(line, city)));
      results.push(...batchResults);
    }
    const covered = results.filter(
      (result) => result.status !== "NOT_FOUND" && result.status !== "NEEDS_CLARIFICATION"
    ).length;
    const analysis: SpecificationAnalysis = {
      id: randomUUID(),
      fileId: file.id,
      city,
      createdAt: new Date().toISOString(),
      lines: results,
      coveragePercent: Math.round((covered / results.length) * 100),
      totalEstimatedItems: results.reduce((sum, result) => sum + result.source.quantity, 0)
    };
    await this.store.save(analysis);
    return analysis;
  }

  public async get(analysisId: string): Promise<SpecificationAnalysis> {
    const analysis = await this.store.get(analysisId);
    if (analysis === undefined) {
      throw new AppError("NOT_FOUND", "Результат анализа спецификации не найден.", 404);
    }
    return analysis;
  }

  private async matchLine(
    line: SpecificationLineItem,
    city: string
  ): Promise<SpecificationResultLine> {
    const query = line.article ?? line.supplierArticle ?? line.name;
    const candidates = await this.catalog.search(query, city, 5);
    const exact = candidates.find((candidate) =>
      [candidate.product.sku, candidate.product.supplierSku].some(
        (article) => article.toLocaleLowerCase() === query.toLocaleLowerCase()
      )
    );
    const best = exact ?? candidates[0];
    if (best !== undefined) {
      const stock = await this.catalog.getStock(best.product.id, city, line.quantity);
      if (!stock.canFulfillRequestedQuantity) {
        const analog = (await this.catalog.findAnalogs(line, city, line.quantity))[0];
        return analog === undefined
          ? {
              source: line,
              status: "OUT_OF_STOCK",
              product: best.product,
              stock,
              explanation:
                "Точное совпадение найдено, но необходимого количества в выбранном городе нет."
            }
          : {
              source: line,
              status: "ANALOG_FOUND",
              product: best.product,
              analog: analog.product,
              stock,
              explanation:
                "Точное совпадение найдено, но количества нет; предложен совместимый аналог."
            };
      }
      return {
        source: line,
        status: exact === undefined ? "LIKELY_MATCH" : "EXACT_MATCH",
        product: best.product,
        stock,
        explanation:
          exact === undefined
            ? "Позиция подобрана по близкому совпадению — проверьте характеристики."
            : "Совпадение по артикулу подтверждено."
      };
    }
    const analog = (await this.catalog.findAnalogs(line, city, line.quantity))[0];
    return analog === undefined
      ? {
          source: line,
          status: "NOT_FOUND",
          explanation: "Подходящая позиция и безопасный аналог не найдены."
        }
      : {
          source: line,
          status: "ANALOG_FOUND",
          analog: analog.product,
          explanation:
            "Точное совпадение не найдено; предложен кандидат для проверки совместимости."
        };
  }
}

function extractLineItems(file: StoredFile): readonly SpecificationLineItem[] {
  const rows = file.extracted.rows;
  if (rows.length > 0) {
    return rows.slice(1, 51).flatMap((row, index) => rowToLine(row.cells, index + 2));
  }
  return file.extracted.text
    .split(/\r?\n/u)
    .slice(0, 50)
    .flatMap((line, index) => textToLine(line, index + 1));
}

function rowToLine(cells: readonly string[], lineNumber: number): readonly SpecificationLineItem[] {
  const name = cells[0]?.trim() ?? "";
  if (name.length === 0) {
    return [];
  }
  const rawQuantity = cells[2] ?? cells[1] ?? "1";
  return [
    {
      lineNumber,
      name,
      article: optional(cells[1]),
      quantity: positiveQuantity(rawQuantity),
      unit: optional(cells[3]),
      technicalRequirements: optional(cells.slice(4).join(" "))
    }
  ];
}

function textToLine(value: string, lineNumber: number): readonly SpecificationLineItem[] {
  const normalized = value.trim();
  if (normalized.length < 3 || normalized.startsWith("[untrusted")) {
    return [];
  }
  const quantityMatch = normalized.match(/(?:x|×|шт\.?|pcs?)\s*(\d+(?:[.,]\d+)?)/iu);
  const articleMatch = normalized.match(/\b[A-ZА-Я0-9][A-ZА-Я0-9-]{3,}\b/iu);
  return [
    {
      lineNumber,
      name: normalized,
      article: articleMatch?.[0],
      quantity: positiveQuantity(quantityMatch?.[1] ?? "1")
    }
  ];
}

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function positiveQuantity(value: string): number {
  const quantity = Number(value.replace(",", "."));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function specificationAnalysisFromRow(row: SpecificationAnalysisRow): SpecificationAnalysis {
  const result = persistedSpecificationResultFromJson(row.result);
  return {
    id: row.id,
    fileId: row.file_id,
    city: row.city,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    ...result
  };
}

function persistedSpecificationResultFromJson(value: unknown): PersistedSpecificationResult {
  const parsed = parsePersistedJson(value);
  if (
    !isPersistedRecord(parsed) ||
    !Array.isArray(parsed.lines) ||
    typeof parsed.coveragePercent !== "number" ||
    typeof parsed.totalEstimatedItems !== "number"
  ) {
    throw new Error("Invalid result payload in specification_analyses.");
  }

  return {
    lines: parsed.lines as readonly SpecificationResultLine[],
    coveragePercent: parsed.coveragePercent,
    totalEstimatedItems: parsed.totalEstimatedItems
  };
}

function parsePersistedJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Invalid JSON payload in specification_analyses.");
  }
}

function isPersistedRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
