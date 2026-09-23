import { AppError } from "../errors/app-error.js";
import type { QueryResultRow } from "pg";
import type { PostgresQueryExecutor } from "../database/postgres.js";
import type { CustomerType } from "../types/domain.js";
import type {
  CartConfirmation,
  CartItem,
  CartProposal,
  CartProposalLine,
  CartProposalStatus,
  CartStockSnapshot
} from "./contracts.js";

export type ProposalInvalidationReason =
  | "scope_changed"
  | "price_changed"
  | "stock_unavailable"
  | "price_unavailable"
  | "catalog_unavailable";

/** Internal-only record. The plaintext confirmation token is deliberately absent. */
export interface StoredCartProposal {
  readonly proposal: CartProposal;
  readonly ownerUserId?: string;
  readonly confirmationTokenHash: string;
  readonly status: CartProposalStatus;
  readonly confirmationIdempotencyKey?: string;
  readonly confirmation?: CartConfirmation;
  readonly invalidationReason?: ProposalInvalidationReason;
}

export type ProposalClaimResult =
  | { readonly kind: "claimed"; readonly record: StoredCartProposal }
  | { readonly kind: "already_confirming"; readonly record: StoredCartProposal }
  | { readonly kind: "already_confirmed"; readonly record: StoredCartProposal }
  | { readonly kind: "expired"; readonly record: StoredCartProposal }
  | { readonly kind: "invalidated"; readonly record: StoredCartProposal };

/**
 * A durable implementation should make claimConfirmation an atomic compare and
 * set in PostgreSQL. That one operation prevents separate HTTP retries
 * from sending two cart mutations.
 */
export interface CartProposalStore {
  create(record: StoredCartProposal): Promise<void>;
  get(proposalId: string, now: Date): Promise<StoredCartProposal | undefined>;
  claimConfirmation(
    proposalId: string,
    idempotencyKey: string,
    now: Date
  ): Promise<ProposalClaimResult | undefined>;
  markConfirmed(
    proposalId: string,
    idempotencyKey: string,
    confirmation: CartConfirmation
  ): Promise<StoredCartProposal>;
  markInvalidated(
    proposalId: string,
    reason: ProposalInvalidationReason
  ): Promise<StoredCartProposal>;
}

function copyLine(line: CartProposalLine): CartProposalLine {
  return {
    productId: line.productId,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
    currency: line.currency,
    priceCheckedAt: line.priceCheckedAt,
    ...(line.priceValidUntil === undefined ? {} : { priceValidUntil: line.priceValidUntil })
  };
}

function copyStockSnapshot(snapshot: CartStockSnapshot): CartStockSnapshot {
  return {
    productId: snapshot.productId,
    requestedQuantity: snapshot.requestedQuantity,
    availableQuantity: snapshot.availableQuantity,
    status: snapshot.status,
    checkedAt: snapshot.checkedAt
  };
}

export function copyCartProposal(proposal: CartProposal): CartProposal {
  return {
    proposalId: proposal.proposalId,
    sessionId: proposal.sessionId,
    city: proposal.city,
    customerType: proposal.customerType,
    currency: proposal.currency,
    items: proposal.items.map(copyLine),
    subtotal: proposal.subtotal,
    stockSnapshot: proposal.stockSnapshot.map(copyStockSnapshot),
    createdAt: proposal.createdAt,
    expiresAt: proposal.expiresAt,
    ...(proposal.warehouseId === undefined ? {} : { warehouseId: proposal.warehouseId })
  };
}

function copyCartItem(item: CartItem): CartItem {
  return {
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    currency: item.currency
  };
}

export function copyCartConfirmation(confirmation: CartConfirmation): CartConfirmation {
  return {
    proposalId: confirmation.proposalId,
    cartId: confirmation.cartId,
    cartUrl: confirmation.cartUrl,
    items: confirmation.items.map(copyCartItem),
    subtotal: confirmation.subtotal,
    currency: confirmation.currency,
    confirmedAt: confirmation.confirmedAt
  };
}

export function copyStoredCartProposal(record: StoredCartProposal): StoredCartProposal {
  return {
    proposal: copyCartProposal(record.proposal),
    confirmationTokenHash: record.confirmationTokenHash,
    status: record.status,
    ...(record.ownerUserId === undefined ? {} : { ownerUserId: record.ownerUserId }),
    ...(record.confirmationIdempotencyKey === undefined
      ? {}
      : { confirmationIdempotencyKey: record.confirmationIdempotencyKey }),
    ...(record.confirmation === undefined
      ? {}
      : { confirmation: copyCartConfirmation(record.confirmation) }),
    ...(record.invalidationReason === undefined
      ? {}
      : { invalidationReason: record.invalidationReason })
  };
}

function isExpired(record: StoredCartProposal, now: Date): boolean {
  return Date.parse(record.proposal.expiresAt) <= now.getTime();
}

interface CartProposalRow extends QueryResultRow {
  readonly id: string;
  readonly session_id: string;
  readonly owner_user_id: string | null;
  readonly city: string;
  readonly warehouse_id: string | null;
  readonly customer_type: CustomerType;
  readonly currency: string;
  readonly items: unknown;
  readonly stock_snapshot: unknown;
  readonly subtotal: string | number;
  readonly confirmation_token_hash: string;
  readonly status: CartProposalStatus;
  readonly confirmation_idempotency_key: string | null;
  readonly confirmation: unknown;
  readonly invalidation_reason: ProposalInvalidationReason | null;
  readonly created_at: Date | string;
  readonly expires_at: Date | string;
}

const cartProposalColumns = `
  id,
  session_id,
  owner_user_id,
  city,
  warehouse_id,
  customer_type,
  currency,
  items,
  stock_snapshot,
  subtotal,
  confirmation_token_hash,
  status,
  confirmation_idempotency_key,
  confirmation,
  invalidation_reason,
  created_at,
  expires_at`;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function databaseString(value: unknown, column: string): string {
  if (typeof value !== "string") {
    throw new Error(`PostgreSQL returned an invalid ${column} value.`);
  }
  return value;
}

function databaseNumber(value: unknown, column: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`PostgreSQL returned an invalid ${column} value.`);
  }
  return number;
}

function databaseDate(value: Date | string, column: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`PostgreSQL returned an invalid ${column} timestamp.`);
  }
  return date.toISOString();
}

function databaseArray(value: unknown, column: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`PostgreSQL returned an invalid ${column} value.`);
  }
  return value;
}

function databaseCustomerType(value: unknown): CustomerType {
  if (value !== "retail" && value !== "wholesale") {
    throw new Error("PostgreSQL returned an invalid customer type.");
  }
  return value;
}

function databaseStatus(value: unknown): CartProposalStatus {
  if (
    value !== "pending" &&
    value !== "confirming" &&
    value !== "confirmed" &&
    value !== "invalidated" &&
    value !== "expired"
  ) {
    throw new Error("PostgreSQL returned an invalid cart proposal status.");
  }
  return value;
}

function databaseInvalidationReason(value: unknown): ProposalInvalidationReason {
  if (
    value !== "scope_changed" &&
    value !== "price_changed" &&
    value !== "stock_unavailable" &&
    value !== "price_unavailable" &&
    value !== "catalog_unavailable"
  ) {
    throw new Error("PostgreSQL returned an invalid cart proposal invalidation reason.");
  }
  return value;
}

function fromDatabaseLine(value: unknown): CartProposalLine {
  if (!isRecord(value)) {
    throw new Error("PostgreSQL returned an invalid cart proposal line.");
  }
  const priceValidUntil = value.priceValidUntil;
  return {
    productId: databaseString(value.productId, "items.productId"),
    quantity: databaseNumber(value.quantity, "items.quantity"),
    unitPrice: databaseNumber(value.unitPrice, "items.unitPrice"),
    lineTotal: databaseNumber(value.lineTotal, "items.lineTotal"),
    currency: databaseString(value.currency, "items.currency"),
    priceCheckedAt: databaseString(value.priceCheckedAt, "items.priceCheckedAt"),
    ...(priceValidUntil === undefined
      ? {}
      : { priceValidUntil: databaseString(priceValidUntil, "items.priceValidUntil") })
  };
}

function fromDatabaseStock(value: unknown): CartStockSnapshot {
  if (!isRecord(value)) {
    throw new Error("PostgreSQL returned an invalid cart stock snapshot.");
  }
  return {
    productId: databaseString(value.productId, "stock_snapshot.productId"),
    requestedQuantity: databaseNumber(value.requestedQuantity, "stock_snapshot.requestedQuantity"),
    availableQuantity: databaseNumber(value.availableQuantity, "stock_snapshot.availableQuantity"),
    status: databaseString(value.status, "stock_snapshot.status"),
    checkedAt: databaseString(value.checkedAt, "stock_snapshot.checkedAt")
  };
}

function fromDatabaseCartItem(value: unknown): CartItem {
  if (!isRecord(value)) {
    throw new Error("PostgreSQL returned an invalid cart confirmation item.");
  }
  return {
    productId: databaseString(value.productId, "confirmation.items.productId"),
    quantity: databaseNumber(value.quantity, "confirmation.items.quantity"),
    unitPrice: databaseNumber(value.unitPrice, "confirmation.items.unitPrice"),
    lineTotal: databaseNumber(value.lineTotal, "confirmation.items.lineTotal"),
    currency: databaseString(value.currency, "confirmation.items.currency")
  };
}

function fromDatabaseConfirmation(value: unknown): CartConfirmation {
  if (!isRecord(value)) {
    throw new Error("PostgreSQL returned an invalid cart confirmation.");
  }
  return {
    proposalId: databaseString(value.proposalId, "confirmation.proposalId"),
    cartId: databaseString(value.cartId, "confirmation.cartId"),
    cartUrl: databaseString(value.cartUrl, "confirmation.cartUrl"),
    items: databaseArray(value.items, "confirmation.items").map(fromDatabaseCartItem),
    subtotal: databaseNumber(value.subtotal, "confirmation.subtotal"),
    currency: databaseString(value.currency, "confirmation.currency"),
    confirmedAt: databaseString(value.confirmedAt, "confirmation.confirmedAt")
  };
}

function fromDatabaseRow(row: CartProposalRow): StoredCartProposal {
  const confirmation =
    row.confirmation === null ? undefined : fromDatabaseConfirmation(row.confirmation);
  const invalidationReason =
    row.invalidation_reason === null
      ? undefined
      : databaseInvalidationReason(row.invalidation_reason);
  return copyStoredCartProposal({
    proposal: {
      proposalId: row.id,
      sessionId: row.session_id,
      city: row.city,
      customerType: databaseCustomerType(row.customer_type),
      currency: row.currency,
      items: databaseArray(row.items, "items").map(fromDatabaseLine),
      subtotal: databaseNumber(row.subtotal, "subtotal"),
      stockSnapshot: databaseArray(row.stock_snapshot, "stock_snapshot").map(fromDatabaseStock),
      createdAt: databaseDate(row.created_at, "created_at"),
      expiresAt: databaseDate(row.expires_at, "expires_at"),
      ...(row.warehouse_id === null ? {} : { warehouseId: row.warehouse_id })
    },
    confirmationTokenHash: row.confirmation_token_hash,
    status: databaseStatus(row.status),
    ...(row.owner_user_id === null ? {} : { ownerUserId: row.owner_user_id }),
    ...(row.confirmation_idempotency_key === null
      ? {}
      : { confirmationIdempotencyKey: row.confirmation_idempotency_key }),
    ...(confirmation === undefined ? {} : { confirmation }),
    ...(invalidationReason === undefined ? {} : { invalidationReason })
  });
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

/**
 * PostgreSQL-backed proposal store. Its conditional updates are atomic and
 * never hold a database transaction open during an external cart mutation.
 */
export class PostgresCartProposalStore implements CartProposalStore {
  public constructor(private readonly database: PostgresQueryExecutor) {}

  public async create(record: StoredCartProposal): Promise<void> {
    const proposal = record.proposal;
    try {
      await this.database.query(
        `INSERT INTO cart_proposals (
          id, session_id, owner_user_id, city, warehouse_id, customer_type,
          currency, items, stock_snapshot, subtotal, confirmation_token_hash,
          status, confirmation_idempotency_key, confirmation,
          invalidation_reason, expires_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18
        )`,
        [
          proposal.proposalId,
          proposal.sessionId,
          record.ownerUserId ?? null,
          proposal.city,
          proposal.warehouseId ?? null,
          proposal.customerType,
          proposal.currency,
          JSON.stringify(proposal.items),
          JSON.stringify(proposal.stockSnapshot),
          proposal.subtotal,
          record.confirmationTokenHash,
          record.status,
          record.confirmationIdempotencyKey ?? null,
          record.confirmation === undefined ? null : JSON.stringify(record.confirmation),
          record.invalidationReason ?? null,
          proposal.expiresAt,
          proposal.createdAt,
          proposal.createdAt
        ]
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError("IDEMPOTENCY_CONFLICT", "Cart proposal ID already exists.", 409);
      }
      throw error;
    }
  }

  public async get(proposalId: string, now: Date): Promise<StoredCartProposal | undefined> {
    await this.expirePendingProposal(proposalId, now);
    return this.select(proposalId);
  }

  public async claimConfirmation(
    proposalId: string,
    idempotencyKey: string,
    now: Date
  ): Promise<ProposalClaimResult | undefined> {
    const expired = await this.database.query<CartProposalRow>(
      `UPDATE cart_proposals
      SET status = 'expired', updated_at = $2
      WHERE id = $1 AND status = 'pending' AND expires_at <= $2
      RETURNING ${cartProposalColumns}`,
      [proposalId, now.toISOString()]
    );
    const expiredRow = expired.rows[0];
    if (expiredRow !== undefined) {
      return { kind: "expired", record: fromDatabaseRow(expiredRow) };
    }

    const claimed = await this.database.query<CartProposalRow>(
      `UPDATE cart_proposals
      SET status = 'confirming', confirmation_idempotency_key = $2, updated_at = $3
      WHERE id = $1 AND status = 'pending' AND expires_at > $3
      RETURNING ${cartProposalColumns}`,
      [proposalId, idempotencyKey, now.toISOString()]
    );
    const claimedRow = claimed.rows[0];
    if (claimedRow !== undefined) {
      return { kind: "claimed", record: fromDatabaseRow(claimedRow) };
    }

    const current = await this.select(proposalId);
    if (current === undefined) {
      return undefined;
    }
    if (current.status === "confirming") {
      return { kind: "already_confirming", record: current };
    }
    if (current.status === "confirmed") {
      return { kind: "already_confirmed", record: current };
    }
    if (current.status === "expired") {
      return { kind: "expired", record: current };
    }
    return { kind: "invalidated", record: current };
  }

  public async markConfirmed(
    proposalId: string,
    idempotencyKey: string,
    confirmation: CartConfirmation
  ): Promise<StoredCartProposal> {
    const result = await this.database.query<CartProposalRow>(
      `UPDATE cart_proposals
      SET status = 'confirmed', confirmation = $3, updated_at = $4
      WHERE id = $1 AND status = 'confirming' AND confirmation_idempotency_key = $2
      RETURNING ${cartProposalColumns}`,
      [proposalId, idempotencyKey, JSON.stringify(confirmation), confirmation.confirmedAt]
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new AppError(
        "IDEMPOTENCY_CONFLICT",
        "Cart proposal is not claimed by this confirmation request.",
        409
      );
    }
    return fromDatabaseRow(row);
  }

  public async markInvalidated(
    proposalId: string,
    reason: ProposalInvalidationReason
  ): Promise<StoredCartProposal> {
    const result = await this.database.query<CartProposalRow>(
      `UPDATE cart_proposals
      SET status = 'invalidated', invalidation_reason = $2, updated_at = NOW()
      WHERE id = $1 AND status IN ('pending', 'confirming')
      RETURNING ${cartProposalColumns}`,
      [proposalId, reason]
    );
    const row = result.rows[0];
    if (row !== undefined) {
      return fromDatabaseRow(row);
    }
    const current = await this.select(proposalId);
    if (current === undefined) {
      throw new AppError("PROPOSAL_NOT_FOUND", "Cart proposal was not found.", 404);
    }
    return current;
  }

  private async expirePendingProposal(proposalId: string, now: Date): Promise<void> {
    await this.database.query(
      `UPDATE cart_proposals
      SET status = 'expired', updated_at = $2
      WHERE id = $1 AND status = 'pending' AND expires_at <= $2`,
      [proposalId, now.toISOString()]
    );
  }

  private async select(proposalId: string): Promise<StoredCartProposal | undefined> {
    const result = await this.database.query<CartProposalRow>(
      `SELECT ${cartProposalColumns}
      FROM cart_proposals
      WHERE id = $1
      LIMIT 1`,
      [proposalId]
    );
    const row = result.rows[0];
    return row === undefined ? undefined : fromDatabaseRow(row);
  }
}

/** In-process implementation intended for mock mode and unit tests. */
export class InMemoryCartProposalStore implements CartProposalStore {
  private readonly records = new Map<string, StoredCartProposal>();

  public async create(record: StoredCartProposal): Promise<void> {
    const proposalId = record.proposal.proposalId;
    if (this.records.has(proposalId)) {
      throw new AppError("IDEMPOTENCY_CONFLICT", "Cart proposal ID already exists.", 409);
    }

    this.records.set(proposalId, copyStoredCartProposal(record));
  }

  public async get(proposalId: string, now: Date): Promise<StoredCartProposal | undefined> {
    const record = this.expireIfNeeded(proposalId, now);
    return record === undefined ? undefined : copyStoredCartProposal(record);
  }

  public async claimConfirmation(
    proposalId: string,
    idempotencyKey: string,
    now: Date
  ): Promise<ProposalClaimResult | undefined> {
    const record = this.expireIfNeeded(proposalId, now);
    if (record === undefined) {
      return undefined;
    }

    if (record.status === "pending") {
      const claimed: StoredCartProposal = {
        ...record,
        status: "confirming",
        confirmationIdempotencyKey: idempotencyKey
      };
      this.records.set(proposalId, claimed);
      return { kind: "claimed", record: copyStoredCartProposal(claimed) };
    }

    if (record.status === "confirmed") {
      return { kind: "already_confirmed", record: copyStoredCartProposal(record) };
    }

    if (record.status === "confirming") {
      return { kind: "already_confirming", record: copyStoredCartProposal(record) };
    }

    if (record.status === "expired") {
      return { kind: "expired", record: copyStoredCartProposal(record) };
    }

    return { kind: "invalidated", record: copyStoredCartProposal(record) };
  }

  public async markConfirmed(
    proposalId: string,
    idempotencyKey: string,
    confirmation: CartConfirmation
  ): Promise<StoredCartProposal> {
    const record = this.records.get(proposalId);
    if (record === undefined) {
      throw new AppError("PROPOSAL_NOT_FOUND", "Cart proposal was not found.", 404);
    }

    if (record.status !== "confirming" || record.confirmationIdempotencyKey !== idempotencyKey) {
      throw new AppError(
        "IDEMPOTENCY_CONFLICT",
        "Cart proposal is not claimed by this confirmation request.",
        409
      );
    }

    const confirmed: StoredCartProposal = {
      ...record,
      status: "confirmed",
      confirmation: copyCartConfirmation(confirmation)
    };
    this.records.set(proposalId, confirmed);
    return copyStoredCartProposal(confirmed);
  }

  public async markInvalidated(
    proposalId: string,
    reason: ProposalInvalidationReason
  ): Promise<StoredCartProposal> {
    const record = this.records.get(proposalId);
    if (record === undefined) {
      throw new AppError("PROPOSAL_NOT_FOUND", "Cart proposal was not found.", 404);
    }

    const invalidated: StoredCartProposal = {
      ...record,
      status: "invalidated",
      invalidationReason: reason
    };
    this.records.set(proposalId, invalidated);
    return copyStoredCartProposal(invalidated);
  }

  private expireIfNeeded(proposalId: string, now: Date): StoredCartProposal | undefined {
    const record = this.records.get(proposalId);
    if (record === undefined) {
      return undefined;
    }

    if (record.status === "pending" && isExpired(record, now)) {
      const expired: StoredCartProposal = { ...record, status: "expired" };
      this.records.set(proposalId, expired);
      return expired;
    }

    return record;
  }
}
