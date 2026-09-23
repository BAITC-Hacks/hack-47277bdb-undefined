import type { Brand } from "./brand.types";
import type { Category } from "./category.types";

export type AvailabilityStatus = "IN_STOCK" | "ON_ORDER" | "OUT_OF_STOCK";

export interface TechnicalSpecification {
  key: string;
  name: string;
  value: string;
  unit?: string;
}

export interface Product {
  id: string;
  sku: string;
  supplierSku?: string;
  slug: string;
  name: string;
  shortDescription?: string;
  description?: string;
  brand: Brand;
  category: Category;
  primaryImage?: string;
  images: string[];
  price: number;
  storePrice?: number;
  availabilityStatus: AvailabilityStatus;
  availableQuantity: number;
  technicalSpecifications: TechnicalSpecification[];
  certificateUrl?: string;
  manualUrl?: string;
  isNew: boolean;
  isSpecialOffer: boolean;
  isPopular: boolean;
}

export interface ProductFilters {
  q?: string;
  city?: string;
  category?: string;
  brand?: string;
  inStock?: boolean;
  isNew?: boolean;
  isSpecialOffer?: boolean;
  minPrice?: number;
  maxPrice?: number;
  attributes?: Record<string, string | number | boolean>;
  sort?: string;
  page?: number;
  limit?: number;
  lang?: "kk" | "ru";
}

export interface CatalogFilters {
  brands: Brand[];
  minPrice?: number;
  maxPrice?: number;
  attributes: Array<{ key: string; name: string; values: string[] }>;
}
