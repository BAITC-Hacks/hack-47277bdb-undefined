import { AppError } from "../errors/app-error.js";
import { copySession, type ConversationSession, type SessionStore } from "./session.js";

/**
 * Development/test store. Production uses the PostgreSQL SessionStore
 * without changing callers. Expired records are never returned.
 */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, ConversationSession>();
  private readonly now: () => Date;

  public constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  public async create(session: ConversationSession): Promise<void> {
    if (this.sessions.has(session.sessionId)) {
      throw new AppError("IDEMPOTENCY_CONFLICT", "Session ID already exists.", 409);
    }

    this.sessions.set(session.sessionId, copySession(session));
  }

  public async get(sessionId: string): Promise<ConversationSession | undefined> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      return undefined;
    }

    if (Date.parse(session.expiresAt) <= this.now().getTime()) {
      this.sessions.delete(sessionId);
      return undefined;
    }

    return copySession(session);
  }

  public async replace(session: ConversationSession): Promise<void> {
    this.sessions.set(session.sessionId, copySession(session));
  }

  public async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}
