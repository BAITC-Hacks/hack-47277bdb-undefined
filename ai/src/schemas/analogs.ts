import { z } from "zod";

import { productAttributeValueSchema } from "./catalog.js";

export const analogSearchInputSchema = z
  .object({
    sourceProductId: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    warehouseId: z.string().min(1).optional(),
    quantity: z.number().int().positive().max(100_000).default(1),
    requiredCharacteristics: z.record(z.string().min(1), productAttributeValueSchema).default({}),
    preferredBrand: z.string().min(1).optional(),
    maxResults: z.number().int().min(1).max(20).default(5),
    includeExcluded: z.boolean().default(false)
  })
  .superRefine((input, context) => {
    if (!input.city && !input.warehouseId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either city or warehouseId is required for analog selection.",
        path: ["city"]
      });
    }

    const hasRequirementSearch =
      Boolean(input.category) && Object.keys(input.requiredCharacteristics).length > 0;
    if (!input.sourceProductId && !hasRequirementSearch) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sourceProductId or both category and requiredCharacteristics are required.",
        path: ["sourceProductId"]
      });
    }
  });

export type ParsedAnalogSearchInput = z.infer<typeof analogSearchInputSchema>;
