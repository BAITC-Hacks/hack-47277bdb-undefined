import type { Brand } from "../types/brand.types";
import type { Cart } from "../types/cart.types";
import type { Category } from "../types/category.types";
import type { Order } from "../types/order.types";
import type { AvailabilityStatus, Product, ProductAvailability, TechnicalSpecification } from "../types/product.types";
import { resolveAssetUrl } from "../utils/assets";
import { readStorage, storageKeys } from "../utils/storage";

export type ApiNumber = number | string;
export interface ProductDto {
  id: string;
  sku: string;
  slug: string;
  name: string;
  supplierSku?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  unit?: string;
  brand: Brand | null;
  category: Category;
  image?: { url: string; alt?: string | null } | null;
  images?: Array<{ url: string; isPrimary?: boolean }>;
  cityOffer?: {
    webPrice: ApiNumber;
    storePrice: ApiNumber | null;
    availabilityStatus: AvailabilityStatus;
    deliveryEstimateHours?: number | null;
  } | null;
  availableQuantity?: number | null;
  availabilityStatus?: AvailabilityStatus | null;
  technicalSpecifications?: TechnicalSpecification[];
  certificateUrl?: string | null;
  manualUrl?: string | null;
  isNew?: boolean;
  isSpecialOffer?: boolean;
  isPopular?: boolean;
  popularity?: number;
  createdAt?: string;
}

export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function catalogCity(city?: string): string {
  return city?.trim() || readStorage(storageKeys.city)?.trim() || "almaty";
}

const asset = (value: string | null | undefined): string | null => resolveAssetUrl(value) || null;

export function normalizeProduct(raw: ProductDto): Product {
  const imageUrls = (raw.images ?? []).map((image) => asset(image.url)).filter((url): url is string => Boolean(url));
  const primaryImage = asset(raw.image?.url ?? raw.images?.find((image) => image.isPrimary)?.url ?? raw.images?.[0]?.url);
  return {
    id: raw.id, sku: raw.sku, slug: raw.slug, name: raw.name,
    supplierSku: raw.supplierSku, shortDescription: raw.shortDescription, description: raw.description,
    unit: raw.unit,
    brand: raw.brand ? { ...raw.brand, logoUrl: asset(raw.brand.logoUrl) } : null,
    category: raw.category,
    primaryImage: primaryImage ?? undefined,
    images: imageUrls.length ? imageUrls : primaryImage ? [primaryImage] : [],
    price: numberOrNull(raw.cityOffer?.webPrice),
    storePrice: numberOrNull(raw.cityOffer?.storePrice),
    availableQuantity: numberOrNull(raw.availableQuantity) ?? 0,
    availabilityStatus: raw.cityOffer?.availabilityStatus ?? raw.availabilityStatus ?? "OUT_OF_STOCK",
    deliveryEstimateHours: raw.cityOffer?.deliveryEstimateHours ?? null,
    technicalSpecifications: (raw.technicalSpecifications ?? []).map((specification) => ({
      ...specification,
      value: specification.type === "NUMBER" ? numberOrNull(specification.value) : specification.value,
    })),
    certificateUrl: asset(raw.certificateUrl), manualUrl: asset(raw.manualUrl),
    isNew: raw.isNew ?? false, isSpecialOffer: raw.isSpecialOffer ?? false, isPopular: raw.isPopular ?? false,
    popularity: raw.popularity, createdAt: raw.createdAt,
  };
}

export function normalizeCart(raw: Cart): Cart {
  return {
    ...raw,
    subtotal: numberOrNull(raw.subtotal) ?? 0,
    totalItemCount: Number(raw.totalItemCount),
    items: raw.items.map((item) => ({
      ...item,
      product: { ...item.product, image: asset(item.product.image) },
      unitPrice: Number(item.unitPrice), lineTotal: Number(item.lineTotal), quantity: Number(item.quantity),
      availableQuantity: Number(item.availableQuantity),
    })),
  };
}

export function normalizeOrder(raw: Order): Order {
  return {
    ...raw,
    subtotal: Number(raw.subtotal), deliveryPrice: Number(raw.deliveryPrice), total: Number(raw.total),
    items: raw.items.map((item) => ({ ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), lineTotal: Number(item.lineTotal) })),
  };
}

export function normalizeAvailability(raw: ProductAvailability): ProductAvailability {
  return {
    ...raw,
    availableQuantity: Number(raw.availableQuantity),
    offer: raw.offer ? { ...raw.offer, webPrice: Number(raw.offer.webPrice), storePrice: numberOrNull(raw.offer.storePrice) } : null,
    warehouses: raw.warehouses.map((warehouse) => ({ ...warehouse, availableQuantity: Number(warehouse.availableQuantity) })),
  };
}
