import type { City } from "./city.types";
import type { AvailabilityStatus } from "./product.types";

export interface CartProduct {
  id: string;
  sku: string;
  slug: string;
  name: string;
  unit: string;
  brand: string | null;
  category: string;
  image: string | null;
}

export interface CartItem {
  id: string;
  product: CartProduct;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  availableQuantity: number;
  availabilityStatus: AvailabilityStatus;
  warning: string | null;
}

export interface Cart {
  id: string | null;
  city: City | null;
  items: CartItem[];
  subtotal: number;
  totalItemCount: number;
  warnings: Array<{ itemId: string; productId: string; code: string }>;
}

export interface AddCartItemPayload {
  productId: string;
  quantity: number;
}
