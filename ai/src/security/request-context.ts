import { randomUUID } from "node:crypto";

export interface RequestContext {
  readonly requestId: string;
  readonly receivedAt: string;
}

export function createRequestContext(requestId?: string): RequestContext {
  return {
    requestId: requestId ?? randomUUID(),
    receivedAt: new Date().toISOString()
  };
}
