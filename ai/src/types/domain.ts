/** JSON values accepted in extensible catalog attributes and audit payloads. */
export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type Language = "ru" | "kk" | "en";
export type CustomerType = "retail" | "wholesale";
export type AvailabilityStatus =
  "in_stock" | "low_stock" | "out_of_stock" | "on_order" | "discontinued";

export interface Certificate {
  readonly id: string;
  readonly name: string;
  readonly documentType: "certificate" | "declaration" | "passport" | "manual";
  readonly url: string;
  readonly validUntil?: string;
}

export interface WarehouseStock {
  readonly warehouseId: string;
  readonly city: string;
  readonly availableQuantity: number;
  readonly reservedQuantity: number;
  readonly updatedAt: string;
}

/** A city-independent product record. Price and availability are retrieved separately. */
export interface Product {
  readonly id: string;
  readonly sku: string;
  readonly supplierSku: string;
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly subcategory: string;
  readonly brand: string;
  readonly description: string;
  readonly attributes: JsonObject;
  readonly technicalSpecifications: JsonObject;
  readonly certificates: readonly Certificate[];
  readonly unit: string;
  readonly packageSize: number;
  readonly currency: string;
  readonly imageUrls: readonly string[];
  readonly productUrl: string;
  readonly relatedProductIds: readonly string[];
  readonly updatedAt: string;
}

export interface PriceQuote {
  readonly productId: string;
  readonly city: string;
  readonly currency: string;
  readonly unitPrice: number;
  readonly quotedAt: string;
  readonly expiresAt: string;
}

export interface StockResult {
  readonly productId: string;
  readonly city: string;
  readonly availableQuantity: number;
  readonly warehouses: readonly WarehouseStock[];
  readonly status: AvailabilityStatus;
  readonly canFulfillRequestedQuantity: boolean;
  readonly checkedAt: string;
}

export interface ProductView {
  readonly product: Product;
  readonly price?: PriceQuote;
  readonly stock?: StockResult;
}

export interface SearchProductsInput {
  readonly query: string;
  readonly city?: string;
  readonly category?: string;
  readonly brand?: string;
  readonly filters?: Readonly<Record<string, string | number | boolean>>;
  readonly inStockOnly?: boolean;
  readonly limit: number;
}

export interface SessionContext {
  readonly sessionId: string;
  readonly language: Language;
  readonly city?: string;
  readonly warehouseId?: string;
  readonly customerType: CustomerType;
  readonly currency: string;
  readonly userId?: string;
  readonly recentlyViewedProductIds: readonly string[];
  readonly activeProposalId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type Intent =
  | "PRODUCT_SEARCH"
  | "PRODUCT_DETAILS"
  | "STOCK_CHECK"
  | "PRICE_CHECK"
  | "CERTIFICATE_SEARCH"
  | "ANALOG_SEARCH"
  | "PRODUCT_COMPARE"
  | "PURCHASE_TERMS"
  | "DELIVERY_INFO"
  | "PAYMENT_INFO"
  | "RETURN_INFO"
  | "ADD_TO_CART_INTENT"
  | "CART_CONFIRMATION"
  | "CART_VIEW"
  | "FILE_SPECIFICATION"
  | "IMAGE_PRODUCT_SEARCH"
  | "RELATED_PRODUCTS"
  | "MANAGER_HANDOFF"
  | "GENERAL_SUPPORT";

export interface ProductReference {
  readonly id?: string;
  readonly sku?: string;
  readonly supplierSku?: string;
  readonly slug?: string;
}

export interface AuditEvent {
  readonly id: string;
  readonly occurredAt: string;
  readonly requestId: string;
  readonly sessionId?: string;
  readonly eventType: string;
  readonly actor: "customer" | "system" | "manager";
  readonly payload: JsonObject;
}
