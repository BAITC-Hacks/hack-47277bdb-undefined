import axios, { type AxiosResponse } from 'axios';
import type { ApiResponse, ListResult } from '../types/api.types';
import { getGuestSessionId } from '../utils/session';
import { readStorage, storageKeys, writeStorage } from '../utils/storage';

export const AUTH_INVALIDATED_EVENT = 'ekt:auth-invalidated';
const apiClient = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, ''),
  timeout: 15000,
});

export function cleanQueryParams(params: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, value]) =>
    value !== undefined && value !== null && value !== '' && value !== 'undefined' && value !== 'null'));
}

apiClient.interceptors.request.use((config) => {
  const token = readStorage(storageKeys.token)?.trim();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  else delete config.headers.Authorization;
  config.headers['X-Session-Id'] = getGuestSessionId();
  config.headers['Accept-Language'] = readStorage(storageKeys.language) === 'ru' ? 'ru' : 'kk';
  config.params = cleanQueryParams(config.params);
  return config;
}, undefined, { synchronous: true });

apiClient.interceptors.response.use((response) => response, async (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob && error.response.data.type.includes('json')) {
    try { error.response.data = JSON.parse(await error.response.data.text()); }
    catch { /* Preserve the original error if a proxy returned an invalid body. */ }
  }
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    const sent = error.config?.headers?.Authorization;
    const current = readStorage(storageKeys.token);
    const isLogin = /\/auth\/(login|register)$/.test(error.config?.url || '');
    // A late response for an older identity must not log out a newly signed-in user.
    if (!isLogin && current && sent === `Bearer ${current}`) {
      writeStorage(storageKeys.token, '');
      window.dispatchEvent(new Event(AUTH_INVALIDATED_EVENT));
    }
  }
  return Promise.reject(error);
});

export function getApiErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

export function extractApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data;
    if (payload && typeof payload === 'object' && typeof payload.error?.message === 'string') {
      return payload.error.message;
    }
    if (!error.response) return 'Серверге қосылу мүмкін болмады. Байланысты тексеріп, қайталап көріңіз.';
    if (error.response.status === 401) return 'Жүйеге қайта кіріңіз.';
    if (error.response.status === 403) return 'Бұл әрекетке рұқсат жоқ.';
    if (error.response.status === 404) return 'Сұралған дерек табылмады.';
    return 'Сұрауды орындау мүмкін болмады. Қайталап көріңіз.';
  }
  return error instanceof Error ? error.message : 'Сұрауды орындау мүмкін болмады. Қайталап көріңіз.';
}

export async function requestData<T>(request: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  const { data: body } = await request;
  if (!body || typeof body.success !== 'boolean') throw new Error('Сервер жауабының пішімі дұрыс емес.');
  if (!body.success) throw new Error(body.error.message);
  return body.data;
}

export async function requestList<T>(request: Promise<AxiosResponse<ApiResponse<T[]>>>): Promise<ListResult<T>> {
  const { data: body } = await request;
  if (!body || !body.success) throw new Error(body && !body.success ? body.error.message : 'Сервер жауабының пішімі дұрыс емес.');
  if (!Array.isArray(body.data) || !body.pagination) throw new Error('Сервердің pagination жауабы дұрыс емес.');
  return { data: body.data, pagination: body.pagination };
}

export async function requestVoid(request: Promise<AxiosResponse<unknown>>): Promise<void> {
  await request; // HTTP 204 intentionally has no JSON body.
}

export default apiClient;
