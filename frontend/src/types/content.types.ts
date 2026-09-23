export interface Promotion {
  id: string;
  slug?: string;
  title: string;
  description: string | null;
  imageUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
}
export interface NewsArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  publishedAt: string;
  imageUrl?: string | null;
}
export interface FaqItem { id: string; question: string; answer: string; }
export interface ContentPage { id: string; slug: string; title: string; content: string; }
export type RequestType = "GENERAL" | "CALLBACK" | "B2B" | "CUSTOM_PANEL" | "COOPERATION";
export interface CustomerRequestPayload {
  type?: RequestType;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  message?: string;
}
export interface CustomerRequest extends Omit<CustomerRequestPayload, "email" | "company" | "message"> {
  id: string;
  email: string | null;
  company: string | null;
  message: string | null;
  status: "NEW" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
}
