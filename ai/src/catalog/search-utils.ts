import type {
  CatalogProduct,
  CatalogProductFilterValue,
  CatalogSearchProductMatch
} from "../schemas/catalog.js";

const TOKEN_SEPARATOR = /[^\p{L}\p{N}]+/gu;

/** Conversation filler must not turn a precise SKU/technical query into a false negative. */
const QUERY_STOP_WORDS = new Set([
  "мне",
  "нужен",
  "нужна",
  "нужно",
  "нужны",
  "надо",
  "хочу",
  "ищу",
  "найди",
  "найдите",
  "покажи",
  "покажите",
  "пожалуйста",
  "для",
  "и",
  "или",
  "товар",
  "товары",
  "маған",
  "керек",
  "керегі",
  "керекті",
  "табу",
  "табыңыз",
  "көрсетіңіз",
  "өтінемін",
  "үшін",
  "және",
  "немесе",
  "тауар",
  "тауарлар",
  "i",
  "need",
  "want",
  "find",
  "show",
  "please",
  "a",
  "an",
  "the",
  "for",
  "and",
  "or"
]);

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(TOKEN_SEPARATOR, " ")
    .trim();
}

export function tokenizeSearchText(value: string): readonly string[] {
  const normalized = normalizeSearchText(value);
  return normalized.length === 0 ? [] : normalized.split(" ").filter((token) => token.length > 0);
}

function tokenizeQueryText(value: string): readonly string[] {
  return tokenizeSearchText(value).filter((token) => !QUERY_STOP_WORDS.has(token));
}

function attributeValueToText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(" ");
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

interface SearchField {
  readonly name: string;
  readonly text: string;
  readonly weight: number;
}

function createProductSearchFields(product: CatalogProduct): readonly SearchField[] {
  const attributeText = Object.entries(product.attributes)
    .map(([key, value]) => `${key} ${attributeValueToText(value)}`)
    .join(" ");
  const technicalText = Object.entries(product.technicalSpecifications)
    .map(([key, value]) => `${key} ${attributeValueToText(value)}`)
    .join(" ");

  return [
    { name: "sku", text: product.sku, weight: 1 },
    { name: "supplierSku", text: product.supplierSku, weight: 0.98 },
    { name: "name", text: product.name, weight: 0.94 },
    { name: "brand", text: product.brand, weight: 0.7 },
    { name: "category", text: `${product.category} ${product.subcategory}`, weight: 0.62 },
    { name: "description", text: product.description, weight: 0.42 },
    { name: "synonyms", text: product.synonyms.join(" "), weight: 0.76 },
    { name: "attributes", text: attributeText, weight: 0.72 },
    { name: "technicalSpecifications", text: technicalText, weight: 0.8 }
  ];
}

function levenshtein(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left.charAt(leftIndex - 1) === right.charAt(rightIndex - 1) ? 0 : 1;
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? Number.MAX_SAFE_INTEGER) + 1,
        (previous[rightIndex] ?? Number.MAX_SAFE_INTEGER) + 1,
        (previous[rightIndex - 1] ?? Number.MAX_SAFE_INTEGER) + substitutionCost
      );
    }
    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index] ?? Number.MAX_SAFE_INTEGER;
    }
  }

  return previous[right.length] ?? Number.MAX_SAFE_INTEGER;
}

function tokenSimilarity(queryToken: string, fieldToken: string): number {
  if (queryToken === fieldToken) {
    return 1;
  }

  if (queryToken.length >= 3 && fieldToken.startsWith(queryToken)) {
    return 0.89;
  }

  if (fieldToken.length >= 3 && queryToken.startsWith(fieldToken)) {
    return 0.82;
  }

  if (queryToken.length < 4 || fieldToken.length < 4) {
    return 0;
  }

  const longestTokenLength = Math.max(queryToken.length, fieldToken.length);
  const permittedDistance = longestTokenLength >= 9 ? 2 : 1;
  const distance = levenshtein(queryToken, fieldToken);
  return distance <= permittedDistance ? 1 - distance / (longestTokenLength + 1) : 0;
}

function scoreTokenAgainstField(queryToken: string, field: SearchField): number {
  const normalizedField = normalizeSearchText(field.text);
  if (normalizedField.length === 0) {
    return 0;
  }

  if (normalizedField === queryToken) {
    return field.weight;
  }

  const tokens = tokenizeSearchText(normalizedField);
  let bestSimilarity = 0;
  for (const fieldToken of tokens) {
    bestSimilarity = Math.max(bestSimilarity, tokenSimilarity(queryToken, fieldToken));
  }
  return bestSimilarity * field.weight;
}

/**
 * Searches every user-facing and technical field. It is deterministic and
 * intentionally conservative: a long query needs enough matching terms to
 * avoid unrelated products leaking into a procurement suggestion.
 */
export function scoreProductSearch(
  product: CatalogProduct,
  query: string
): CatalogSearchProductMatch | null {
  const queryTokens = tokenizeQueryText(query);
  if (queryTokens.length === 0) {
    return { product, relevanceScore: 0.01, matchedFields: [] };
  }

  const fields = createProductSearchFields(product);
  const matchedFields = new Set<string>();
  let combinedScore = 0;
  let matchedTokenCount = 0;

  for (const queryToken of queryTokens) {
    let tokenScore = 0;
    let bestField: SearchField | undefined;

    for (const field of fields) {
      const fieldScore = scoreTokenAgainstField(queryToken, field);
      if (fieldScore > tokenScore) {
        tokenScore = fieldScore;
        bestField = field;
      }
    }

    if (tokenScore >= 0.42) {
      matchedTokenCount += 1;
      combinedScore += tokenScore;
      if (bestField) {
        matchedFields.add(bestField.name);
      }
    }
  }

  const coverage = matchedTokenCount / queryTokens.length;
  const looksLikeArticleOrModel =
    queryTokens.some((token) => /\d/u.test(token)) &&
    queryTokens.some((token) => /\p{L}/u.test(token));
  const requiredCoverage = looksLikeArticleOrModel ? 1 : queryTokens.length === 1 ? 1 : 0.5;
  if (coverage < requiredCoverage) {
    return null;
  }

  const averageScore = combinedScore / queryTokens.length;
  return {
    product,
    relevanceScore: Number(Math.min(1, averageScore * (0.7 + coverage * 0.3)).toFixed(4)),
    matchedFields: [...matchedFields].sort()
  };
}

function valueEquals(actual: unknown, expected: CatalogProductFilterValue): boolean {
  if (Array.isArray(expected)) {
    return expected.some((item) => valueEquals(actual, item));
  }

  if (Array.isArray(actual)) {
    return actual.some((item) => valueEquals(item, expected));
  }

  if (typeof actual === "string" && typeof expected === "string") {
    return normalizeSearchText(actual) === normalizeSearchText(expected);
  }

  return actual === expected;
}

function readProductField(product: CatalogProduct, key: string): unknown {
  if (key.startsWith("attributes.")) {
    return product.attributes[key.slice("attributes.".length)];
  }

  if (key.startsWith("technicalSpecifications.")) {
    return product.technicalSpecifications[key.slice("technicalSpecifications.".length)];
  }

  if (key in product.attributes) {
    return product.attributes[key];
  }

  if (key in product.technicalSpecifications) {
    return product.technicalSpecifications[key];
  }

  switch (key) {
    case "brand":
      return product.brand;
    case "category":
      return product.category;
    case "subcategory":
      return product.subcategory;
    case "orderable":
      return product.orderable;
    default:
      return undefined;
  }
}

export function matchesProductFilters(
  product: CatalogProduct,
  filters: Readonly<Record<string, CatalogProductFilterValue>>
): boolean {
  return Object.entries(filters).every(([key, expected]) =>
    valueEquals(readProductField(product, key), expected)
  );
}

export function compareSearchMatches(
  left: CatalogSearchProductMatch,
  right: CatalogSearchProductMatch
): number {
  if (right.relevanceScore !== left.relevanceScore) {
    return right.relevanceScore - left.relevanceScore;
  }

  return left.product.sku.localeCompare(right.product.sku, "en");
}
