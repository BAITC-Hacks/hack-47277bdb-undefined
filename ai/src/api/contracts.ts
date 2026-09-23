import { z } from "zod";

const idSchema = z.string().trim().min(1).max(200);
const citySchema = z.string().trim().min(1).max(120);
const warehouseSchema = z.string().trim().min(1).max(160);

export const sessionMetadataSchema = z.object({
  sessionId: idSchema.optional(),
  city: citySchema.optional(),
  warehouseId: warehouseSchema.optional(),
  customerType: z.enum(["retail", "wholesale"]).optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  userId: idSchema.optional(),
  language: z.enum(["ru", "kk", "en"]).optional()
});

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  session: sessionMetadataSchema.optional(),
  selectedProductId: idSchema.optional(),
  selectedQuantity: z.number().int().positive().max(100_000).optional(),
  attachmentFileIds: z.array(idSchema).max(5).default([]),
  stream: z.boolean().default(false)
});

export const searchProductsQuerySchema = z.object({
  query: z.string().trim().max(300).default(""),
  city: citySchema.optional(),
  warehouseId: warehouseSchema.optional(),
  category: z.string().trim().min(1).max(200).optional(),
  brand: z.string().trim().min(1).max(200).optional(),
  inStockOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const productIdParamsSchema = z.object({ id: idSchema });

export const locationQuerySchema = z
  .object({
    city: citySchema.optional(),
    warehouseId: warehouseSchema.optional(),
    requestedQuantity: z.coerce.number().int().positive().max(100_000).optional(),
    quantity: z.coerce.number().int().positive().max(100_000).optional(),
    customerType: z.enum(["retail", "wholesale"]).default("retail")
  })
  .superRefine((value, context) => {
    if (value.city === undefined && value.warehouseId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["city"],
        message: "city or warehouseId is required"
      });
    }
  });

export const cartQuerySchema = z.object({
  sessionId: idSchema,
  userId: idSchema.optional()
});

export const fileUploadRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(200),
  contentBase64: z.string().min(1).max(14_000_000)
});

export const specificationAnalyzeRequestSchema = z.object({
  fileId: idSchema,
  city: citySchema
});

export const analysisParamsSchema = z.object({ id: idSchema });

export const handoffRequestSchema = z.object({
  sessionId: idSchema,
  customerQuestion: z.string().trim().min(1).max(4_000),
  city: citySchema.optional(),
  productReferences: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  requestedQuantity: z.number().int().positive().max(100_000).optional(),
  checkedInformation: z.array(z.string().trim().min(1).max(1_000)).max(100).default([]),
  unresolvedIssue: z.string().trim().min(1).max(2_000)
});
