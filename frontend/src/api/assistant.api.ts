import apiClient, { requestData } from './client';
import { normalizeAvailability, normalizeCart, normalizeProduct, type ProductDto } from './normalizers';
import type { AssistantChatInput, AssistantChatResult } from '../types/assistant.types';
import { resolveAssetUrl } from '../utils/assets';

type AssistantDto = Omit<AssistantChatResult, 'product' | 'products' | 'alternatives'> & {
  product?: ProductDto;
  products?: ProductDto[];
  alternatives?: Array<{ product: ProductDto; reasons: string[]; warnings: string[]; differences: string[] }>;
};

export const assistantApi = {
  async chat(input: AssistantChatInput, signal?: AbortSignal): Promise<AssistantChatResult> {
    // Same backend, JWT, language and guest/cart UUID as every other API call.
    // Never accept a second AI base URL, browser API key or model-generated price.
    const raw = await requestData<AssistantDto>(apiClient.post('/assistant/chat', input, { signal }));
    return {
      ...raw,
      product: raw.product ? normalizeProduct(raw.product) : undefined,
      products: raw.products?.map(normalizeProduct),
      alternatives: raw.alternatives?.map((item) => ({ ...item, product: normalizeProduct(item.product) })),
      cart: raw.cart ? normalizeCart(raw.cart) : undefined,
      availability: raw.availability ? normalizeAvailability(raw.availability) : undefined,
      certificates: raw.certificates?.flatMap((item) => {
        const url = resolveAssetUrl(item.url);
        return url ? [{ ...item, url }] : [];
      }),
      manualUrl: resolveAssetUrl(raw.manualUrl),
    };
  },
};
