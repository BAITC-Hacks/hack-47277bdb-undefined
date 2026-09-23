import { readStorage, storageKeys, writeStorage } from "./storage";

export function getGuestSessionId(): string {
  const existing = readStorage(storageKeys.session);
  if (existing !== null) return existing;
  const sessionId = crypto.randomUUID();
  writeStorage(storageKeys.session, sessionId);
  return sessionId;
}
