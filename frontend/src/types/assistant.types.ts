import type { Cart } from './cart.types';
import type { Product, ProductAvailability } from './product.types';

export interface AssistantChatInput {
  message: string;
  city: string;
  selectedProductId?: string;
  quantity?: number;
  pendingActionId?: string;
}

export interface AssistantPendingAction {
  id: string;
  type: 'ADD_TO_CART';
  productId: string;
  productName: string;
  quantity: number;
  city: string;
  unitPrice: number;
  expiresAt: string;
  requiresConfirmation: true;
}

export interface AssistantChatResult {
  type: 'message' | 'products' | 'product' | 'stock' | 'certificates' | 'alternatives' | 'knowledge' | 'pending_action' | 'cart';
  message: string;
  sessionId: string;
  language: 'kk' | 'ru';
  city: string | null;
  intent: string;
  mode: 'rules' | 'rules_fallback' | 'openai';
  code?: string;
  product?: Product;
  products?: Product[];
  alternatives?: Array<{ product: Product; reasons: string[]; warnings: string[]; differences: string[] }>;
  alternativeWarning?: string;
  warning?: string;
  pendingAction?: AssistantPendingAction;
  certificates?: Array<{ url: string; productId: string }>;
  manualUrl?: string | null;
  sources?: Array<{ type: string; title: string; content?: string; url?: string }>;
  availability?: ProductAvailability;
  cart?: Cart;
  cartUrl?: string;
  checkoutUrl?: string;
  confirmedActionId?: string;
}
