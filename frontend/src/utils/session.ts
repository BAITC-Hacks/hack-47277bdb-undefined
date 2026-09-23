import { readStorage, storageKeys, writeStorage } from "./storage";

let memorySession: string | null = null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getGuestSessionId(): string {
  const existing = readStorage(storageKeys.session);
  if (existing && uuid.test(existing)) return existing;
  const sessionId = memorySession ?? crypto.randomUUID();
  memorySession = sessionId;
  writeStorage(storageKeys.session, sessionId);
  return sessionId;
}
