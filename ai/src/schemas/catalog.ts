import { z } from "zod";

/**
 * Shared runtime contracts for every catalog implementation.  The mock
 * adapter intentionally returns the same shapes as a future EKT HTTP adapter
 * so callers never need to branch on DATA_SOURCE.
 */

export const currencySchema = z.enum(["KZT", "USD", "EUR"]);
export type CatalogCurrency = z.infer<typeof currencySchema>;

export const availabilityStatusSchema = z.enum([
  "in_stock",
  "low_stock",
  "out_of_stock",
  "on_order",
  "discontinued"
]);
export type CatalogAvailabilityStatus = z.infer<typeof availabilityStatusSchema>;

export const productAttributeValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.string())
]);
export type CatalogProductAttributeValue = z.infer<typeof productAttributeValueSchema>;

export const productAttributesSchema = z.record(z.string(), productAttributeValueSchema);
export type CatalogProductAttributes = z.infer<typeof productAttributesSchema>;

export const warehouseStockSchema = z.object({
  warehouseId: z.string().min(1),
  warehouseName: z.string().min(1),
  city: z.string().min(1),
  availableQuantity: z.number().int().min(0),
  reservedQuantity: z.number().int().min(0).default(0),
  deliveryDays: z.number().int().min(0).max(60).default(0),
  updatedAt: z.string().datetime()
});
export type CatalogWarehouseStock = z.infer<typeof warehouseStockSchema>;

export const certificateTypeSchema = z.enum([
  "certificate_of_conformity",
  "declaration_of_conformity",
  "technical_passport",
  "datasheet",
  "manual"
]);
export type CatalogCertificateType = z.infer<typeof certificateTypeSchema>;

export const certificateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  documentType: z.enum(["certificate", "declaration", "passport", "manual"]),
  url: z.string().url(),
  fileId: z.string().min(1),
  issuer: z.string().min(1).optional(),
  validFrom: z.string().date().optional(),
  validUntil: z.string().date().optional(),
  isOfficial: z.boolean().default(true),
  updatedAt: z.string().datetime()
});
export type CatalogCertificate = z.infer<typeof certificateSchema>;

export const productSchema = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  supplierSku: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().min(1),
  brand: z.string().min(1),
  description: z.string().min(1),
  /** Search-only aliases, including Russian/Kazakh terms. */
  synonyms: z.array(z.string().min(1)).default([]),
  attributes: productAttributesSchema,
  technicalSpecifications: productAttributesSchema,
  certificates: z.array(certificateSchema).default([]),
  unit: z.string().min(1),
  packageSize: z.number().int().positive().default(1),
  currency: currencySchema,
  warehouseStocks: z.array(warehouseStockSchema),
  availabilityStatus: availabilityStatusSchema,
  orderable: z.boolean(),
  imageUrls: z.array(z.string().url()),
  productUrl: z.string().url(),
  relatedProductIds: z.array(z.string()).default([]),
  updatedAt: z.string().datetime(),
  /** Allows upstream catalog additions without breaking this contract. */
  extensions: z.record(z.string(), z.unknown()).default({})
});
export type CatalogProduct = z.infer<typeof productSchema>;

const catalogLocationFieldsSchema = z.object({
  city: z.string().min(1).optional(),
  warehouseId: z.string().min(1).optional()
});

const requireCatalogLocation = (
  location: { city?: string | undefined; warehouseId?: string | undefined },
  context: z.RefinementCtx
): void => {
  if (!location.city && !location.warehouseId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either city or warehouseId is required.",
      path: ["city"]
    });
  }
};

export const catalogLocationSchema =
  catalogLocationFieldsSchema.superRefine(requireCatalogLocation);
export type CatalogLocation = z.infer<typeof catalogLocationSchema>;

export const productReferenceSchema = z
  .object({
    productId: z.string().min(1).optional(),
    sku: z.string().min(1).optional(),
    supplierSku: z.string().min(1).optional(),
    slug: z.string().min(1).optional()
  })
  .superRefine((reference, context) => {
    if (!reference.productId && !reference.sku && !reference.supplierSku && !reference.slug) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one product reference is required."
      });
    }
  });
export type CatalogProductReference = z.infer<typeof productReferenceSchema>;

export const productFilterValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.string())
]);
export type CatalogProductFilterValue = z.infer<typeof productFilterValueSchema>;

export const searchProductsInputSchema = catalogLocationFieldsSchema
  .extend({
    query: z.string().trim().max(300).default(""),
    category: z.string().min(1).optional(),
    brand: z.string().min(1).optional(),
    filters: z.record(z.string(), productFilterValueSchema).default({}),
    inStockOnly: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(20)
  })
  .superRefine(requireCatalogLocation);
export type CatalogSearchProductsInput = z.infer<typeof searchProductsInputSchema>;

export const searchProductMatchSchema = z.object({
  product: productSchema,
  relevanceScore: z.number().min(0).max(1),
  matchedFields: z.array(z.string().min(1))
});
export type CatalogSearchProductMatch = z.infer<typeof searchProductMatchSchema>;

export const searchProductsResultSchema = z.object({
  items: z.array(searchProductMatchSchema),
  total: z.number().int().min(0),
  query: z.string(),
  location: catalogLocationSchema,
  source: z.enum(["mock", "live"]),
  updatedAt: z.string().datetime()
});
export type CatalogSearchProductsResult = z.infer<typeof searchProductsResultSchema>;

export const getStockInputSchema = catalogLocationFieldsSchema
  .extend({
    productId: z.string().min(1),
    requestedQuantity: z.number().int().positive().optional()
  })
  .superRefine(requireCatalogLocation);
export type GetStockInput = z.infer<typeof getStockInputSchema>;

export const stockResultSchema = z.object({
  productId: z.string().min(1),
  location: catalogLocationSchema,
  availableQuantity: z.number().int().min(0),
  warehouses: z.array(warehouseStockSchema),
  status: availabilityStatusSchema,
  canFulfillRequestedQuantity: z.boolean(),
  updatedAt: z.string().datetime(),
  source: z.enum(["mock", "live"])
});
export type CatalogStockResult = z.infer<typeof stockResultSchema>;

export const getPriceInputSchema = catalogLocationFieldsSchema
  .extend({
    productId: z.string().min(1),
    quantity: z.number().int().positive().default(1),
    customerType: z.enum(["retail", "wholesale"]).default("retail")
  })
  .superRefine(requireCatalogLocation);
export type GetPriceInput = z.infer<typeof getPriceInputSchema>;

/** Source row used by adapters before it is converted into a customer quote. */
export const catalogPriceRecordSchema = z.object({
  productId: z.string().min(1),
  city: z.string().min(1),
  warehouseId: z.string().min(1).optional(),
  currency: currencySchema,
  retailUnitPrice: z.number().nonnegative(),
  wholesaleUnitPrice: z.number().nonnegative().optional(),
  priceList: z.string().min(1),
  updatedAt: z.string().datetime(),
  validUntil: z.string().datetime().optional()
});
export type CatalogPriceRecord = z.infer<typeof catalogPriceRecordSchema>;

export const priceResultSchema = z.object({
  productId: z.string().min(1),
  location: catalogLocationSchema,
  currency: currencySchema,
  unitPrice: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  totalPrice: z.number().nonnegative(),
  customerType: z.enum(["retail", "wholesale"]),
  priceList: z.string().min(1),
  validUntil: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  source: z.enum(["mock", "live"])
});
export type CatalogPriceResult = z.infer<typeof priceResultSchema>;

export const certificatesResultSchema = z.object({
  productId: z.string().min(1),
  documents: z.array(certificateSchema),
  source: z.enum(["mock", "live"]),
  updatedAt: z.string().datetime()
});
export type CatalogCertificatesResult = z.infer<typeof certificatesResultSchema>;

export const catalogHealthSchema = z.object({
  source: z.enum(["mock", "live"]),
  healthy: z.boolean(),
  checkedAt: z.string().datetime(),
  detail: z.string().optional()
});
export type CatalogHealth = z.infer<typeof catalogHealthSchema>;
