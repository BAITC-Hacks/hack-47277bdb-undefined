import apiClient, { requestData } from "./client";
import type { FaqItem } from "../types/content.types";
import { faqs } from "../mocks/mock-data";
import { mockResponse, useMocks } from "../mocks/mock-api";
export const faqApi = { list: () => useMocks ? mockResponse(faqs) : requestData<FaqItem[]>(apiClient.get("/faqs")) };
