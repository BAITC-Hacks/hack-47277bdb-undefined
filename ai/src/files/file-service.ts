import { createHash, randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { PostgresQueryExecutor } from "../database/postgres.js";
import { AppError } from "../errors/app-error.js";
import { isolateDocumentData } from "../security/content-safety.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 500_000;

const MIME_TYPES: Readonly<Record<string, readonly string[]>> = {
  csv: ["text/csv", "application/csv", "text/plain"],
  txt: ["text/plain"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  xls: ["application/vnd.ms-excel"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"]
};

export type SupportedFileKind = "spreadsheet" | "document" | "pdf" | "image" | "text";

export interface FileUploadInput {
  readonly filename: string;
  readonly mimeType: string;
  readonly content: Uint8Array;
}

export interface ExtractedTableRow {
  readonly cells: readonly string[];
}

export interface ExtractedDocument {
  readonly text: string;
  readonly rows: readonly ExtractedTableRow[];
  readonly warnings: readonly string[];
}

export interface StoredFile {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly kind: SupportedFileKind;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly uploadedAt: string;
  readonly extracted: ExtractedDocument;
  readonly ignoredInstructionCount: number;
}

export interface BinaryDocumentParser {
  readonly kind: SupportedFileKind;
  canParse(file: FileUploadInput): boolean;
  parse(file: FileUploadInput): Promise<ExtractedDocument>;
}

export interface FileStore {
  save(file: StoredFile): Promise<void>;
  get(id: string): Promise<StoredFile | undefined>;
}

export class InMemoryFileStore implements FileStore {
  private readonly files = new Map<string, StoredFile>();

  public async save(file: StoredFile): Promise<void> {
    this.files.set(file.id, file);
  }

  public async get(id: string): Promise<StoredFile | undefined> {
    return this.files.get(id);
  }
}

type UploadedFileRow = QueryResultRow & {
  readonly id: string;
  readonly filename: string;
  readonly mime_type: string;
  readonly file_kind: SupportedFileKind;
  readonly size_bytes: number;
  readonly sha256: string;
  readonly extracted_data: unknown;
  readonly created_at: Date | string;
  readonly ignored_instruction_count: number;
};

/**
 * Durable file metadata store. Raw file bytes intentionally remain outside of
 * PostgreSQL; `storage_key` can be populated by a separate object-storage adapter.
 * The `uploaded_files.ignored_instruction_count` column is required so document
 * prompt-injection filtering remains auditable after a restart.
 */
export class PostgresFileStore implements FileStore {
  public constructor(private readonly database: PostgresQueryExecutor) {}

  public async save(file: StoredFile): Promise<void> {
    await this.database.query(
      `INSERT INTO uploaded_files (
        id,
        filename,
        mime_type,
        file_kind,
        size_bytes,
        sha256,
        extracted_data,
        created_at,
        ignored_instruction_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        file.id,
        file.filename,
        file.mimeType,
        file.kind,
        file.sizeBytes,
        file.sha256,
        JSON.stringify(file.extracted),
        file.uploadedAt,
        file.ignoredInstructionCount
      ]
    );
  }

  public async get(id: string): Promise<StoredFile | undefined> {
    const result = await this.database.query<UploadedFileRow>(
      `SELECT
        id,
        filename,
        mime_type,
        file_kind,
        size_bytes,
        sha256,
        extracted_data,
        created_at,
        ignored_instruction_count
      FROM uploaded_files
      WHERE id = $1`,
      [id]
    );
    const row = result.rows[0];
    return row === undefined ? undefined : storedFileFromRow(row);
  }
}

/**
 * Upload boundary: validates a file before extraction and stores only the data view.
 * Production injects isolated xlsx/docx/pdf/image parsers; this service never treats text as directives.
 */
export class FileService {
  public constructor(
    private readonly store: FileStore,
    private readonly parsers: readonly BinaryDocumentParser[] = []
  ) {}

  public async upload(input: FileUploadInput): Promise<StoredFile> {
    validateFile(input);
    const kind = resolveKind(input);
    const extracted = await this.extract(input, kind);
    const safety = isolateDocumentData(extracted.text.slice(0, MAX_EXTRACTED_CHARACTERS));
    const stored: StoredFile = {
      id: randomUUID(),
      filename: input.filename,
      mimeType: input.mimeType,
      kind,
      sizeBytes: input.content.byteLength,
      sha256: createHash("sha256").update(input.content).digest("hex"),
      uploadedAt: new Date().toISOString(),
      extracted: {
        ...extracted,
        text: safety.cleanText,
        warnings:
          safety.ignoredInstructionCount > 0
            ? [
                ...extracted.warnings,
                "Untrusted instruction-like content was excluded from analysis."
              ]
            : extracted.warnings
      },
      ignoredInstructionCount: safety.ignoredInstructionCount
    };
    await this.store.save(stored);
    return stored;
  }

  public async get(fileId: string): Promise<StoredFile> {
    const file = await this.store.get(fileId);
    if (file === undefined) {
      throw new AppError("NOT_FOUND", "Файл не найден.", 404);
    }
    return file;
  }

  private async extract(
    input: FileUploadInput,
    kind: SupportedFileKind
  ): Promise<ExtractedDocument> {
    const parser = this.parsers.find((candidate) => candidate.canParse(input));
    if (parser !== undefined) {
      return parser.parse(input);
    }
    if (kind === "text" || input.mimeType === "text/csv") {
      return extractTextOrCsv(input);
    }
    throw new AppError(
      "UNSUPPORTED_FILE",
      `Формат ${input.filename} принят, но для него не подключен безопасный parser adapter.`,
      422
    );
  }
}

function validateFile(input: FileUploadInput): void {
  if (input.filename.trim().length === 0 || input.filename.length > 255) {
    throw new AppError("VALIDATION_ERROR", "Некорректное имя файла.", 400);
  }
  if (input.content.byteLength === 0) {
    throw new AppError("VALIDATION_ERROR", "Пустой файл нельзя обработать.", 400);
  }
  if (input.content.byteLength > MAX_FILE_BYTES) {
    throw new AppError("FILE_TOO_LARGE", "Размер файла превышает 10 MB.", 413);
  }
  resolveKind(input);
  validateMimeType(input);
  validateMagicBytes(input);
}

function validateMimeType(input: FileUploadInput): void {
  const fileExtension = input.filename.toLocaleLowerCase().split(".").pop() ?? "";
  const validMimeTypes = MIME_TYPES[fileExtension] ?? [];
  if (!validMimeTypes.includes(input.mimeType.toLocaleLowerCase())) {
    throw new AppError(
      "UNSUPPORTED_FILE",
      "File MIME type does not match its allowed extension.",
      415
    );
  }
}

function validateMagicBytes(input: FileUploadInput): void {
  const fileExtension = input.filename.toLocaleLowerCase().split(".").pop() ?? "";
  const bytes = input.content;
  const hasPrefix = (...prefix: readonly number[]): boolean =>
    prefix.every((value, index) => bytes[index] === value);
  const valid =
    (fileExtension === "pdf" && hasPrefix(0x25, 0x50, 0x44, 0x46, 0x2d)) ||
    ((fileExtension === "jpg" || fileExtension === "jpeg") && hasPrefix(0xff, 0xd8, 0xff)) ||
    (fileExtension === "png" && hasPrefix(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) ||
    (["xlsx", "docx"].includes(fileExtension) && hasPrefix(0x50, 0x4b, 0x03, 0x04)) ||
    fileExtension === "xls" ||
    fileExtension === "csv" ||
    fileExtension === "txt";
  if (!valid) {
    throw new AppError("UNSUPPORTED_FILE", "File signature does not match its declared type.", 415);
  }
}

function resolveKind(input: FileUploadInput): SupportedFileKind {
  const extension = input.filename.toLocaleLowerCase().split(".").pop() ?? "";
  const allowed: Readonly<Record<string, SupportedFileKind>> = {
    csv: "text",
    txt: "text",
    xlsx: "spreadsheet",
    xls: "spreadsheet",
    docx: "document",
    pdf: "pdf",
    jpg: "image",
    jpeg: "image",
    png: "image"
  };
  const kind = allowed[extension];
  if (kind === undefined) {
    throw new AppError(
      "UNSUPPORTED_FILE",
      "Поддерживаются CSV, XLSX, XLS, DOCX, PDF, JPEG и PNG.",
      415
    );
  }
  return kind;
}

function extractTextOrCsv(input: FileUploadInput): ExtractedDocument {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(input.content);
  const rows =
    input.mimeType === "text/csv" || input.filename.toLocaleLowerCase().endsWith(".csv")
      ? parseCsv(text)
      : [];
  return { text, rows, warnings: [] };
}

/** A small RFC-4180-compatible parser sufficient for safely extracting CSV cells. */
function parseCsv(value: string): readonly ExtractedTableRow[] {
  const rows: ExtractedTableRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    const next = value[index + 1] ?? "";
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") {
        index += 1;
      }
      cells.push(cell.trim());
      if (cells.some((entry) => entry.length > 0)) {
        rows.push({ cells });
      }
      cells = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  if (cells.some((entry) => entry.length > 0)) {
    rows.push({ cells });
  }
  return rows;
}

function storedFileFromRow(row: UploadedFileRow): StoredFile {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    kind: row.file_kind,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    uploadedAt: toIsoString(row.created_at),
    extracted: extractedDocumentFromJson(row.extracted_data),
    ignoredInstructionCount: row.ignored_instruction_count
  };
}

function extractedDocumentFromJson(value: unknown): ExtractedDocument {
  const parsed = parseJson(value);
  if (
    !isRecord(parsed) ||
    typeof parsed.text !== "string" ||
    !Array.isArray(parsed.rows) ||
    !Array.isArray(parsed.warnings)
  ) {
    throw new Error("Invalid extracted_data payload in uploaded_files.");
  }

  const rows = parsed.rows.map((row) => {
    if (
      !isRecord(row) ||
      !Array.isArray(row.cells) ||
      !row.cells.every((cell) => typeof cell === "string")
    ) {
      throw new Error("Invalid extracted_data row in uploaded_files.");
    }
    return { cells: row.cells };
  });
  if (!parsed.warnings.every((warning) => typeof warning === "string")) {
    throw new Error("Invalid extracted_data warnings in uploaded_files.");
  }

  return { text: parsed.text, rows, warnings: parsed.warnings };
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error("Invalid JSON payload in uploaded_files.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
