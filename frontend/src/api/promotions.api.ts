import apiClient, { requestData } from "./client";
import type { Promotion } from "../types/content.types";
import { promotions } from "../mocks/mock-data";
import { mockResponse, useMocks } from "../mocks/mock-api";
import { resolveAssetUrl } from "../utils/assets";
export const promotionsApi = {
  async list(): Promise<Promotion[]> {
    if (useMocks) return mockResponse(promotions);
    return (await requestData<Promotion[]>(apiClient.get("/promotions"))).map((item) => ({ ...item, imageUrl: resolveAssetUrl(item.imageUrl) }));
  },
};
