import apiClient, { requestData } from "./client";
import { brands } from "../mocks/mock-data";
import { mockResponse, useMocks } from "../mocks/mock-api";
import type { Brand } from "../types/brand.types";
import { resolveAssetUrl } from "../utils/assets";
export const brandsApi = {
  async list(): Promise<Brand[]> {
    if (useMocks) return mockResponse(brands);
    return (await requestData<Brand[]>(apiClient.get("/brands"))).map((brand) => ({ ...brand, logoUrl: resolveAssetUrl(brand.logoUrl) }));
  },
};
