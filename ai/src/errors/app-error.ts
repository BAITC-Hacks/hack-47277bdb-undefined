export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CITY_REQUIRED"
  | "STOCK_UNAVAILABLE"
  | "PRICE_UNAVAILABLE"
  | "PROPOSAL_NOT_FOUND"
  | "PROPOSAL_EXPIRED"
  | "PROPOSAL_OWNERSHIP_MISMATCH"
  | "CONFIRMATION_REQUIRED"
  | "PROPOSAL_CHANGED"
  | "IDEMPOTENCY_CONFLICT"
  | "UNSUPPORTED_FILE"
  | "FILE_TOO_LARGE"
  | "UNSAFE_REQUEST"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Readonly<Record<string, unknown>>;

  public constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
