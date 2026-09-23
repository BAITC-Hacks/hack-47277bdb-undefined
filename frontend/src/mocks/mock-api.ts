// Mocks are an explicit development-only option, never a production fallback.
export const useMocks = import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === "true";

export async function mockResponse<T>(value: T): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  return structuredClone(value);
}
