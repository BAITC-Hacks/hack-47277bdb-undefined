export type CustomerType = "PERSON" | "COMPANY";
export type DeliveryMethod = "PICKUP" | "DELIVERY";
export type PaymentMethod = "ONLINE_CARD" | "CASH_ON_DELIVERY" | "POS_ON_PICKUP" | "BANK_TRANSFER";

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
  status: string;
  createdAt: string;
  total: number;
}
