import type { CatalogPriceResult, CatalogProduct, CatalogStockResult } from "../catalog/types.js";
import type { AnalogExplanation, AnalogScoreBreakdown } from "./types.js";

const SCORE_WEIGHTS = {
  technicalSimilarity: 0.66,
  availabilityScore: 0.15,
  priceScore: 0.06,
  brandScore: 0.05,
  deliveryScore: 0.08
} as const;

function rounded(value: number): number {
  return Number(Math.max(0, Math.min(100, value)).toFixed(2));
}

function priceLabel(price: CatalogPriceResult): string {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(price.unitPrice)} ${price.currency}`;
}

export function availabilityScore(stock: CatalogStockResult | null, quantity: number): number {
  if (!stock || stock.availableQuantity === 0 || stock.status === "out_of_stock") {
    return 0;
  }

  if (stock.canFulfillRequestedQuantity && stock.availableQuantity >= quantity) {
    return stock.status === "low_stock" ? 82 : 100;
  }

  return stock.availableQuantity > 0 ? 35 : 0;
}

export function availabilityExplanation(
  stock: CatalogStockResult | null,
  quantity: number
): AnalogExplanation {
  if (!stock) {
    return {
      kind: "warning",
      messageRu: "Актуальный остаток не получен из каталога; наличие нужно уточнить.",
      messageKk: "Каталогтан өзекті қалдық алынбады; қолжетімділікті нақтылау қажет."
    };
  }

  if (stock.canFulfillRequestedQuantity) {
    return {
      kind: "availability",
      messageRu: `В выбранной локации доступно ${stock.availableQuantity} шт.; запрос ${quantity} шт. можно выполнить.`,
      messageKk: `Таңдалған локацияда ${stock.availableQuantity} дана бар; ${quantity} дана сұранысын орындауға болады.`
    };
  }

  return {
    kind: "availability",
    messageRu: `В выбранной локации доступно ${stock.availableQuantity} шт.; для запроса ${quantity} шт. количества недостаточно.`,
    messageKk: `Таңдалған локацияда ${stock.availableQuantity} дана бар; ${quantity} дана сұранысына саны жеткіліксіз.`
  };
}

export function priceScore(
  candidate: CatalogPriceResult | null,
  source: CatalogPriceResult | null
): number {
  if (!candidate) {
    return 0;
  }

  if (!source || source.currency !== candidate.currency || source.unitPrice === 0) {
    return 60;
  }

  const ratio = candidate.unitPrice / source.unitPrice;
  if (ratio <= 1) {
    return 100;
  }

  return rounded(Math.max(30, 100 - (ratio - 1) * 150));
}

export function priceExplanation(
  candidate: CatalogPriceResult | null,
  source: CatalogPriceResult | null
): AnalogExplanation {
  if (!candidate) {
    return {
      kind: "warning",
      messageRu: "Актуальная цена варианта не получена из прайс-источника.",
      messageKk: "Нұсқаның өзекті бағасы баға көзінен алынбады."
    };
  }

  if (!source || source.currency !== candidate.currency) {
    return {
      kind: "price",
      candidateValue: candidate.unitPrice,
      messageRu: `Актуальная цена варианта: ${priceLabel(candidate)} за единицу. Сравнение с исходным товаром недоступно.`,
      messageKk: `Нұсқаның өзекті бағасы: бірлікке ${priceLabel(candidate)}. Бастапқы тауармен салыстыру қолжетімсіз.`
    };
  }

  const cheaperOrEqual = candidate.unitPrice <= source.unitPrice;
  return {
    kind: "price",
    sourceValue: source.unitPrice,
    candidateValue: candidate.unitPrice,
    messageRu: cheaperOrEqual
      ? `Актуальная цена ${priceLabel(candidate)} за единицу — не выше исходного товара (${priceLabel(source)}).`
      : `Актуальная цена ${priceLabel(candidate)} за единицу; исходный товар стоит ${priceLabel(source)}.`,
    messageKk: cheaperOrEqual
      ? `Өзекті баға бірлікке ${priceLabel(candidate)} — бастапқы тауардан (${priceLabel(source)}) жоғары емес.`
      : `Өзекті баға бірлікке ${priceLabel(candidate)}; бастапқы тауар ${priceLabel(source)} тұрады.`
  };
}

export function brandScore(
  candidate: CatalogProduct,
  source: CatalogProduct | null,
  preferredBrand?: string
): number {
  const normalizedCandidate = candidate.brand.toLocaleLowerCase("ru-RU");
  if (preferredBrand && normalizedCandidate === preferredBrand.toLocaleLowerCase("ru-RU")) {
    return 100;
  }

  if (source && normalizedCandidate === source.brand.toLocaleLowerCase("ru-RU")) {
    return 88;
  }

  return preferredBrand ? 45 : 60;
}

export function brandExplanation(
  candidate: CatalogProduct,
  source: CatalogProduct | null,
  preferredBrand?: string
): AnalogExplanation {
  const isPreferred =
    preferredBrand?.toLocaleLowerCase("ru-RU") === candidate.brand.toLocaleLowerCase("ru-RU");
  const isSourceBrand =
    source?.brand.toLocaleLowerCase("ru-RU") === candidate.brand.toLocaleLowerCase("ru-RU");

  if (isPreferred) {
    return {
      kind: "brand",
      candidateValue: candidate.brand,
      messageRu: `Соответствует предпочтительному бренду: ${candidate.brand}.`,
      messageKk: `Таңдаулы брендке сәйкес: ${candidate.brand}.`
    };
  }

  if (isSourceBrand) {
    return {
      kind: "brand",
      sourceValue: source?.brand,
      candidateValue: candidate.brand,
      messageRu: `Тот же бренд, что и у исходного товара: ${candidate.brand}.`,
      messageKk: `Бастапқы тауармен бірдей бренд: ${candidate.brand}.`
    };
  }

  return {
    kind: "brand",
    sourceValue: source?.brand,
    candidateValue: candidate.brand,
    messageRu: preferredBrand
      ? `Бренд отличается от предпочтительного (${preferredBrand}): ${candidate.brand}.`
      : source
        ? `Бренд отличается от исходного товара (${source.brand}): ${candidate.brand}.`
        : `Бренд варианта: ${candidate.brand}.`,
    messageKk: preferredBrand
      ? `Бренд таңдаулыдан (${preferredBrand}) өзгеше: ${candidate.brand}.`
      : source
        ? `Бренд бастапқы тауардан (${source.brand}) өзгеше: ${candidate.brand}.`
        : `Нұсқаның бренді: ${candidate.brand}.`
  };
}

export function deliveryScore(stock: CatalogStockResult | null): number {
  if (!stock || stock.warehouses.length === 0 || stock.availableQuantity === 0) {
    return 0;
  }

  const shortestDelivery = Math.min(...stock.warehouses.map((warehouse) => warehouse.deliveryDays));
  if (shortestDelivery === 0) {
    return 100;
  }
  if (shortestDelivery === 1) {
    return 82;
  }
  if (shortestDelivery <= 3) {
    return 62;
  }
  if (shortestDelivery <= 7) {
    return 38;
  }
  return 15;
}

export function deliveryExplanation(stock: CatalogStockResult | null): AnalogExplanation {
  if (!stock || stock.warehouses.length === 0 || stock.availableQuantity === 0) {
    return {
      kind: "warning",
      messageRu: "Срок поставки не подтверждён остатками выбранной локации.",
      messageKk: "Жеткізу мерзімі таңдалған локация қалдығымен расталмаған."
    };
  }

  const shortestDelivery = Math.min(...stock.warehouses.map((warehouse) => warehouse.deliveryDays));
  return {
    kind: "delivery",
    candidateValue: shortestDelivery,
    messageRu:
      shortestDelivery === 0
        ? "Есть локальный остаток с выдачей без ожидания."
        : `Ближайшая поставка по данным склада — от ${shortestDelivery} дн.`,
    messageKk:
      shortestDelivery === 0
        ? "Күтуінсіз берілетін жергілікті қалдық бар."
        : `Қойма деректері бойынша ең жақын жеткізу — ${shortestDelivery} күннен бастап.`
  };
}

export function calculateAnalogScore(input: {
  readonly technicalSimilarity: number;
  readonly stock: CatalogStockResult | null;
  readonly quantity: number;
  readonly candidatePrice: CatalogPriceResult | null;
  readonly sourcePrice: CatalogPriceResult | null;
  readonly candidate: CatalogProduct;
  readonly source: CatalogProduct | null;
  readonly preferredBrand?: string;
}): AnalogScoreBreakdown {
  const availability = availabilityScore(input.stock, input.quantity);
  const price = priceScore(input.candidatePrice, input.sourcePrice);
  const brand = brandScore(input.candidate, input.source, input.preferredBrand);
  const delivery = deliveryScore(input.stock);
  const total =
    input.technicalSimilarity * SCORE_WEIGHTS.technicalSimilarity +
    availability * SCORE_WEIGHTS.availabilityScore +
    price * SCORE_WEIGHTS.priceScore +
    brand * SCORE_WEIGHTS.brandScore +
    delivery * SCORE_WEIGHTS.deliveryScore;

  return {
    technicalSimilarity: rounded(input.technicalSimilarity),
    availabilityScore: rounded(availability),
    priceScore: rounded(price),
    brandScore: rounded(brand),
    deliveryScore: rounded(delivery),
    total: rounded(total)
  };
}
