import type { Product } from "./product.types";

export interface CartItem {
  id: string;
  productId: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Cart {
  id: string;
  cityId: string;
  items: CartItem[];
  subtotal: number;
  totalItems: number;
}

export interface AddCartItemPayload {
  productId: string;
  quantity: number;
}
