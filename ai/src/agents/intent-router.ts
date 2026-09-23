import { z } from "zod";
import type { Intent, Language } from "../types/domain.js";

export const intentSchema = z.enum([
  "PRODUCT_SEARCH",
  "PRODUCT_DETAILS",
  "STOCK_CHECK",
  "PRICE_CHECK",
  "CERTIFICATE_SEARCH",
  "ANALOG_SEARCH",
  "PRODUCT_COMPARE",
  "PURCHASE_TERMS",
  "DELIVERY_INFO",
  "PAYMENT_INFO",
  "RETURN_INFO",
  "ADD_TO_CART_INTENT",
  "CART_CONFIRMATION",
  "CART_VIEW",
  "FILE_SPECIFICATION",
  "IMAGE_PRODUCT_SEARCH",
  "RELATED_PRODUCTS",
  "MANAGER_HANDOFF",
  "GENERAL_SUPPORT"
]);

export interface IntentClassification {
  readonly intent: Intent;
  readonly confidence: number;
  readonly query: string;
  readonly productReference?: string;
  readonly quantity?: number;
  readonly requiresCity: boolean;
}

export interface IntentClassifier {
  classify(input: {
    readonly message: string;
    readonly language: Language;
  }): Promise<IntentClassification>;
}

const CITY_REQUIRED_INTENTS: ReadonlySet<Intent> = new Set([
  "STOCK_CHECK",
  "PRICE_CHECK",
  "ANALOG_SEARCH",
  "ADD_TO_CART_INTENT",
  "CART_CONFIRMATION"
]);

const intentPatterns: readonly { readonly intent: Intent; readonly expression: RegExp }[] = [
  {
    intent: "CART_CONFIRMATION",
    expression: /^(?:да,?\s*добав(?:ь|ить)|добав(?:ь|ить)|иә,?\s*қос|қосыңыз|yes,?\s*add)$/iu
  },
  { intent: "CART_VIEW", expression: /(?:корзин|себет)/iu },
  { intent: "CERTIFICATE_SEARCH", expression: /(?:сертификат|декларац|паспорт|certificate)/iu },
  { intent: "ANALOG_SEARCH", expression: /(?:аналог|алмастырғыш|замен[ау]|replacement)/iu },
  { intent: "PRODUCT_COMPARE", expression: /(?:сравн|салыстыр|compare)/iu },
  { intent: "DELIVERY_INFO", expression: /(?:доставк|жеткіз|delivery)/iu },
  { intent: "PAYMENT_INFO", expression: /(?:оплат|төлем|payment)/iu },
  { intent: "RETURN_INFO", expression: /(?:возврат|қайтар|return)/iu },
  { intent: "STOCK_CHECK", expression: /(?:наличи|остаток|бар ма|қойма|stock)/iu },
  { intent: "PRICE_CHECK", expression: /(?:цен[ау]|стоимост|бағас|price)/iu },
  { intent: "RELATED_PRODUCTS", expression: /(?:сопутств|бірге|аксессуар|related)/iu },
  { intent: "MANAGER_HANDOFF", expression: /(?:менеджер|оператор|маманға|manager)/iu },
  { intent: "FILE_SPECIFICATION", expression: /(?:спецификац|excel|xlsx|pdf|файл)/iu },
  { intent: "IMAGE_PRODUCT_SEARCH", expression: /(?:фото|сурет|image|photo)/iu },
  {
    intent: "ADD_TO_CART_INTENT",
    expression: /(?:добав(?:ь|ить).*корзин|корзин.*добав|себет.*қос|қос.*себет)/iu
  },
  { intent: "PRODUCT_DETAILS", expression: /(?:характеристик|параметр|сипаттама|details)/iu },
  { intent: "PURCHASE_TERMS", expression: /(?:оптом|счет|шарт|коммерческ)/iu }
];

/** Safe deterministic fallback for missing/unavailable LLM classification. */
export class RuleBasedIntentClassifier implements IntentClassifier {
  public async classify(input: {
    readonly message: string;
    readonly language: Language;
  }): Promise<IntentClassification> {
    const normalized = input.message.trim();
    const match = intentPatterns.find((candidate) => candidate.expression.test(normalized));
    const intent = match?.intent ?? "PRODUCT_SEARCH";
    const quantity = parseQuantity(normalized);
    const productReference = parseProductReference(normalized);
    return {
      intent,
      confidence: match === undefined ? 0.55 : 0.86,
      query: normalized,
      ...(productReference === undefined ? {} : { productReference }),
      ...(quantity === undefined ? {} : { quantity }),
      requiresCity: CITY_REQUIRED_INTENTS.has(intent)
    };
  }
}

export function requiresCity(intent: Intent): boolean {
  return CITY_REQUIRED_INTENTS.has(intent);
}

function parseQuantity(message: string): number | undefined {
  const match = message.match(/(?:\b|x|×)(\d{1,5})(?:\s*(?:шт\.?|pcs?|дана))?\b/iu);
  if (match?.[1] === undefined) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function parseProductReference(message: string): string | undefined {
  const matches = message.match(/\b[A-ZА-Я0-9][A-ZА-Я0-9-]{3,}\b/giu);
  return matches?.[0];
}
