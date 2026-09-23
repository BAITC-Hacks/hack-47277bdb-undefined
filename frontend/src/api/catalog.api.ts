import apiClient, { requestData } from "./client";
import { brands } from "../mocks/mock-data";
import { mockResponse, useMocks } from "../mocks/mock-api";
import type { CatalogFilters } from "../types/product.types";
import { catalogCity, numberOrNull } from "./normalizers";

interface FiltersDto {
  category: CatalogFilters["category"];
  brands: CatalogFilters["brands"];
  price: { min: number | string; max: number | string };
  attributes: Array<Omit<CatalogFilters["attributes"][number], "values"> & { possibleValues: Array<string | number | boolean> }>;
}

export const catalogApi = {
  async filters(slug: string, city?: string): Promise<CatalogFilters> {
    if (useMocks) return mockResponse({ brands, minPrice: 4000, maxPrice: 30000, attributes: [] });
    const raw = await requestData<FiltersDto>(apiClient.get(`/catalog/categories/${encodeURIComponent(slug)}/filters`, { params: { city: catalogCity(city) } }));
    return {
      category: raw.category, brands: raw.brands,
      minPrice: numberOrNull(raw.price.min) ?? undefined, maxPrice: numberOrNull(raw.price.max) ?? undefined,
      attributes: raw.attributes.map(({ possibleValues, ...attribute }) => ({ ...attribute, values: possibleValues })),
    };
  },
  async priceList(city?: string): Promise<Blob> {
    const response = await apiClient.get<Blob>("/catalog/price-list", { params: { city: catalogCity(city), format: "xlsx" }, responseType: "blob" });
    return response.data;
  },
};
