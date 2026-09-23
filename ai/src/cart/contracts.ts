import { z } from "zod";

import type { CustomerType } from "../types/domain.js";

export const cartProductIdSchema = z.string().trim().min(1).max(200);
export const cartQuantitySchema = z.number().int().positive().max(100_000);
export const confirmationTokenSchema = z.string().min(16).max(512);
export const idempotencyKeySchema = z.string().trim().min(1).max(200);

export const cartLineRequestSchema = z.object({
  productId: cartProductIdSchema,
  quantity: cartQuantitySchema
});

export const prepareCartProposalInputSchema = z.union([
  z.object({
    sessionId: z.string().trim().min(1).max(200),
    actorUserId: z.string().trim().min(1).max(200).optional(),
    items: z.array(cartLineRequestSchema).min(1).max(100)
  }),
  z.object({
    sessionId: z.string().trim().min(1).max(200),
    actorUserId: z.string().trim().min(1).max(200).optional(),
    productId: cartProductIdSchema,
    quantity: cartQuantitySchema
  })
]);

export const confirmCartProposalInputSchema = z.object({
  sessionId: z.string().trim().min(1).max(200),
  actorUserId: z.string().trim().min(1).max(200).optional(),
  proposalId: z.string().uuid(),
  confirmationToken: confirmationTokenSchema,
  idempotencyKey: idempotencyKeySchema
});

export interface CartLineRequest {
  readonly productId: string;
  readonly quantity: number;
}

export interface PrepareCartProposalForItemsInput {
  readonly sessionId: string;
  readonly actorUserId?: string;
  readonly items: readonly CartLineRequest[];
}

export interface PrepareCartProposalForItemInput {
  readonly sessionId: string;
  readonly actorUserId?: string;
  readonly productId: string;
  readonly quantity: number;
}

/** Supports a compact one-product request and bulk/specification proposals. */
export type PrepareCartProposalInput =
  PrepareCartProposalForItemsInput | PrepareCartProposalForItemInput;

export interface ConfirmCartProposalInput {
  readonly sessionId: string;
  readonly actorUserId?: string;
  readonly proposalId: string;
  /** Opaque capability returned once by prepare; it is never inferred from text. */
  readonly confirmationToken: string;
  /** Client-generated stable key for safely retrying a request. */
  readonly idempotencyKey: string;
}

export interface CartLocation {
  readonly city?: string;
  readonly warehouseId?: string;
}

export interface CartCatalogPriceRequest extends CartLocation {
  readonly productId: string;
  readonly quantity: number;
  readonly customerType: CustomerType;
}

export interface CartCatalogPriceResult {
  readonly productId: string;
  readonly unitPrice: number;
  readonly totalPrice: number;
  readonly currency: string;
  readonly updatedAt: string;
  readonly validUntil?: string;
}

export interface CartCatalogStockRequest extends CartLocation {
  readonly productId: string;
  readonly requestedQuantity: number;
}

export interface CartCatalogStockResult {
  readonly productId: string;
  readonly availableQuantity: number;
  readonly canFulfillRequestedQuantity: boolean;
  readonly status: string;
  readonly updatedAt: string;
  readonly orderable?: boolean;
}

/**
 * Structural boundary over the live/mock catalog. Cart code does not know how
 * catalog data is fetched, but it always obtains fresh price and stock.
 */
export interface CartCatalogPort {
  getPrice(input: CartCatalogPriceRequest): Promise<CartCatalogPriceResult | null>;
  getStock(input: CartCatalogStockRequest): Promise<CartCatalogStockResult | null>;
}

export interface CartProposalLine {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly lineTotal: number;
  readonly currency: string;
  readonly priceCheckedAt: string;
  readonly priceValidUntil?: string;
}

export interface CartStockSnapshot {
  readonly productId: string;
  readonly requestedQuantity: number;
  readonly availableQuantity: number;
  readonly status: string;
  readonly checkedAt: string;
}

export interface CartProposal {
  readonly proposalId: string;
  readonly sessionId: string;
  readonly city: string;
  readonly warehouseId?: string;
  readonly customerType: CustomerType;
  readonly currency: string;
  readonly items: readonly CartProposalLine[];
  readonly subtotal: number;
  readonly stockSnapshot: readonly CartStockSnapshot[];
  readonly createdAt: string;
  readonly expiresAt: string;
}

/** Returned by the prepare phase only. Persist the token client-side until confirmation. */
export interface PreparedCartProposal extends CartProposal {
  readonly confirmationToken: string;
}

export type CartProposalStatus = "pending" | "confirming" | "confirmed" | "invalidated" | "expired";

export interface CartMutationItem {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly lineTotal: number;
  readonly currency: string;
}

export interface AddCartItemsInput {
  readonly sessionId: string;
  readonly userId?: string;
  readonly proposalId: string;
  /** Must be forwarded to a live cart API as its idempotency key. */
  readonly idempotencyKey: string;
  readonly items: readonly CartMutationItem[];
}

export interface CartItem {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly lineTotal: number;
  readonly currency: string;
}

export interface CartSnapshot {
  readonly cartId: string;
  readonly cartUrl: string;
  readonly items: readonly CartItem[];
  readonly subtotal: number;
  readonly currency: string;
  readonly updatedAt: string;
}

/** Boundary over the actual EKT cart API. Only this adapter mutates a cart. */
export interface CartAdapter {
  addItems(input: AddCartItemsInput): Promise<CartSnapshot>;
  getCart(input: {
    readonly sessionId: string;
    readonly userId?: string;
  }): Promise<CartSnapshot | null>;
}

export interface CartConfirmation {
  readonly proposalId: string;
  readonly cartId: string;
  readonly cartUrl: string;
  readonly items: readonly CartItem[];
  readonly subtotal: number;
  readonly currency: string;
  readonly confirmedAt: string;
}
