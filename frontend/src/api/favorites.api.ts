import apiClient, { requestData, requestVoid } from "./client";
import { mockResponse, useMocks } from "../mocks/mock-api";
import { products } from "../mocks/mock-data";
import type { Product } from "../types/product.types";
import { hydrateSavedProducts } from "./saved-products";

interface FavoriteDto { id: string; createdAt: string; product: { id: string; slug: string }; }
let ids: string[] = [];
export const favoritesApi = {
  async list(city?: string): Promise<Product[]> {
    if (useMocks) return mockResponse(products.filter((product) => ids.includes(product.id)));
    const favorites = await requestData<FavoriteDto[]>(apiClient.get("/favorites"));
    return hydrateSavedProducts(favorites.map(({ product }) => product), city);
  },
  async add(productId: string): Promise<void> {
    if (!useMocks) return requestVoid(apiClient.post(`/favorites/${encodeURIComponent(productId)}`));
    ids = [...new Set([...ids, productId])];
    return mockResponse(undefined);
  },
  async remove(productId: string): Promise<void> {
    if (!useMocks) return requestVoid(apiClient.delete(`/favorites/${encodeURIComponent(productId)}`));
    ids = ids.filter((id) => id !== productId);
    return mockResponse(undefined);
  },
};
