export type CustomerType = "PERSON" | "COMPANY";
export type DeliveryMethod = "PICKUP" | "DELIVERY";
export type PaymentMethod = "ONLINE_CARD" | "CASH_ON_DELIVERY" | "POS_ON_PICKUP" | "BANK_TRANSFER";
export type OrderStatus = "NEW" | "CONFIRMED" | "PROCESSING" | "READY" | "SHIPPED" | "COMPLETED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "REFUNDED";

export interface OrderPayload {
  customerName: string;
  phone: string;
  email: string;
  customerType: CustomerType;
  companyName?: string;
  bin?: string;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethod;
  deliveryAddress?: string;
  comment?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  city: { id: string; slug: string; name: string };
  customerName: string;
  phone: string;
  email: string;
  customerType: CustomerType;
  companyName: string | null;
  bin: string | null;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethod;
  deliveryAddress: string | null;
  comment: string | null;
  subtotal: number;
  deliveryPrice: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    productId: string;
    productSlug: string;
    productName: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
}

export interface OneClickOrderPayload {
  productId: string;
  cityId: string;
  quantity: number;
  customerName: string;
  phone: string;
  email?: string;
}
export interface OneClickOrder extends Omit<OneClickOrderPayload, "email"> {
  id: string;
  email: string | null;
  status: "NEW" | "CONTACTED" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
}
