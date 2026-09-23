import apiClient, { requestData, requestVoid } from "./client";
import { mockResponse, useMocks } from "../mocks/mock-api";
import { products } from "../mocks/mock-data";
import type { Product, TechnicalSpecification } from "../types/product.types";
import { hydrateSavedProducts } from "./saved-products";

export interface ComparisonDto {
  products: Array<{ id: string; slug: string }>;
  attributes: Array<Omit<TechnicalSpecification, "value"> & { values: Record<string, TechnicalSpecification["value"]> }>;
  count: number;
  maximum: number;
}
let ids: string[] = [];
export const comparisonApi = {
  async list(city?: string): Promise<Product[]> {
    if (useMocks) return mockResponse(products.filter((product) => ids.includes(product.id)));
    const comparison = await requestData<ComparisonDto>(apiClient.get("/comparison"));
    const hydrated = await hydrateSavedProducts(comparison.products, city);
    return hydrated.map((product) => ({
      ...product,
      technicalSpecifications: comparison.attributes.filter(({ values }) => Object.hasOwn(values, product.id))
        .map(({ values, ...attribute }) => ({ ...attribute, value: values[product.id] ?? null })),
    }));
  },
  async add(productId: string): Promise<void> {
    if (!useMocks) return requestVoid(apiClient.post(`/comparison/${encodeURIComponent(productId)}`));
    if (!ids.includes(productId) && ids.length >= 4) throw new Error("Салыстыруға ең көбі 4 тауар қосуға болады");
    ids = [...new Set([...ids, productId])];
    return mockResponse(undefined);
  },
  async remove(productId: string): Promise<void> {
    if (!useMocks) return requestVoid(apiClient.delete(`/comparison/${encodeURIComponent(productId)}`));
    ids = ids.filter((id) => id !== productId);
    return mockResponse(undefined);
  },
  async clear(): Promise<void> {
    if (!useMocks) return requestVoid(apiClient.delete("/comparison"));
    ids = [];
    return mockResponse(undefined);
  },
};
