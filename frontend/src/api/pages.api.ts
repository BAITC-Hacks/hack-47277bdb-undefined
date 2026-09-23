import apiClient, { requestData } from "./client";
import type { ContentPage } from "../types/content.types";
export const pagesApi = { get: (slug: string) => requestData<ContentPage>(apiClient.get(`/pages/${encodeURIComponent(slug)}`)) };
