import apiClient, { requestData } from "./client";
import { mockResponse, useMocks } from "../mocks/mock-api";
import { cities } from "../mocks/mock-data";
import type { OneClickOrder, OneClickOrderPayload, Order, OrderPayload } from "../types/order.types";
import { normalizeOrder } from "./normalizers";
import { cartApi } from "./cart.api";

let orders: Order[] = [];
export const ordersApi = {
  async create(payload: OrderPayload): Promise<Order> {
    const { customerName, phone, email, customerType, companyName, bin, deliveryMethod, paymentMethod, deliveryAddress, comment } = payload;
    const body = { customerName, phone, email, customerType, companyName, bin, deliveryMethod, paymentMethod, deliveryAddress, comment };
    if (!useMocks) return normalizeOrder(await requestData<Order>(apiClient.post("/orders", body)));
    const cart = await cartApi.get();
    if (!cart.items.length) throw new Error("Себет бос");
    const now = new Date().toISOString();
    const order: Order = {
      ...body, id: crypto.randomUUID(), orderNumber: `DEMO-${Date.now()}`, city: cart.city ?? cities[0]!,
      companyName: companyName || null, bin: bin || null, deliveryAddress: deliveryAddress || null, comment: comment || null,
      subtotal: cart.subtotal, deliveryPrice: 0, total: cart.subtotal, status: "NEW", paymentStatus: "UNPAID", createdAt: now, updatedAt: now,
      items: cart.items.map((item) => ({ id: item.id, productId: item.product.id, productSlug: item.product.slug,
        productName: item.product.name, sku: item.product.sku, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal })),
    };
    orders = [order, ...orders];
    await cartApi.clear();
    return mockResponse(order);
  },
  async list(): Promise<Order[]> {
    if (useMocks) return mockResponse(orders);
    return (await requestData<Order[]>(apiClient.get("/orders/me"))).map(normalizeOrder);
  },
  async get(id: string): Promise<Order> {
    if (useMocks) {
      const order = orders.find((item) => item.id === id);
      if (!order) throw Object.assign(new Error("Тапсырыс табылмады"), { status: 404 });
      return mockResponse(order);
    }
    return normalizeOrder(await requestData<Order>(apiClient.get(`/orders/${encodeURIComponent(id)}`)));
  },
  async oneClick({ productId, cityId, quantity, customerName, phone, email }: OneClickOrderPayload): Promise<OneClickOrder> {
    const body = { productId, cityId, quantity, customerName, phone, email };
    if (!useMocks) return requestData<OneClickOrder>(apiClient.post("/one-click-orders", body));
    return mockResponse({ ...body, email: email || null, id: crypto.randomUUID(), status: "NEW",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  },
};
