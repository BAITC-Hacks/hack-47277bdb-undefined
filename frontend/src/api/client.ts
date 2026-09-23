import axios, { AxiosError } from "axios";
import type { ApiResponse } from "../types/api.types";
import { getGuestSessionId } from "../utils/session";
import { readStorage, storageKeys } from "../utils/storage";

const apiClient = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? "/api" });

apiClient.interceptors.request.use((config) => {
  const token = readStorage(storageKeys.token);
  config.headers.Authorization = token === null ? undefined : `Bearer ${token}`;
  config.headers["X-Session-Id"] = getGuestSessionId();
  config.params = { ...config.params, lang: readStorage(storageKeys.language) ?? "kk" };
  return config;
});

export function extractApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    const payload = error.response?.data as ApiResponse<unknown> | undefined;
    if (payload !== undefined && !payload.success) return payload.error.message;
  }
  return "Сұрауды орындау мүмкін болмады. Қайталап көріңіз.";
}

export async function requestData<T>(request: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  const response = await request;
  if (!response.data.success) throw new Error(response.data.error.message);
  return response.data.data;
}

export default apiClient;
