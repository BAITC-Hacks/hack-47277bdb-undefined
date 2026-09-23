import apiClient, { requestData, requestList } from "./client";
import { products, cities } from "../mocks/mock-data";
import { mockResponse, useMocks } from "../mocks/mock-api";
import type { ListResult } from "../types/api.types";
import type { Product, ProductAvailability, ProductFilters } from "../types/product.types";
import { catalogCity, normalizeAvailability, normalizeProduct, type ProductDto } from "./normalizers";

export function serializeAttributes(attributes: ProductFilters["attributes"]): string | undefined {
  if (typeof attributes === "string") return attributes.trim() || undefined;
  if (!attributes) return undefined;
  const entries = Object.entries(attributes).filter(([, value]) => value !== undefined && value !== null && value !== "");
  return entries.length ? entries.map(([key, value]) => `${key}:${String(value)}`).join(",") : undefined;
}

function listMock(filters: ProductFilters): ListResult<Product> {
  const q = filters.q?.toLowerCase().trim();
  let data = products.filter((product) => !q || `${product.name} ${product.sku} ${product.brand?.name ?? ""}`.toLowerCase().includes(q));
  if (filters.category) data = data.filter((product) => product.category.slug === filters.category);
  if (filters.brand) data = data.filter((product) => product.brand?.slug === filters.brand);
  if (filters.inStock !== undefined) data = data.filter((product) => (product.availableQuantity > 0) === filters.inStock);
  if (filters.isNew !== undefined) data = data.filter((product) => product.isNew === filters.isNew);
  if (filters.isSpecialOffer !== undefined) data = data.filter((product) => product.isSpecialOffer === filters.isSpecialOffer);
  if (filters.minPrice !== undefined) data = data.filter((product) => product.price !== null && product.price >= filters.minPrice!);
  if (filters.maxPrice !== undefined) data = data.filter((product) => product.price !== null && product.price <= filters.maxPrice!);
  const attributes = serializeAttributes(filters.attributes);
  if (attributes) {
    data = data.filter((product) => attributes.split(",").every((entry) => {
      const separator = entry.indexOf(":");
      return product.technicalSpecifications.some((spec) => spec.key === entry.slice(0, separator) && String(spec.value) === entry.slice(separator + 1));
    }));
  }
  data = [...data];
  if (filters.sort === "price_asc") data.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  if (filters.sort === "price_desc") data.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
  if (filters.sort === "name_asc") data.sort((a, b) => a.name.localeCompare(b.name));
  if (filters.sort === "name_desc") data.sort((a, b) => b.name.localeCompare(a.name));
  if (filters.sort === "popularity_asc") data.sort((a, b) => (a.popularity ?? 0) - (b.popularity ?? 0));
  if (filters.sort === "popularity_desc") data.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  if (filters.sort === "newest") data.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  return { data: data.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: data.length, totalPages: Math.ceil(data.length / limit) } };
}

function mockProduct(key: string): Product {
  const product = products.find((item) => item.slug === key || item.id === key);
  if (!product) throw Object.assign(new Error("Тауар табылмады"), { status: 404, code: "PRODUCT_NOT_FOUND" });
  return product;
}

export const productsApi = {
  async list(filters: ProductFilters = {}): Promise<ListResult<Product>> {
    if (useMocks) return mockResponse(listMock(filters));
    const { q, category, brand, inStock, isNew, isSpecialOffer, minPrice, maxPrice, sort, page, limit, lang } = filters;
    const result = await requestList<ProductDto>(apiClient.get("/products", {
      params: { q, city: catalogCity(filters.city), category, brand, inStock, isNew, isSpecialOffer, minPrice, maxPrice,
        attributes: serializeAttributes(filters.attributes), sort, page, limit, lang },
    }));
    return { ...result, data: result.data.map(normalizeProduct) };
  },
  async get(slug: string, city?: string): Promise<Product> {
    if (useMocks) return mockResponse(mockProduct(slug));
    return normalizeProduct(await requestData<ProductDto>(apiClient.get(`/products/${encodeURIComponent(slug)}`, { params: { city: catalogCity(city) } })));
  },
  async availability(id: string, city?: string): Promise<ProductAvailability> {
    if (useMocks) {
      const product = mockProduct(id);
      return mockResponse({
        productId: product.id, sku: product.sku, city: cities.find((item) => item.slug === catalogCity(city)) ?? cities[0]!,
        offer: product.price === null ? null : { id: product.id, webPrice: product.price, storePrice: product.storePrice ?? null,
          availabilityStatus: product.availabilityStatus, deliveryEstimateHours: null },
        availableQuantity: product.availableQuantity, availabilityStatus: product.availabilityStatus, warehouses: [],
      });
    }
    return normalizeAvailability(await requestData<ProductAvailability>(apiClient.get(`/products/${encodeURIComponent(id)}/availability`, { params: { city: catalogCity(city) } })));
  },
  async related(id: string, city?: string): Promise<Product[]> {
    if (useMocks) return mockResponse(products.filter((product) => product.id !== id).slice(0, 4));
    const data = await requestData<ProductDto[]>(apiClient.get(`/products/${encodeURIComponent(id)}/related`, { params: { city: catalogCity(city) } }));
    return data.map(normalizeProduct);
  },
};
