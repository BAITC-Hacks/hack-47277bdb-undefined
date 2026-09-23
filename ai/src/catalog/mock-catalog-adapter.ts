import {
  catalogPriceRecordSchema,
  certificatesResultSchema,
  getPriceInputSchema,
  getStockInputSchema,
  productReferenceSchema,
  productSchema,
  searchProductsInputSchema,
  type CatalogPriceRecord,
  type CatalogProduct,
  type CatalogStockResult,
  type CatalogWarehouseStock as WarehouseStock
} from "../schemas/catalog.js";
import { mockCatalogPrices, mockCatalogProducts } from "../mock-data/mockCatalog.js";
import {
  compareSearchMatches,
  matchesProductFilters,
  normalizeSearchText,
  scoreProductSearch
} from "./search-utils.js";
import type {
  CatalogAdapter,
  CatalogCertificatesResult,
  CatalogHealth,
  CatalogPriceRequest,
  CatalogPriceResult,
  CatalogProductReference as ProductReference,
  CatalogSearchInput,
  CatalogSearchProductsResult,
  CatalogStockRequest
} from "./types.js";

const MOCK_TIMESTAMP = "2026-09-23T08:00:00.000Z";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sameText(left: string, right: string): boolean {
  return normalizeSearchText(left) === normalizeSearchText(right);
}

function locationStocks(
  product: CatalogProduct,
  location: { city?: string; warehouseId?: string }
): readonly WarehouseStock[] {
  return product.warehouseStocks.filter((stock) => {
    const warehouseMatches = !location.warehouseId || stock.warehouseId === location.warehouseId;
    const cityMatches = !location.city || sameText(stock.city, location.city);
    return warehouseMatches && cityMatches;
  });
}

function availabilityForStocks(
  product: CatalogProduct,
  stocks: readonly WarehouseStock[]
): CatalogStockResult["status"] {
  const available = stocks.reduce((sum, stock) => sum + stock.availableQuantity, 0);
  if (available === 0) {
    return product.availabilityStatus === "on_order" ? "on_order" : "out_of_stock";
  }
  return available <= 3 ? "low_stock" : "in_stock";
}

function mostRecentTimestamp(
  products: readonly CatalogProduct[],
  prices: readonly CatalogPriceRecord[]
): string {
  const timestamps = [
    ...products.map((product) => product.updatedAt),
    ...prices.map((price) => price.updatedAt),
    MOCK_TIMESTAMP
  ];
  return timestamps.reduce((latest, candidate) => (candidate > latest ? candidate : latest));
}

/**
 * Local, deterministic implementation of the production catalog port. It
 * intentionally performs no randomization, so demo results are reproducible.
 */
export class MockCatalogAdapter implements CatalogAdapter {
  public readonly source = "mock" as const;

  private readonly products: readonly CatalogProduct[];
  private readonly prices: readonly CatalogPriceRecord[];
  private readonly updatedAt: string;

  public constructor(
    products: readonly CatalogProduct[] = mockCatalogProducts,
    prices: readonly CatalogPriceRecord[] = mockCatalogPrices
  ) {
    this.products = products.map((product) => productSchema.parse(product));
    this.prices = prices.map((price) => catalogPriceRecordSchema.parse(price));
    this.updatedAt = mostRecentTimestamp(this.products, this.prices);
  }

  public async searchProducts(input: CatalogSearchInput): Promise<CatalogSearchProductsResult> {
    await Promise.resolve();
    const parsed = searchProductsInputSchema.parse(input);
    const matches = this.products
      .filter((product) => !parsed.category || sameText(product.category, parsed.category))
      .filter((product) => !parsed.brand || sameText(product.brand, parsed.brand))
      .filter((product) => matchesProductFilters(product, parsed.filters))
      .filter((product) => {
        if (!parsed.inStockOnly) {
          return true;
        }
        return locationStocks(product, parsed).some((stock) => stock.availableQuantity > 0);
      })
      .map((product) => scoreProductSearch(product, parsed.query))
      .filter((match): match is NonNullable<typeof match> => match !== null)
      .sort(compareSearchMatches);

    return {
      items: matches.slice(0, parsed.limit).map((match) => ({
        product: clone(match.product),
        relevanceScore: match.relevanceScore,
        matchedFields: [...match.matchedFields]
      })),
      total: matches.length,
      query: parsed.query,
      location: { city: parsed.city, warehouseId: parsed.warehouseId },
      source: this.source,
      updatedAt: this.updatedAt
    };
  }

  public async getProduct(reference: ProductReference): Promise<CatalogProduct | null> {
    await Promise.resolve();
    const parsed = productReferenceSchema.parse(reference);
    const product = this.products.find((candidate) => {
      if (parsed.productId && candidate.id === parsed.productId) {
        return true;
      }
      if (parsed.sku && sameText(candidate.sku, parsed.sku)) {
        return true;
      }
      if (parsed.supplierSku && sameText(candidate.supplierSku, parsed.supplierSku)) {
        return true;
      }
      return Boolean(parsed.slug && sameText(candidate.slug, parsed.slug));
    });

    return product ? clone(product) : null;
  }

  public async getStock(input: CatalogStockRequest): Promise<CatalogStockResult | null> {
    await Promise.resolve();
    const parsed = getStockInputSchema.parse(input);
    const product = this.products.find((candidate) => candidate.id === parsed.productId);
    if (!product) {
      return null;
    }

    const warehouses = locationStocks(product, parsed);
    const availableQuantity = warehouses.reduce((sum, stock) => sum + stock.availableQuantity, 0);

    return {
      productId: product.id,
      location: { city: parsed.city, warehouseId: parsed.warehouseId },
      availableQuantity,
      warehouses: [...clone(warehouses)],
      status: availabilityForStocks(product, warehouses),
      canFulfillRequestedQuantity:
        parsed.requestedQuantity === undefined || availableQuantity >= parsed.requestedQuantity,
      updatedAt: warehouses.reduce(
        (latest, stock) => (stock.updatedAt > latest ? stock.updatedAt : latest),
        product.updatedAt
      ),
      source: this.source
    };
  }

  public async getPrice(input: CatalogPriceRequest): Promise<CatalogPriceResult | null> {
    await Promise.resolve();
    const parsed = getPriceInputSchema.parse(input);
    const product = this.products.find((candidate) => candidate.id === parsed.productId);
    if (!product) {
      return null;
    }

    const price = this.findPriceRecord(parsed.productId, parsed.city, parsed.warehouseId);
    if (!price) {
      return null;
    }

    const unitPrice =
      parsed.customerType === "wholesale"
        ? (price.wholesaleUnitPrice ?? price.retailUnitPrice)
        : price.retailUnitPrice;

    return {
      productId: parsed.productId,
      location: { city: parsed.city, warehouseId: parsed.warehouseId },
      currency: price.currency,
      unitPrice,
      quantity: parsed.quantity,
      totalPrice: Number((unitPrice * parsed.quantity).toFixed(2)),
      customerType: parsed.customerType,
      priceList: price.priceList,
      validUntil: price.validUntil,
      updatedAt: price.updatedAt,
      source: this.source
    };
  }

  public async getCertificates(productId: string): Promise<CatalogCertificatesResult | null> {
    await Promise.resolve();
    const product = this.products.find((candidate) => candidate.id === productId);
    if (!product) {
      return null;
    }

    return certificatesResultSchema.parse({
      productId,
      documents: clone(product.certificates),
      source: this.source,
      updatedAt: product.updatedAt
    });
  }

  public async healthCheck(): Promise<CatalogHealth> {
    await Promise.resolve();
    return {
      source: this.source,
      healthy: true,
      checkedAt: this.updatedAt,
      detail: `Deterministic mock catalog: ${this.products.length} products.`
    };
  }

  private findPriceRecord(
    productId: string,
    city: string | undefined,
    warehouseId: string | undefined
  ): CatalogPriceRecord | undefined {
    const rows = this.prices.filter((price) => price.productId === productId);
    if (rows.length === 0) {
      return undefined;
    }

    if (warehouseId) {
      const warehouseRow = rows.find((row) => row.warehouseId === warehouseId);
      if (warehouseRow) {
        return warehouseRow;
      }
    }

    if (city) {
      const cityRows = rows.filter((row) => sameText(row.city, city));
      const cityDefault = cityRows.find((row) => row.warehouseId === undefined);
      return cityDefault ?? cityRows[0];
    }

    return rows.find((row) => row.warehouseId === undefined) ?? rows[0];
  }
}
