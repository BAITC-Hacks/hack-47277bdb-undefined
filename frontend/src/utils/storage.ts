export const storageKeys = {
  language: "selectedLanguage",
  city: "selectedCity",
  session: "sessionId",
  token: "authToken"
} as const;

export function readStorage(key: string): string | null {
  return window.localStorage.getItem(key);
}

export function writeStorage(key: string, value: string): void {
  window.localStorage.setItem(key, value);
}
