export const storageKeys = {
  language: "selectedLanguage",
  city: "selectedCity",
  session: "sessionId",
  token: "authToken"
} as const;

const fallback = new Map<string, string>();
let persistenceUnavailable = false;

export function readStorage(key: string): string | null {
  if (persistenceUnavailable) return fallback.get(key) ?? null;
  try {
    const value = window.localStorage.getItem(key);
    if (value === null) fallback.delete(key); else fallback.set(key, value);
    return value;
  } catch { persistenceUnavailable = true; return fallback.get(key) ?? null; }
}

export function writeStorage(key: string, value: string): void {
  if (value) fallback.set(key, value); else fallback.delete(key);
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch { persistenceUnavailable = true; }
}
