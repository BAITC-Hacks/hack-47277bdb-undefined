import apiClient, { requestData } from "./client"; import { brands } from "../mocks/mock-data"; import { mockResponse, useMocks } from "../mocks/mock-api"; import type { Brand } from "../types/brand.types";
export const brandsApi = { list: () => useMocks ? mockResponse(brands) : requestData<Brand[]>(apiClient.get("/brands")) };
