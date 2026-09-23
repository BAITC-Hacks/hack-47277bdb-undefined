import type {
  CatalogCertificatesResult as CatalogCertificatesResultSchema,
  CatalogCurrency as CatalogCurrencySchema,
  CatalogHealth as CatalogHealthSchema,
  CatalogPriceRecord as CatalogPriceRecordSchema,
  CatalogPriceResult as CatalogPriceResultSchema,
  CatalogProduct as CatalogProductSchema,
  CatalogProductAttributeValue as CatalogProductAttributeValueSchema,
  CatalogProductReference as CatalogProductReferenceSchema,
  CatalogSearchProductsInput as CatalogSearchProductsInputSchema,
  CatalogSearchProductsResult as CatalogSearchProductsResultSchema,
  CatalogStockResult as CatalogStockResultSchema,
  GetPriceInput,
  GetStockInput
} from "../schemas/catalog.js";

export type {
  AvailabilityStatus,
  Certificate,
  CustomerType,
  Product,
  ProductReference,
  WarehouseStock
} from "../types/domain.js";

export type CatalogDataSource = "mock" | "live";

export type CatalogCertificatesResult = CatalogCertificatesResultSchema;
export type CatalogCurrency = CatalogCurrencySchema;
export type CatalogHealth = CatalogHealthSchema;
export type CatalogPriceRecord = CatalogPriceRecordSchema;
export type CatalogPriceResult = CatalogPriceResultSchema;
export type CatalogProduct = CatalogProductSchema;
export type CatalogProductAttributeValue = CatalogProductAttributeValueSchema;
export type CatalogProductReference = CatalogProductReferenceSchema;
export type CatalogSearchProductsResult = CatalogSearchProductsResultSchema;
export type CatalogStockResult = CatalogStockResultSchema;

/** Public operation names intentionally hide Zod implementation details. */
export type CatalogSearchInput = CatalogSearchProductsInputSchema;
export type CatalogStockRequest = GetStockInput;
export type CatalogPriceRequest = GetPriceInput;

export interface CatalogAdapter {
  readonly source: CatalogDataSource;

  searchProducts(input: CatalogSearchInput): Promise<CatalogSearchProductsResult>;
  getProduct(reference: CatalogProductReference): Promise<CatalogProduct | null>;
  getStock(input: CatalogStockRequest): Promise<CatalogStockResult | null>;
  getPrice(input: CatalogPriceRequest): Promise<CatalogPriceResult | null>;
  getCertificates(productId: string): Promise<CatalogCertificatesResult | null>;
  healthCheck(): Promise<CatalogHealth>;
}
