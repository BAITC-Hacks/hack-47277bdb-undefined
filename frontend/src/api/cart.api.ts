import apiClient, { requestData, requestVoid } from "./client";
import { initialCart, products, cities } from "../mocks/mock-data";
import { mockResponse, useMocks } from "../mocks/mock-api";
import type { AddCartItemPayload, Cart } from "../types/cart.types";
import { normalizeCart } from "./normalizers";

let mockCart: Cart = structuredClone(initialCart);
const totals = (): Cart => ({
  ...mockCart,
  subtotal: mockCart.items.reduce((sum, item) => sum + item.lineTotal, 0),
  totalItemCount: mockCart.items.reduce((sum, item) => sum + item.quantity, 0),
});
const mockQuantity = (quantity: number, available: number) => {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > available) throw new Error("Қоймадағы қолжетімді тауар саны жеткіліксіз");
};

export const cartApi = {
  async get(): Promise<Cart> {
    if (useMocks) return mockResponse(totals());
    return normalizeCart(await requestData<Cart>(apiClient.get("/cart")));
  },
  async addItem({ productId, quantity }: AddCartItemPayload): Promise<Cart> {
    if (!useMocks) return normalizeCart(await requestData<Cart>(apiClient.post("/cart/items", { productId, quantity })));
    const product = products.find((item) => item.id === productId);
    if (!product || product.price === null) throw new Error("Бұл қалада тауар ұсынылмайды");
    const found = mockCart.items.find((item) => item.product.id === productId);
    const requested = (found?.quantity ?? 0) + quantity;
    mockQuantity(requested, product.availableQuantity);
    if (found) {
      mockCart.items = mockCart.items.map((item) => item.id === found.id ? { ...item, quantity: requested, lineTotal: item.unitPrice * requested } : item);
    } else {
      mockCart.items = [...mockCart.items, {
        id: crypto.randomUUID(),
        product: { id: product.id, sku: product.sku, slug: product.slug, name: product.name, unit: product.unit ?? "дана",
          brand: product.brand?.name ?? null, category: product.category.name, image: product.primaryImage ?? null },
        quantity, unitPrice: product.price, lineTotal: product.price * quantity,
        availableQuantity: product.availableQuantity, availabilityStatus: product.availabilityStatus, warning: null,
      }];
    }
    return mockResponse(totals());
  },
  async updateItem(itemId: string, quantity: number): Promise<Cart> {
    if (!useMocks) return normalizeCart(await requestData<Cart>(apiClient.patch(`/cart/items/${encodeURIComponent(itemId)}`, { quantity })));
    const found = mockCart.items.find((item) => item.id === itemId);
    if (!found) throw new Error("Себеттегі тауар табылмады");
    mockQuantity(quantity, found.availableQuantity);
    mockCart.items = mockCart.items.map((item) => item.id === itemId ? { ...item, quantity, lineTotal: item.unitPrice * quantity } : item);
    return mockResponse(totals());
  },
  async removeItem(itemId: string): Promise<Cart> {
    if (!useMocks) return normalizeCart(await requestData<Cart>(apiClient.delete(`/cart/items/${encodeURIComponent(itemId)}`)));
    mockCart.items = mockCart.items.filter((item) => item.id !== itemId);
    return mockResponse(totals());
  },
  async clear(): Promise<void> {
    if (!useMocks) return requestVoid(apiClient.delete("/cart"));
    mockCart = { ...mockCart, items: [] };
    return mockResponse(undefined);
  },
  async setCity(cityId: string): Promise<Cart> {
    if (!useMocks) return normalizeCart(await requestData<Cart>(apiClient.patch("/cart/city", { cityId })));
    const city = cities.find((item) => item.id === cityId);
    if (!city) throw new Error("Қала табылмады");
    mockCart = { ...mockCart, city };
    return mockResponse(totals());
  },
};
