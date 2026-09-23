import type {
  CatalogPriceResult,
  CatalogProduct,
  CatalogProductAttributeValue,
  CatalogStockResult
} from "../catalog/types.js";

export interface AnalogSearchInput {
  /** A source item is preferred; requirements support legacy/unavailable items. */
  readonly sourceProductId?: string;
  readonly category?: string;
  readonly city?: string;
  readonly warehouseId?: string;
  readonly quantity?: number;
  readonly requiredCharacteristics?: Readonly<Record<string, CatalogProductAttributeValue>>;
  readonly preferredBrand?: string;
  readonly maxResults?: number;
  /** Useful for a manager/audit view, never needed by the customer UI. */
  readonly includeExcluded?: boolean;
}

export type AnalogExplanationKind =
  | "technical_match"
  | "technical_difference"
  | "availability"
  | "price"
  | "brand"
  | "delivery"
  | "warning";

export interface AnalogExplanation {
  readonly kind: AnalogExplanationKind;
  readonly characteristic?: string | undefined;
  readonly sourceValue?: CatalogProductAttributeValue | undefined;
  readonly candidateValue?: CatalogProductAttributeValue | undefined;
  readonly messageRu: string;
  readonly messageKk: string;
}

export interface AnalogScoreBreakdown {
  /** Similarity after all safety-critical constraints have passed, 0–100. */
  readonly technicalSimilarity: number;
  readonly availabilityScore: number;
  readonly priceScore: number;
  readonly brandScore: number;
  readonly deliveryScore: number;
  readonly total: number;
}

export interface AnalogCompatibility {
  readonly compatible: true;
  readonly categoryProfile: string;
  readonly verifiedCriticalCharacteristics: readonly string[];
  /** Characteristics unavailable in the source data are never silently claimed. */
  readonly unverifiedCharacteristics: readonly string[];
}

export interface AnalogCandidate {
  readonly product: CatalogProduct;
  readonly stock: CatalogStockResult | null;
  readonly price: CatalogPriceResult | null;
  readonly score: AnalogScoreBreakdown;
  readonly compatibility: AnalogCompatibility;
  readonly explanations: readonly AnalogExplanation[];
}

export interface RejectedAnalogCandidate {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly rejectedBy: readonly AnalogExplanation[];
}

export interface AnalogSearchResult {
  readonly sourceProduct: CatalogProduct | null;
  readonly category: string;
  readonly quantity: number;
  readonly candidates: readonly AnalogCandidate[];
  readonly rejectedCandidates: readonly RejectedAnalogCandidate[];
  readonly evaluatedCount: number;
  readonly generatedAt: string;
}
