import { AppError } from "../errors/app-error.js";
import {
  catalogHealthSchema,
  certificatesResultSchema,
  priceResultSchema,
  productSchema,
  searchProductsResultSchema,
  stockResultSchema
} from "../schemas/catalog.js";
import type {
  CatalogAdapter,
  CatalogCertificatesResult,
  CatalogHealth,
  CatalogPriceRequest,
  CatalogPriceResult,
  CatalogProduct,
  CatalogProductReference,
  CatalogSearchInput,
  CatalogSearchProductsResult,
  CatalogStockRequest,
  CatalogStockResult
} from "./types.js";

export interface LiveCatalogAdapterOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

/**
 * HTTP adapter for the future EKT catalog contract. It validates every upstream
 * response and never silently replaces a failed live response with mock data.
 */
export class LiveCatalogAdapter implements CatalogAdapter {
  public readonly source = "live" as const;
  private readonly baseUrl: URL;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: LiveCatalogAdapterOptions) {
    this.baseUrl = new URL(options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`);
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async searchProducts(input: CatalogSearchInput): Promise<CatalogSearchProductsResult> {
    return this.request(
      "products/search",
      { method: "POST", body: input },
      searchProductsResultSchema
    );
  }

  public async getProduct(reference: CatalogProductReference): Promise<CatalogProduct | null> {
    const query = new URLSearchParams();
    if (reference.productId !== undefined) query.set("productId", reference.productId);
    if (reference.sku !== undefined) query.set("sku", reference.sku);
    if (reference.supplierSku !== undefined) query.set("supplierSku", reference.supplierSku);
    if (reference.slug !== undefined) query.set("slug", reference.slug);
    return this.request(
      `products/resolve?${query.toString()}`,
      { method: "GET" },
      productSchema,
      true
    );
  }

  public async getStock(input: CatalogStockRequest): Promise<CatalogStockResult | null> {
    return this.request(
      `products/${encodeURIComponent(input.productId)}/stock`,
      { method: "POST", body: input },
      stockResultSchema,
      true
    );
  }

  public async getPrice(input: CatalogPriceRequest): Promise<CatalogPriceResult | null> {
    return this.request(
      `products/${encodeURIComponent(input.productId)}/price`,
      { method: "POST", body: input },
      priceResultSchema,
      true
    );
  }

  public async getCertificates(productId: string): Promise<CatalogCertificatesResult | null> {
    return this.request(
      `products/${encodeURIComponent(productId)}/certificates`,
      { method: "GET" },
      certificatesResultSchema,
      true
    );
  }

  public async healthCheck(): Promise<CatalogHealth> {
    return this.request("health", { method: "GET" }, catalogHealthSchema);
  }

  private request<T>(
    path: string,
    request: { readonly method: "GET" | "POST"; readonly body?: unknown },
    schema: { parse(input: unknown): T }
  ): Promise<T>;
  private request<T>(
    path: string,
    request: { readonly method: "GET" | "POST"; readonly body?: unknown },
    schema: { parse(input: unknown): T },
    allowNotFound: true
  ): Promise<T | null>;
  private async request<T>(
    path: string,
    request: { readonly method: "GET" | "POST"; readonly body?: unknown },
    schema: { parse(input: unknown): T },
    allowNotFound = false
  ): Promise<T | null> {
    const url = new URL(path, this.baseUrl);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: request.method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey
        },
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch {
      throw new AppError("UPSTREAM_UNAVAILABLE", "EKT catalog API is unavailable.", 503);
    }
    if (response.status === 404 && allowNotFound) {
      return null;
    }
    if (!response.ok) {
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        `EKT catalog API returned HTTP ${response.status}.`,
        503
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AppError("UPSTREAM_UNAVAILABLE", "EKT catalog API returned invalid JSON.", 503);
    }
    try {
      return schema.parse(body);
    } catch {
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        "EKT catalog API response failed contract validation.",
        503
      );
    }
  }
}
