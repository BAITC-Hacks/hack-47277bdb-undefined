import apiClient, { requestData } from "./client";
import { categories } from "../mocks/mock-data";
import { mockResponse, useMocks } from "../mocks/mock-api";
import type { Category } from "../types/category.types";
import { resolveAssetUrl } from "../utils/assets";

const normalize = (category: Category): Category => ({ ...category, imageUrl: resolveAssetUrl(category.imageUrl), children: category.children?.map(normalize) });
export const categoriesApi = {
  async list(): Promise<Category[]> {
    if (useMocks) return mockResponse(categories);
    return (await requestData<Category[]>(apiClient.get("/categories"))).map(normalize);
  },
  async tree(): Promise<Category[]> {
    if (useMocks) return mockResponse(categories);
    return (await requestData<Category[]>(apiClient.get("/categories/tree"))).map(normalize);
  },
  async get(slug: string): Promise<Category> {
    if (useMocks) {
      const category = categories.find((item) => item.slug === slug);
      if (!category) throw Object.assign(new Error("Санат табылмады"), { status: 404 });
      return mockResponse(category);
    }
    return normalize(await requestData<Category>(apiClient.get(`/categories/${encodeURIComponent(slug)}`)));
  },
};
