import type { Brand } from "./brand.types";
import type { Category } from "./category.types";
import type { City } from "./city.types";

export type AvailabilityStatus = "IN_STOCK" | "ON_ORDER" | "OUT_OF_STOCK";

export interface TechnicalSpecification {
  key: string;
  name: string;
  value: string | number | boolean | null;
  type?: "TEXT" | "NUMBER" | "BOOLEAN" | "SELECT";
  unit?: string | null;
}

export interface Product {
  id: string;
  sku: string;
  supplierSku?: string | null;
  slug: string;
  name: string;
  shortDescription?: string | null;
  description?: string | null;
  unit?: string;
  brand: Brand | null;
  category: Category;
  primaryImage?: string;
  images: string[];
  price: number | null;
  storePrice?: number | null;
  availabilityStatus: AvailabilityStatus;
  availableQuantity: number;
  technicalSpecifications: TechnicalSpecification[];
  certificateUrl?: string | null;
  manualUrl?: string | null;
  deliveryEstimateHours?: number | null;
  isNew: boolean;
  isSpecialOffer: boolean;
  isPopular: boolean;
  popularity?: number;
  createdAt?: string;
}

export type ProductSort = "default" | "name_asc" | "name_desc" | "price_asc" | "price_desc" | "popularity_asc" | "popularity_desc" | "newest";

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
  attributes?: Record<string, string | number | boolean> | string;
  sort?: ProductSort;
  page?: number;
  limit?: number;
  lang?: "kk" | "ru";
}

export interface CatalogFilters {
  brands: Brand[];
  category?: Category;
  minPrice?: number;
  maxPrice?: number;
  attributes: Array<{
    key: string;
    name: string;
    type: "TEXT" | "NUMBER" | "BOOLEAN" | "SELECT";
    unit?: string | null;
    values: Array<string | number | boolean>;
  }>;
}

export interface ProductAvailability {
  productId: string;
  sku: string;
  city: City | null;
  offer: {
    id: string;
    webPrice: number;
    storePrice: number | null;
    availabilityStatus: AvailabilityStatus;
    deliveryEstimateHours: number | null;
  } | null;
  availableQuantity: number;
  availabilityStatus: AvailabilityStatus;
  warehouses: Array<{ id: string; code: string; name: string; branchId: string | null; availableQuantity: number }>;
}
