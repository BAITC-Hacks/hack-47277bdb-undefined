import { AnalogService } from "./analogs/index.js";
import { EktAgent } from "./agents/ekt-agent.js";
import { OpenAiIntentClassifier } from "./agents/openai-intent-classifier.js";
import { RuleBasedIntentClassifier, type IntentClassifier } from "./agents/intent-router.js";
import {
  CartService,
  LiveCartAdapter,
  MockCartAdapter,
  PostgresCartProposalStore,
  type CartAdapter,
  type CartCatalogPort,
  type CartCatalogPriceRequest,
  type CartCatalogPriceResult,
  type CartCatalogStockRequest,
  type CartCatalogStockResult
} from "./cart/index.js";
import { LiveCatalogAdapter } from "./catalog/live-catalog-adapter.js";
import { MockCatalogAdapter, type CatalogAdapter, type CatalogProduct } from "./catalog/index.js";
import { loadConfig, type AppConfig } from "./config/env.js";
import { PostgresDatabase } from "./database/postgres.js";
import { FileService, InMemoryFileStore, PostgresFileStore } from "./files/file-service.js";
import {
  DocxParser,
  ImageMetadataParser,
  OpenAiImageParser,
  PdfParser,
  SpreadsheetParser
} from "./files/parsers.js";
import {
  InMemoryHandoffService,
  PostgresHandoffService,
  type HandoffService
} from "./handoff/handoff-service.js";
import { InMemoryAuditLog, PostgresAuditLog, type AuditLog } from "./observability/audit-log.js";
import { InMemoryKnowledgeRepository } from "./rag/knowledge-base.js";
import { InMemorySessionStore, PostgresSessionStore, SessionService } from "./sessions/index.js";
import {
  InMemorySpecificationAnalysisStore,
  PostgresSpecificationAnalysisStore,
  SpecificationService,
  type SpecificationCatalogPort,
  type SpecificationLineItem,
  type SpecificationProductCandidate
} from "./specifications/specification-service.js";
import type { Product, StockResult } from "./types/domain.js";

export interface AppServices {
  readonly config: AppConfig;
  /** Present in every normal server process; omitted only for isolated tests. */
  readonly database?: PostgresDatabase;
  readonly sessions: SessionService;
  readonly catalog: CatalogAdapter;
  readonly analogs: AnalogService;
  readonly cart: CartService;
  readonly agent: EktAgent;
  readonly files: FileService;
  readonly specifications: SpecificationService;
  readonly handoffs: HandoffService;
  readonly audit: AuditLog;
}

class CatalogCartPort implements CartCatalogPort {
  public constructor(private readonly catalog: CatalogAdapter) {}

  public async getPrice(input: CartCatalogPriceRequest): Promise<CartCatalogPriceResult | null> {
    return this.catalog.getPrice({
      productId: input.productId,
      city: input.city,
      warehouseId: input.warehouseId,
      quantity: input.quantity,
      customerType: input.customerType
    });
  }

  public async getStock(input: CartCatalogStockRequest): Promise<CartCatalogStockResult | null> {
    const stock = await this.catalog.getStock({
      productId: input.productId,
      city: input.city,
      warehouseId: input.warehouseId,
      requestedQuantity: input.requestedQuantity
    });
    return stock === null ? null : { ...stock, orderable: stock.status !== "discontinued" };
  }
}

class CatalogSpecificationPort implements SpecificationCatalogPort {
  public constructor(
    private readonly catalog: CatalogAdapter,
    private readonly analogs: AnalogService
  ) {}

  public async search(
    query: string,
    city: string,
    limit: number
  ): Promise<readonly SpecificationProductCandidate[]> {
    const result = await this.catalog.searchProducts({
      query,
      city,
      filters: {},
      inStockOnly: false,
      limit
    });
    return result.items.map((match) => ({
      product: toSharedProduct(match.product),
      confidence: match.relevanceScore
    }));
  }

  public async getStock(productId: string, city: string, quantity: number): Promise<StockResult> {
    const stock = await this.catalog.getStock({ productId, city, requestedQuantity: quantity });
    if (stock === null) {
      return {
        productId,
        city,
        availableQuantity: 0,
        warehouses: [],
        status: "out_of_stock",
        canFulfillRequestedQuantity: false,
        checkedAt: new Date().toISOString()
      };
    }
    return {
      productId: stock.productId,
      city,
      availableQuantity: stock.availableQuantity,
      warehouses: stock.warehouses,
      status: stock.status,
      canFulfillRequestedQuantity: stock.canFulfillRequestedQuantity,
      checkedAt: stock.updatedAt
    };
  }

  public async findAnalogs(
    source: SpecificationLineItem,
    city: string,
    quantity: number
  ): Promise<readonly SpecificationProductCandidate[]> {
    const query = source.article ?? source.supplierArticle ?? source.name;
    const sources = await this.catalog.searchProducts({
      query,
      city,
      filters: {},
      inStockOnly: false,
      limit: 1
    });
    const sourceProduct = sources.items[0]?.product;
    if (sourceProduct !== undefined) {
      const result = await this.analogs.findAnalogs({
        sourceProductId: sourceProduct.id,
        city,
        quantity,
        maxResults: 5
      });
      return result.candidates.map((candidate) => ({
        product: toSharedProduct(candidate.product),
        confidence: candidate.score.total / 100
      }));
    }
    return this.search(source.technicalRequirements ?? source.name, city, 5);
  }
}

function toSharedProduct(product: CatalogProduct): Product {
  return {
    id: product.id,
    sku: product.sku,
    supplierSku: product.supplierSku,
    name: product.name,
    slug: product.slug,
    category: product.category,
    subcategory: product.subcategory,
    brand: product.brand,
    description: product.description,
    attributes: product.attributes,
    technicalSpecifications: product.technicalSpecifications,
    certificates: product.certificates,
    unit: product.unit,
    packageSize: product.packageSize,
    currency: product.currency,
    imageUrls: product.imageUrls,
    productUrl: product.productUrl,
    relatedProductIds: product.relatedProductIds,
    updatedAt: product.updatedAt
  };
}

function createCatalog(config: AppConfig): CatalogAdapter {
  if (config.DATA_SOURCE === "mock") {
    return new MockCatalogAdapter();
  }
  if (config.EKT_CATALOG_API_URL === undefined || config.EKT_CATALOG_API_KEY === undefined) {
    throw new Error("Live catalog mode requires EKT_CATALOG_API_URL and EKT_CATALOG_API_KEY.");
  }
  return new LiveCatalogAdapter({
    baseUrl: config.EKT_CATALOG_API_URL,
    apiKey: config.EKT_CATALOG_API_KEY
  });
}

function createCartAdapter(config: AppConfig): CartAdapter {
  if (config.DATA_SOURCE === "mock") {
    return new MockCartAdapter({ siteUrl: config.EKT_SITE_URL });
  }
  if (config.EKT_CART_API_URL === undefined) {
    throw new Error("Live catalog mode requires EKT_CART_API_URL.");
  }
  return new LiveCartAdapter({ baseUrl: config.EKT_CART_API_URL });
}

function createIntentClassifier(config: AppConfig): IntentClassifier {
  return config.OPENAI_API_KEY === undefined
    ? new RuleBasedIntentClassifier()
    : new OpenAiIntentClassifier(config.OPENAI_API_KEY, config.OPENAI_MODEL);
}

export function createAppServices(config: AppConfig = loadConfig()): AppServices {
  const database =
    config.DATABASE_URL === undefined
      ? undefined
      : new PostgresDatabase({
          connectionString: config.DATABASE_URL,
          max: 10,
          connectionTimeoutMillis: 5_000
        });
  const sessions = new SessionService({
    store: database === undefined ? new InMemorySessionStore() : new PostgresSessionStore(database)
  });
  const catalog = createCatalog(config);
  const analogs = new AnalogService(catalog);
  const cart = new CartService({
    sessions,
    catalog: new CatalogCartPort(catalog),
    cart: createCartAdapter(config),
    proposalTtlMs: config.CART_PROPOSAL_TTL_SECONDS * 1_000,
    ...(database === undefined ? {} : { proposalStore: new PostgresCartProposalStore(database) })
  });
  const files = new FileService(
    database === undefined ? new InMemoryFileStore() : new PostgresFileStore(database),
    [
      new SpreadsheetParser(),
      new DocxParser(),
      new PdfParser(),
      config.OPENAI_API_KEY === undefined
        ? new ImageMetadataParser()
        : new OpenAiImageParser(config.OPENAI_API_KEY, config.OPENAI_MODEL)
    ]
  );
  const specifications = new SpecificationService(
    new CatalogSpecificationPort(catalog, analogs),
    database === undefined
      ? new InMemorySpecificationAnalysisStore()
      : new PostgresSpecificationAnalysisStore(database)
  );
  const knowledge = new InMemoryKnowledgeRepository(config.EKT_SITE_URL);
  const handoffs =
    database === undefined ? new InMemoryHandoffService() : new PostgresHandoffService(database);
  const agent = new EktAgent({
    classifier: createIntentClassifier(config),
    catalog,
    analogs,
    cart,
    knowledge,
    handoffs
  });
  const audit = database === undefined ? new InMemoryAuditLog() : new PostgresAuditLog(database);
  return {
    config,
    database,
    sessions,
    catalog,
    analogs,
    cart,
    agent,
    files,
    specifications,
    handoffs,
    audit
  };
}
