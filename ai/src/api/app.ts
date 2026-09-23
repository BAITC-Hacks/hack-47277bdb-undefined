import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { detectLanguage } from "../agents/language.js";
import { createAppServices, type AppServices } from "../composition.js";
import { ReadinessService } from "../database/health.js";
import { AppError, isAppError } from "../errors/app-error.js";
import type { ConversationSession, UpdateSessionInput } from "../sessions/index.js";
import { confirmCartProposalInputSchema, prepareCartProposalInputSchema } from "../cart/index.js";
import {
  analysisParamsSchema,
  cartQuerySchema,
  chatRequestSchema,
  fileUploadRequestSchema,
  handoffRequestSchema,
  locationQuerySchema,
  productIdParamsSchema,
  searchProductsQuerySchema,
  sessionMetadataSchema,
  specificationAnalyzeRequestSchema
} from "./contracts.js";

interface SuccessEnvelope<T> {
  readonly success: true;
  readonly requestId: string;
  readonly data: T;
}

interface ErrorEnvelope {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
  };
}

export async function buildApp(
  services: AppServices = createAppServices()
): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: services.config.LOG_LEVEL } });
  await app.register(cors, {
    origin: (origin, callback) => {
      if (origin === undefined || services.config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true
  });
  await app.register(rateLimit, {
    global: true,
    max: services.config.RATE_LIMIT_MAX,
    timeWindow: services.config.RATE_LIMIT_WINDOW
  });

  app.addHook("onClose", async () => {
    if (services.database !== undefined) {
      await services.database.close();
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-Id", request.id);
  });

  app.setErrorHandler((error: Error, request, reply) => {
    const requestId = request.id;
    if (isAppError(error)) {
      reply.code(error.statusCode).send(errorEnvelope(error.code, error.message, requestId));
      return;
    }
    if (error instanceof ZodError) {
      reply
        .code(400)
        .send(errorEnvelope("VALIDATION_ERROR", "Request validation failed.", requestId));
      return;
    }
    request.log.error(error);
    reply.code(500).send(errorEnvelope("INTERNAL_ERROR", "Internal server error.", requestId));
  });

  app.get("/health", async (request) => {
    const catalog = await services.catalog.healthCheck();
    return success(request.id, { status: "ok", catalog });
  });

  app.get("/ready", async (request, reply) => {
    const readiness = await new ReadinessService(services.config, services.database).check();
    if (!readiness.ready) {
      reply.code(503);
    }
    return success(request.id, readiness);
  });

  app.post("/api/chat", async (request, reply) => {
    const body = chatRequestSchema.parse(request.body);
    const session = await resolveChatSession(services, body.session, body.message);
    const attachments = await Promise.all(
      body.attachmentFileIds.map((fileId) => services.files.get(fileId))
    );
    const response = await services.agent.respond({
      session,
      message: body.message,
      ...(body.selectedProductId === undefined
        ? {}
        : { selectedProductId: body.selectedProductId }),
      ...(body.selectedQuantity === undefined ? {} : { selectedQuantity: body.selectedQuantity }),
      attachmentTexts: attachments.map((attachment) => attachment.extracted.text),
      attachmentFileCount: attachments.length
    });
    const updatedSession = await rememberProducts(
      services,
      session,
      response.product,
      response.products
    );
    if (body.stream) {
      sendSse(reply, request.id, updatedSession, response);
      return reply;
    }
    return success(request.id, { session: publicSession(updatedSession), response });
  });

  app.get("/api/chat/:sessionId", async (request) => {
    const params = sessionMetadataSchema.pick({ sessionId: true }).parse(request.params);
    const session = await services.sessions.requireSession(params.sessionId ?? "");
    return success(request.id, { session: publicSession(session) });
  });

  app.get("/api/products/search", async (request) => {
    const query = searchProductsQuerySchema.parse(request.query);
    if (query.city === undefined && query.warehouseId === undefined) {
      throw new AppError(
        "CITY_REQUIRED",
        "Select a city or warehouse before searching the catalog.",
        422
      );
    }
    const result = await services.catalog.searchProducts({
      query: query.query,
      ...(query.city === undefined ? {} : { city: query.city }),
      ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
      ...(query.category === undefined ? {} : { category: query.category }),
      ...(query.brand === undefined ? {} : { brand: query.brand }),
      filters: {},
      inStockOnly: query.inStockOnly,
      limit: query.limit
    });
    return success(request.id, result);
  });

  app.get("/api/products/:id", async (request) => {
    const params = productIdParamsSchema.parse(request.params);
    const product = await services.catalog.getProduct({ productId: params.id });
    if (product === null) throw new AppError("NOT_FOUND", "Product not found.", 404);
    return success(request.id, product);
  });

  app.get("/api/products/:id/stock", async (request) => {
    const params = productIdParamsSchema.parse(request.params);
    const query = locationQuerySchema.parse(request.query);
    const stock = await services.catalog.getStock({
      productId: params.id,
      ...(query.city === undefined ? {} : { city: query.city }),
      ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
      ...(query.requestedQuantity === undefined
        ? {}
        : { requestedQuantity: query.requestedQuantity })
    });
    if (stock === null) throw new AppError("NOT_FOUND", "Product stock was not found.", 404);
    return success(request.id, stock);
  });

  app.get("/api/products/:id/certificates", async (request) => {
    const params = productIdParamsSchema.parse(request.params);
    const documents = await services.catalog.getCertificates(params.id);
    if (documents === null) throw new AppError("NOT_FOUND", "Product not found.", 404);
    return success(request.id, documents);
  });

  app.get("/api/products/:id/analogs", async (request) => {
    const params = productIdParamsSchema.parse(request.params);
    const query = locationQuerySchema.parse(request.query);
    const result = await services.analogs.findAnalogs({
      sourceProductId: params.id,
      ...(query.city === undefined ? {} : { city: query.city }),
      ...(query.warehouseId === undefined ? {} : { warehouseId: query.warehouseId }),
      quantity: query.quantity ?? 1,
      maxResults: 5
    });
    return success(request.id, result);
  });

  app.post("/api/cart/proposal", async (request) => {
    const prepared = await services.cart.prepare(
      prepareCartProposalInputSchema.parse(request.body)
    );
    await services.audit.append({
      requestId: request.id,
      sessionId: prepared.sessionId,
      eventType: "cart.proposal.prepared",
      actor: "system",
      payload: { proposalId: prepared.proposalId }
    });
    return success(request.id, prepared);
  });

  app.post("/api/cart/confirm", async (request) => {
    const confirmation = await services.cart.confirm(
      confirmCartProposalInputSchema.parse(request.body)
    );
    await services.audit.append({
      requestId: request.id,
      eventType: "cart.proposal.confirmed",
      actor: "customer",
      payload: { proposalId: confirmation.proposalId, cartId: confirmation.cartId }
    });
    return success(request.id, confirmation);
  });

  app.get("/api/cart", async (request) => {
    const query = cartQuerySchema.parse(request.query);
    const cart = await services.cart.getCart(query.sessionId, query.userId);
    return success(request.id, cart);
  });

  app.post("/api/files", async (request) => {
    const body = fileUploadRequestSchema.parse(request.body);
    const file = await services.files.upload({
      filename: body.filename,
      mimeType: body.mimeType,
      content: decodeBase64(body.contentBase64)
    });
    return success(request.id, file);
  });

  app.post("/api/specifications/analyze", async (request) => {
    const body = specificationAnalyzeRequestSchema.parse(request.body);
    const file = await services.files.get(body.fileId);
    const analysis = await services.specifications.analyze(file, body.city);
    return success(request.id, analysis);
  });

  app.get("/api/specifications/:id", async (request) => {
    const params = analysisParamsSchema.parse(request.params);
    const analysis = await services.specifications.get(params.id);
    return success(request.id, analysis);
  });

  app.post("/api/handoff", async (request) => {
    const body = handoffRequestSchema.parse(request.body);
    const handoff = await services.handoffs.create(body);
    return success(request.id, handoff);
  });

  return app;
}

function success<T>(requestId: string, data: T): SuccessEnvelope<T> {
  return { success: true, requestId, data };
}

function errorEnvelope(code: string, message: string, requestId: string): ErrorEnvelope {
  return { success: false, error: { code, message, requestId } };
}

async function resolveChatSession(
  services: AppServices,
  rawSession: unknown,
  message: string
): Promise<ConversationSession> {
  const input = sessionMetadataSchema.parse(rawSession ?? {});
  if (input.sessionId === undefined) {
    return services.sessions.create({
      language: input.language ?? detectLanguage(message),
      ...(input.city === undefined ? {} : { city: input.city }),
      ...(input.warehouseId === undefined ? {} : { warehouseId: input.warehouseId }),
      ...(input.customerType === undefined ? {} : { customerType: input.customerType }),
      ...(input.currency === undefined ? {} : { currency: input.currency }),
      ...(input.userId === undefined ? {} : { userId: input.userId })
    });
  }
  const current = await services.sessions.requireSession(input.sessionId);
  const update: UpdateSessionInput = {
    language: input.language ?? detectLanguage(message, current.language),
    ...(input.city === undefined ? {} : { city: input.city }),
    ...(input.warehouseId === undefined ? {} : { warehouseId: input.warehouseId }),
    ...(input.customerType === undefined ? {} : { customerType: input.customerType }),
    ...(input.currency === undefined ? {} : { currency: input.currency })
  };
  return services.sessions.update(current.sessionId, update, current.userId);
}

async function rememberProducts(
  services: AppServices,
  session: ConversationSession,
  product: { readonly id: string } | undefined,
  products: readonly { readonly id: string }[] | undefined
): Promise<ConversationSession> {
  const remembered = [
    ...(product === undefined ? [] : [product.id]),
    ...(products?.map((item) => item.id) ?? []),
    ...session.recentlyViewedProductIds
  ]
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 50);
  if (
    remembered.length === session.recentlyViewedProductIds.length &&
    remembered.every((value, index) => value === session.recentlyViewedProductIds[index])
  ) {
    return session;
  }
  return services.sessions.update(
    session.sessionId,
    { recentlyViewedProductIds: remembered },
    session.userId
  );
}

function publicSession(session: ConversationSession): Omit<ConversationSession, "userId"> {
  return {
    sessionId: session.sessionId,
    language: session.language,
    customerType: session.customerType,
    currency: session.currency,
    recentlyViewedProductIds: session.recentlyViewedProductIds,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    ...(session.city === undefined ? {} : { city: session.city }),
    ...(session.warehouseId === undefined ? {} : { warehouseId: session.warehouseId }),
    ...(session.activeProposalId === undefined
      ? {}
      : { activeProposalId: session.activeProposalId })
  };
}

function decodeBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(value) || value.length % 4 !== 0) {
    throw new AppError("VALIDATION_ERROR", "contentBase64 must be valid base64.", 400);
  }
  return new Uint8Array(Buffer.from(value, "base64"));
}

function sendSse(
  reply: FastifyReply,
  requestId: string,
  session: ConversationSession,
  response: {
    readonly type: string;
    readonly message: string;
    readonly products?: unknown;
    readonly cartProposal?: unknown;
    readonly handoff?: unknown;
  }
): void {
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  const events: readonly { readonly type: string; readonly data: unknown }[] = [
    { type: "assistant.delta", data: { delta: response.message } },
    ...(response.products === undefined
      ? []
      : [{ type: "products", data: { products: response.products } }]),
    ...(response.cartProposal === undefined
      ? []
      : [{ type: "cart.proposal", data: { proposal: response.cartProposal } }]),
    ...(response.handoff === undefined
      ? []
      : [{ type: "handoff", data: { handoff: response.handoff } }]),
    { type: "done", data: { requestId, session: publicSession(session) } }
  ];
  for (const event of events) {
    reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
  }
  reply.raw.end();
}
