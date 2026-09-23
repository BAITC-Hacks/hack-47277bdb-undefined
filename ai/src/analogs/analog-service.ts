import { AppError } from "../errors/app-error.js";
import { analogSearchInputSchema } from "../schemas/analogs.js";
import type { CatalogAdapter, CatalogProduct } from "../catalog/types.js";
import { buildAnalogRequirements, evaluateCompatibility } from "../matching/compatibility.js";
import {
  availabilityExplanation,
  brandExplanation,
  calculateAnalogScore,
  deliveryExplanation,
  priceExplanation
} from "./scoring.js";
import type {
  AnalogCandidate,
  AnalogExplanation,
  AnalogSearchInput,
  AnalogSearchResult,
  RejectedAnalogCandidate
} from "./types.js";

interface AcceptedEvaluation {
  readonly kind: "accepted";
  readonly candidate: AnalogCandidate;
}

interface RejectedEvaluation {
  readonly kind: "rejected";
  readonly candidate: RejectedAnalogCandidate;
}

type CandidateEvaluation = AcceptedEvaluation | RejectedEvaluation;

function unavailableOrderExplanation(product: CatalogProduct): AnalogExplanation {
  return {
    kind: "warning",
    messageRu: `Товар «${product.name}» не доступен к заказу и не предлагается как аналог.`,
    messageKk: `«${product.name}» тауары тапсырысқа қолжетімсіз, сондықтан аналог ретінде ұсынылмайды.`
  };
}

function rejectedCandidate(
  product: CatalogProduct,
  rejectedBy: readonly AnalogExplanation[]
): RejectedEvaluation {
  return {
    kind: "rejected",
    candidate: {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      rejectedBy
    }
  };
}

function compareAnalogs(left: AnalogCandidate, right: AnalogCandidate): number {
  if (right.score.total !== left.score.total) {
    return right.score.total - left.score.total;
  }
  if (right.score.technicalSimilarity !== left.score.technicalSimilarity) {
    return right.score.technicalSimilarity - left.score.technicalSimilarity;
  }
  return left.product.sku.localeCompare(right.product.sku, "en");
}

/**
 * Finds only technically compatible substitutes. Ranking happens after the
 * hard filter, making it impossible for low price to outweigh electrical
 * safety or mounting requirements.
 */
export class AnalogService {
  public constructor(private readonly catalog: CatalogAdapter) {}

  public async findAnalogs(input: AnalogSearchInput): Promise<AnalogSearchResult> {
    const parsed = analogSearchInputSchema.parse(input);
    const sourceProduct = parsed.sourceProductId
      ? await this.catalog.getProduct({ productId: parsed.sourceProductId })
      : null;

    if (parsed.sourceProductId && !sourceProduct) {
      throw new AppError("NOT_FOUND", "Исходный товар для подбора аналога не найден.", 404, {
        productId: parsed.sourceProductId
      });
    }

    const category = sourceProduct?.category ?? parsed.category;
    if (!category) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Для подбора аналога нужна категория или исходный товар.",
        400
      );
    }

    const requirements = buildAnalogRequirements(
      category,
      sourceProduct,
      parsed.requiredCharacteristics
    );
    const searchResult = await this.catalog.searchProducts({
      query: "",
      city: parsed.city,
      warehouseId: parsed.warehouseId,
      category,
      filters: {},
      inStockOnly: false,
      limit: 100
    });

    const sourcePrice = sourceProduct
      ? await this.catalog.getPrice({
          productId: sourceProduct.id,
          city: parsed.city,
          warehouseId: parsed.warehouseId,
          quantity: parsed.quantity,
          customerType: "retail"
        })
      : null;

    const uniqueProducts = new Map<string, CatalogProduct>();
    for (const match of searchResult.items) {
      if (match.product.id !== sourceProduct?.id) {
        uniqueProducts.set(match.product.id, match.product);
      }
    }

    const evaluations = await Promise.all(
      [...uniqueProducts.values()].map((product) =>
        this.evaluateCandidate({
          product,
          sourceProduct,
          sourcePrice,
          requirements,
          quantity: parsed.quantity,
          city: parsed.city,
          warehouseId: parsed.warehouseId,
          preferredBrand: parsed.preferredBrand
        })
      )
    );

    const candidates = evaluations
      .filter((evaluation): evaluation is AcceptedEvaluation => evaluation.kind === "accepted")
      .map((evaluation) => evaluation.candidate)
      .sort(compareAnalogs)
      .slice(0, parsed.maxResults);
    const rejected = evaluations
      .filter((evaluation): evaluation is RejectedEvaluation => evaluation.kind === "rejected")
      .map((evaluation) => evaluation.candidate)
      .sort((left, right) => left.sku.localeCompare(right.sku, "en"));

    return {
      sourceProduct,
      category,
      quantity: parsed.quantity,
      candidates,
      rejectedCandidates: parsed.includeExcluded ? rejected.slice(0, 50) : [],
      evaluatedCount: evaluations.length,
      generatedAt: searchResult.updatedAt
    };
  }

  private async evaluateCandidate(input: {
    readonly product: CatalogProduct;
    readonly sourceProduct: CatalogProduct | null;
    readonly sourcePrice: Awaited<ReturnType<CatalogAdapter["getPrice"]>>;
    readonly requirements: ReturnType<typeof buildAnalogRequirements>;
    readonly quantity: number;
    readonly city?: string;
    readonly warehouseId?: string;
    readonly preferredBrand?: string;
  }): Promise<CandidateEvaluation> {
    if (!input.product.orderable) {
      return rejectedCandidate(input.product, [unavailableOrderExplanation(input.product)]);
    }

    const technical = evaluateCompatibility(input.requirements, input.sourceProduct, input.product);
    if (!technical.compatible) {
      return rejectedCandidate(input.product, technical.explanations);
    }

    const [stock, price] = await Promise.all([
      this.catalog.getStock({
        productId: input.product.id,
        city: input.city,
        warehouseId: input.warehouseId,
        requestedQuantity: input.quantity
      }),
      this.catalog.getPrice({
        productId: input.product.id,
        city: input.city,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        customerType: "retail"
      })
    ]);

    const score = calculateAnalogScore({
      technicalSimilarity: technical.technicalSimilarity,
      stock,
      quantity: input.quantity,
      candidatePrice: price,
      sourcePrice: input.sourcePrice,
      candidate: input.product,
      source: input.sourceProduct,
      preferredBrand: input.preferredBrand
    });

    return {
      kind: "accepted",
      candidate: {
        product: input.product,
        stock,
        price,
        score,
        compatibility: {
          compatible: true,
          categoryProfile: technical.profile.id,
          verifiedCriticalCharacteristics: technical.verifiedCriticalCharacteristics,
          unverifiedCharacteristics: technical.unverifiedCharacteristics
        },
        explanations: [
          ...technical.explanations,
          availabilityExplanation(stock, input.quantity),
          priceExplanation(price, input.sourcePrice),
          brandExplanation(input.product, input.sourceProduct, input.preferredBrand),
          deliveryExplanation(stock)
        ]
      }
    };
  }
}
