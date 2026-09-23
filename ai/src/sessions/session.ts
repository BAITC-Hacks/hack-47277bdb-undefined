import { randomUUID } from "node:crypto";

import { z } from "zod";

import { AppError } from "../errors/app-error.js";
import type { CustomerType, Language, SessionContext } from "../types/domain.js";

export const sessionIdSchema = z.string().trim().min(1).max(200);
export const userIdSchema = z.string().trim().min(1).max(200);
export const citySchema = z.string().trim().min(1).max(120);
export const warehouseIdSchema = z.string().trim().min(1).max(160);
export const currencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/);

export const languageSchema = z.enum(["ru", "kk", "en"]);
export const customerTypeSchema = z.enum(["retail", "wholesale"]);

const productIdListSchema = z.array(z.string().trim().min(1).max(200)).max(50);

export const createSessionInputSchema = z.object({
  language: languageSchema.default("ru"),
  city: citySchema.optional(),
  warehouseId: warehouseIdSchema.optional(),
  customerType: customerTypeSchema.default("retail"),
  currency: currencyCodeSchema.default("KZT"),
  userId: userIdSchema.optional()
});

export const updateSessionInputSchema = z.object({
  language: languageSchema.optional(),
  city: citySchema.nullable().optional(),
  warehouseId: warehouseIdSchema.nullable().optional(),
  customerType: customerTypeSchema.optional(),
  currency: currencyCodeSchema.optional(),
  recentlyViewedProductIds: productIdListSchema.optional()
});

export interface CreateSessionInput {
  readonly language?: Language;
  readonly city?: string;
  readonly warehouseId?: string;
  readonly customerType?: CustomerType;
  readonly currency?: string;
  readonly userId?: string;
}

export interface UpdateSessionInput {
  readonly language?: Language;
  /** `null` removes a previously selected city. */
  readonly city?: string | null;
  /** `null` removes a previously selected warehouse. */
  readonly warehouseId?: string | null;
  readonly customerType?: CustomerType;
  readonly currency?: string;
  readonly recentlyViewedProductIds?: readonly string[];
}

/**
 * The session record is intentionally small and contains no untrusted prompt
 * text. Its identity and location are the authority for cart proposals.
 */
export interface ConversationSession extends SessionContext {
  readonly expiresAt: string;
}

export interface SessionStore {
  create(session: ConversationSession): Promise<void>;
  get(sessionId: string): Promise<ConversationSession | undefined>;
  replace(session: ConversationSession): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

export interface SessionServiceOptions {
  readonly store: SessionStore;
  readonly ttlMs?: number;
  readonly now?: () => Date;
  readonly idGenerator?: () => string;
}

export const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1_000;

function isoAfter(now: Date, ttlMs: number): string {
  return new Date(now.getTime() + ttlMs).toISOString();
}

function optionalProperty<T>(key: string, value: T | undefined): Readonly<Record<string, T>> {
  return value === undefined ? {} : { [key]: value };
}

/** Returns an immutable-looking copy without retaining mutable array input. */
export function copySession(session: ConversationSession): ConversationSession {
  return {
    sessionId: session.sessionId,
    language: session.language,
    customerType: session.customerType,
    currency: session.currency,
    recentlyViewedProductIds: [...session.recentlyViewedProductIds],
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    ...optionalProperty("city", session.city),
    ...optionalProperty("warehouseId", session.warehouseId),
    ...optionalProperty("userId", session.userId),
    ...optionalProperty("activeProposalId", session.activeProposalId)
  };
}

/**
 * Session service owns creation, expiry and identity binding. An authenticated
 * caller must present the same user ID that the session was created with;
 * anonymous sessions are bound to the unguessable session ID alone.
 */
export class SessionService {
  private readonly store: SessionStore;
  private readonly ttlMs: number;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;

  public constructor(options: SessionServiceOptions) {
    this.store = options.store;
    this.ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? randomUUID;

    if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs <= 0) {
      throw new RangeError("Session TTL must be a positive integer number of milliseconds.");
    }
  }

  public async create(input: CreateSessionInput = {}): Promise<ConversationSession> {
    const parsed = createSessionInputSchema.parse(input);
    const now = this.now();
    const sessionId = sessionIdSchema.parse(this.idGenerator());

    const session: ConversationSession = {
      sessionId,
      language: parsed.language,
      customerType: parsed.customerType,
      currency: parsed.currency,
      recentlyViewedProductIds: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: isoAfter(now, this.ttlMs),
      ...optionalProperty("city", parsed.city),
      ...optionalProperty("warehouseId", parsed.warehouseId),
      ...optionalProperty("userId", parsed.userId)
    };

    await this.store.create(session);
    return copySession(session);
  }

  public async getSession(sessionId: string): Promise<ConversationSession | undefined> {
    sessionIdSchema.parse(sessionId);
    const session = await this.store.get(sessionId);
    return session === undefined ? undefined : copySession(session);
  }

  public async requireSession(sessionId: string): Promise<ConversationSession> {
    const session = await this.getSession(sessionId);
    if (session === undefined) {
      throw new AppError("NOT_FOUND", "Session was not found or has expired.", 404);
    }

    return session;
  }

  public assertOwnership(session: ConversationSession, actorUserId?: string): void {
    if (session.userId !== actorUserId) {
      throw new AppError(
        "PROPOSAL_OWNERSHIP_MISMATCH",
        "The session does not belong to this customer.",
        403
      );
    }
  }

  public async update(
    sessionId: string,
    input: UpdateSessionInput,
    actorUserId?: string
  ): Promise<ConversationSession> {
    const parsed = updateSessionInputSchema.parse(input);
    const current = await this.requireSession(sessionId);
    this.assertOwnership(current, actorUserId);
    const now = this.now();

    const city = parsed.city === undefined ? current.city : (parsed.city ?? undefined);
    const warehouseId =
      parsed.warehouseId === undefined ? current.warehouseId : (parsed.warehouseId ?? undefined);

    const next: ConversationSession = {
      sessionId: current.sessionId,
      language: parsed.language ?? current.language,
      customerType: parsed.customerType ?? current.customerType,
      currency: parsed.currency ?? current.currency,
      recentlyViewedProductIds:
        parsed.recentlyViewedProductIds === undefined
          ? [...current.recentlyViewedProductIds]
          : [...parsed.recentlyViewedProductIds],
      createdAt: current.createdAt,
      updatedAt: now.toISOString(),
      expiresAt: isoAfter(now, this.ttlMs),
      ...optionalProperty("city", city),
      ...optionalProperty("warehouseId", warehouseId),
      ...optionalProperty("userId", current.userId),
      ...optionalProperty("activeProposalId", current.activeProposalId)
    };

    await this.store.replace(next);
    return copySession(next);
  }

  public async setActiveProposal(
    sessionId: string,
    proposalId: string | undefined
  ): Promise<ConversationSession> {
    const current = await this.requireSession(sessionId);
    const now = this.now();
    const next: ConversationSession = {
      sessionId: current.sessionId,
      language: current.language,
      customerType: current.customerType,
      currency: current.currency,
      recentlyViewedProductIds: [...current.recentlyViewedProductIds],
      createdAt: current.createdAt,
      updatedAt: now.toISOString(),
      expiresAt: isoAfter(now, this.ttlMs),
      ...optionalProperty("city", current.city),
      ...optionalProperty("warehouseId", current.warehouseId),
      ...optionalProperty("userId", current.userId),
      ...optionalProperty("activeProposalId", proposalId)
    };

    await this.store.replace(next);
    return copySession(next);
  }
}
