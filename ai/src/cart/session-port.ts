import type { CustomerType } from "../types/domain.js";

/**
 * Minimal read-only session boundary required by cart orchestration. Session
 * implementations may contain more conversation state without leaking it here.
 */
export interface CartSession {
  readonly sessionId: string;
  readonly userId?: string;
  readonly city?: string;
  readonly warehouseId?: string;
  readonly customerType: CustomerType;
  readonly currency: string;
}

export interface CartSessionPort {
  getSession(sessionId: string): Promise<CartSession | undefined>;
  setActiveProposal?(sessionId: string, proposalId: string | undefined): Promise<unknown>;
}
