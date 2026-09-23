import type { AnalogSearchResult, AnalogService } from "../analogs/index.js";
import type { CartService, PreparedCartProposal } from "../cart/index.js";
import type {
  CatalogAdapter,
  CatalogProduct,
  CatalogPriceResult,
  CatalogStockResult
} from "../catalog/index.js";
import { AppError } from "../errors/app-error.js";
import type { ManagerHandoff, HandoffService } from "../handoff/handoff-service.js";
import type { KnowledgeChunk, KnowledgeRepository } from "../rag/knowledge-base.js";
import { ensureSafeElectricalRequest } from "../security/content-safety.js";
import type { ConversationSession } from "../sessions/index.js";
import type { Intent } from "../types/domain.js";
import { detectLanguage, localizedMessage } from "./language.js";
import type { IntentClassification, IntentClassifier } from "./intent-router.js";

export type AssistantPayloadType =
  | "message"
  | "products"
  | "product"
  | "stock"
  | "price"
  | "certificates"
  | "analogs"
  | "cart.proposal"
  | "cart"
  | "knowledge"
  | "handoff";

export interface ChatTurnInput {
  readonly session: ConversationSession;
  readonly message: string;
  /** UI-provided selection; it is not inferred as a cart-confirmation action. */
  readonly selectedProductId?: string;
  readonly selectedQuantity?: number;
  readonly attachmentTexts?: readonly string[];
  readonly attachmentFileCount?: number;
}

export interface AssistantResponse {
  readonly type: AssistantPayloadType;
  readonly intent: Intent;
  readonly message: string;
  readonly products?: readonly CatalogProduct[];
  readonly product?: CatalogProduct;
  readonly stock?: CatalogStockResult;
  readonly price?: CatalogPriceResult;
  readonly certificates?: readonly unknown[];
  readonly analogs?: AnalogSearchResult;
  readonly cartProposal?: PreparedCartProposal;
  readonly knowledge?: readonly KnowledgeChunk[];
  readonly handoff?: ManagerHandoff;
  readonly quickReplies: readonly string[];
}

export interface EktAgentDependencies {
  readonly classifier: IntentClassifier;
  readonly catalog: CatalogAdapter;
  readonly analogs: AnalogService;
  readonly cart: CartService;
  readonly knowledge: KnowledgeRepository;
  readonly handoffs: HandoffService;
}

/**
 * Tool-only commerce orchestrator. It never decides a price, stock level,
 * certificate, or cart mutation itself: those facts come from injected tools.
 */
export class EktAgent {
  public constructor(private readonly dependencies: EktAgentDependencies) {}

  public async respond(input: ChatTurnInput): Promise<AssistantResponse> {
    const message = input.message.trim();
    if (message.length === 0) {
      throw new AppError("VALIDATION_ERROR", "Message must not be empty.", 400);
    }
    ensureSafeElectricalRequest(message);
    const language = detectLanguage(message, input.session.language);
    const classification = await this.dependencies.classifier.classify({ message, language });
    return this.route(
      input,
      language,
      enrichClassificationWithAttachment(classification, input.attachmentTexts)
    );
  }

  private async route(
    input: ChatTurnInput,
    language: ConversationSession["language"],
    classified: IntentClassification
  ): Promise<AssistantResponse> {
    switch (classified.intent) {
      case "PRODUCT_SEARCH":
        return this.searchProducts(input.session, classified, language);
      case "PRODUCT_DETAILS":
        return this.productDetails(input.session, classified, language);
      case "STOCK_CHECK":
        return this.stock(input.session, classified, language);
      case "PRICE_CHECK":
        return this.price(input.session, classified, language);
      case "CERTIFICATE_SEARCH":
        return this.certificates(input.session, classified, language);
      case "ANALOG_SEARCH":
        return this.analogs(input.session, classified, language);
      case "IMAGE_PRODUCT_SEARCH":
        return this.imageSearch(input, classified, language);
      case "ADD_TO_CART_INTENT":
        return this.prepareCart(input, classified, language);
      case "CART_CONFIRMATION":
        return this.confirmationRequired(language);
      case "CART_VIEW":
        return this.cartView(input.session, language);
      case "DELIVERY_INFO":
      case "PAYMENT_INFO":
      case "RETURN_INFO":
      case "PURCHASE_TERMS":
        return this.knowledge(classified, language);
      case "MANAGER_HANDOFF":
        return this.handoff(input.session, input.message, language);
      default:
        return this.generalHelp(language);
    }
  }

  private requireCity(
    session: ConversationSession,
    language: ConversationSession["language"],
    intent: Intent
  ): string {
    if (session.city === undefined) {
      throw new AppError(
        "CITY_REQUIRED",
        localizedMessage(
          language,
          "Укажите город, чтобы проверить цену, наличие или подобрать аналог.",
          "Бағаны, қолжетімділікті тексеру немесе аналог таңдау үшін қаланы көрсетіңіз.",
          "Please select a city before checking price, stock, or analogs."
        ),
        422,
        { intent }
      );
    }
    return session.city;
  }

  private async searchProducts(
    session: ConversationSession,
    classified: IntentClassification,
    language: ConversationSession["language"]
  ): Promise<AssistantResponse> {
    const city = this.requireCity(session, language, classified.intent);
    const result = await this.dependencies.catalog.searchProducts({
      query: classified.query,
      city,
      warehouseId: session.warehouseId,
      filters: {},
      inStockOnly: false,
      limit: 12
    });
    const products = result.items.map((match) => match.product);
    return {
      type: "products",
      intent: classified.intent,
      message:
        products.length === 0
          ? localizedMessage(
              language,
              "Подходящие товары не найдены.",
              "Сәйкес тауарлар табылмады.",
              "No matching products were found."
            )
          : localizedMessage(
              language,
              `Найдено товаров: ${products.length}.`,
              `Табылған тауарлар: ${products.length}.`,
              `Found ${products.length} products.`
            ),
      products,
      quickReplies: productQuickReplies(language)
    };
  }

  private async productDetails(
    session: ConversationSession,
    classified: IntentClassification,
    language: ConversationSession["language"]
  ): Promise<AssistantResponse> {
    const product = await this.resolveProduct(session, classified);
    if (product === null) {
      return noProductResponse(classified.intent, language);
    }
    return {
      type: "product",
      intent: classified.intent,
      message: localizedMessage(
        language,
        `Карточка товара ${product.sku}.`,
        `Тауар картасы: ${product.sku}.`,
        `Product card: ${product.sku}.`
      ),
      product,
      quickReplies: productQuickReplies(language)
    };
  }

  private async stock(
    session: ConversationSession,
    classified: IntentClassification,
    language: ConversationSession["language"]
  ): Promise<AssistantResponse> {
    const product = await this.requireProduct(session, classified, language);
    const city = this.requireCity(session, language, classified.intent);
    const requestedQuantity = classified.quantity ?? 1;
    const stock = await this.dependencies.catalog.getStock({
      productId: product.id,
      city,
      warehouseId: session.warehouseId,
      requestedQuantity
    });
    if (stock === null) {
      throw new AppError(
        "STOCK_UNAVAILABLE",
        "Current stock was not returned by the catalog.",
        409
      );
    }
    return {
      type: "stock",
      intent: classified.intent,
      message: localizedMessage(
        language,
        `В ${city}: доступно ${stock.availableQuantity} шт.`,
        `${city}: ${stock.availableQuantity} дана қолжетімді.`,
        `${stock.availableQuantity} units available in ${city}.`
      ),
      product,
      stock,
      quickReplies: productQuickReplies(language)
    };
  }

  private async price(
    session: ConversationSession,
    classified: IntentClassification,
    language: ConversationSession["language"]
  ): Promise<AssistantResponse> {
    const product = await this.requireProduct(session, classified, language);
    const city = this.requireCity(session, language, classified.intent);
    const price = await this.dependencies.catalog.getPrice({
      productId: product.id,
      city,
      warehouseId: session.warehouseId,
      quantity: classified.quantity ?? 1,
      customerType: session.customerType
    });
    if (price === null) {
      throw new AppError(
        "PRICE_UNAVAILABLE",
        "Current price was not returned by the catalog.",
        409
      );
    }
    return {
      type: "price",
      intent: classified.intent,
      message: localizedMessage(
        language,
        `Цена: ${price.unitPrice} ${price.currency}.`,
        `Бағасы: ${price.unitPrice} ${price.currency}.`,
        `Price: ${price.unitPrice} ${price.currency}.`
      ),
      product,
      price,
      quickReplies: productQuickReplies(language)
    };
  }

  private async certificates(
    session: ConversationSession,
    classified: IntentClassification,
    language: ConversationSession["language"]
  ): Promise<AssistantResponse> {
    const product = await this.requireProduct(session, classified, language);
    const result = await this.dependencies.catalog.getCertificates(product.id);
    if (result === null) {
      throw new AppError("NOT_FOUND", "Product certificates were not found.", 404);
    }
    return {
      type: "certificates",
      intent: classified.intent,
      message:
        result.documents.length === 0
          ? localizedMessage(
              language,
              "В доступной базе сертификаты не найдены.",
              "Қолжетімді базада сертификаттар табылмады.",
              "No certificates were found in the available official source."
            )
          : localizedMessage(
              language,
              `Найдено документов: ${result.documents.length}.`,
              `Табылған құжаттар: ${result.documents.length}.`,
              `Found ${result.documents.length} documents.`
            ),
      product,
      certificates: result.documents,
      quickReplies: productQuickReplies(language)
    };
  }

  private async analogs(
    session: ConversationSession,
    classified: IntentClassification,
    language: ConversationSession["language"]
  ): Promise<AssistantResponse> {
    const product = await this.requireProduct(session, classified, language);
    const city = this.requireCity(session, language, classified.intent);
    const analogs = await this.dependencies.analogs.findAnalogs({
      sourceProductId: product.id,
      city,
      warehouseId: session.warehouseId,
      quantity: classified.quantity ?? 1,
      maxResults: 5
    });
    return {
      type: "analogs",
      intent: classified.intent,
      message:
        analogs.candidates.length === 0
          ? localizedMessage(
              language,
              "Безопасный совместимый аналог не найден.",
              "Қауіпсіз үйлесімді аналог табылмады.",
              "No safe compatible analog was found."
            )
          : localizedMessage(
              language,
              `Подобрано аналогов: ${analogs.candidates.length}.`,
              `Табылған аналогтар: ${analogs.candidates.length}.`,
              `Found ${analogs.candidates.length} analogs.`
            ),
      product,
      analogs,
      quickReplies: productQuickReplies(language)
    };
  }

  private async prepareCart(
    input: ChatTurnInput,
    classified: IntentClassification,
    language: ConversationSession["language"]
  ): Promise<AssistantResponse> {
    const productId =
      input.selectedProductId ?? (await this.resolveProduct(input.session, classified))?.id;
    if (productId === undefined) {
      return noProductResponse(classified.intent, language);
    }
    const cartProposal = await this.dependencies.cart.prepare({
      sessionId: input.session.sessionId,
      productId,
      quantity: input.selectedQuantity ?? classified.quantity ?? 1,
      ...(input.session.userId === undefined ? {} : { actorUserId: input.session.userId })
    });
    return {
      type: "cart.proposal",
      intent: classified.intent,
      message: localizedMessage(
        language,
        "Проверьте состав и явно подтвердите добавление в корзину.",
        "Құрамын тексеріп, себетке қосуды нақты растаңыз.",
        "Review the proposal and explicitly confirm adding it to the cart."
      ),
      cartProposal,
      quickReplies: explicitConfirmQuickReplies(language)
    };
  }

  private async imageSearch(
    input: ChatTurnInput,
    classified: IntentClassification,
    language: ConversationSession["language"]
  ): Promise<AssistantResponse> {
    const extractedText = input.attachmentTexts?.join(" ").trim() ?? "";
    if (
      input.attachmentFileCount !== undefined &&
      input.attachmentFileCount > 0 &&
      extractedText.length === 0
    ) {
      return {
        type: "message",
        intent: classified.intent,
        message: localizedMessage(
          language,
          "На фото не удалось надёжно прочитать маркировку. Сделайте более чёткое фото шильдика или укажите артикул.",
          "Фотодан таңбалауды сенімді оқу мүмкін болмады. Жапсырманың анығырақ суретін түсіріңіз немесе артикулды жазыңыз.",
          "No reliable marking could be read from the image. Please provide a clearer label photo or an SKU."
        ),
        quickReplies: productQuickReplies(language)
      };
    }
    return this.searchProducts(input.session, classified, language);
  }

  private confirmationRequired(language: ConversationSession["language"]): AssistantResponse {
    return {
      type: "message",
      intent: "CART_CONFIRMATION",
      message: localizedMessage(
        language,
        "Добавление выполняется только кнопкой подтверждения для конкретного предложения.",
        "Қосу тек нақты ұсынысқа арналған растау батырмасы арқылы орындалады.",
        "Adding to cart requires the confirmation button for a specific proposal."
      ),
      quickReplies: explicitConfirmQuickReplies(language)
    };
  }

  private async cartView(
    session: ConversationSession,
    language: ConversationSession["language"]
  ): Promise<AssistantResponse> {
    const cart = await this.dependencies.cart.getCart(session.sessionId, session.userId);
    return {
      type: "cart",
      intent: "CART_VIEW",
      message:
        cart === null
          ? localizedMessage(
              language,
              "Корзина пока пуста.",
              "Себет әзірге бос.",
              "The cart is empty."
            )
          : localizedMessage(
              language,
              "Актуальная корзина получена.",
              "Ағымдағы себет алынды.",
              "The current cart was retrieved."
            ),
      quickReplies: productQuickReplies(language)
    };
  }

  private async knowledge(
    classified: IntentClassification,
    language: ConversationSession["language"]
  ): Promise<AssistantResponse> {
    const knowledge = await this.dependencies.knowledge.search({
      query: classified.query,
      language,
      limit: 3
    });
    return {
      type: "knowledge",
      intent: classified.intent,
      message:
        knowledge.length === 0
          ? localizedMessage(
              language,
              "Не нашёл подтверждённую информацию. Передам вопрос менеджеру.",
              "Расталған ақпарат табылмады. Сұрақты менеджерге беремін.",
              "I could not find verified information; this can be handed to a manager."
            )
          : knowledge.map((chunk) => chunk.content).join("\n\n"),
      knowledge,
      quickReplies: [
        localizedMessage(language, "Связаться с менеджером", "Менеджерге беру", "Contact a manager")
      ]
    };
  }

  private async handoff(
    session: ConversationSession,
    message: string,
    language: ConversationSession["language"]
  ): Promise<AssistantResponse> {
    const handoff = await this.dependencies.handoffs.create({
      sessionId: session.sessionId,
      customerQuestion: message,
      ...(session.city === undefined ? {} : { city: session.city }),
      productReferences: session.recentlyViewedProductIds,
      checkedInformation: [],
      unresolvedIssue: "Customer requested manager assistance."
    });
    return {
      type: "handoff",
      intent: "MANAGER_HANDOFF",
      message: localizedMessage(
        language,
        "Передал менеджеру собранную информацию.",
        "Жиналған ақпарат менеджерге берілді.",
        "The collected information was handed to a manager."
      ),
      handoff,
      quickReplies: []
    };
  }

  private generalHelp(language: ConversationSession["language"]): AssistantResponse {
    return {
      type: "message",
      intent: "GENERAL_SUPPORT",
      message: localizedMessage(
        language,
        "Помогу найти товар, проверить характеристики, наличие, цену или подобрать совместимый аналог.",
        "Тауарды табуға, сипаттамасын, қолжетімділігін, бағасын тексеруге және үйлесімді аналог таңдауға көмектесемін.",
        "I can find a product, check specifications, stock, price, or a compatible analog."
      ),
      quickReplies: productQuickReplies(language)
    };
  }

  private async resolveProduct(
    session: ConversationSession,
    classified: IntentClassification
  ): Promise<CatalogProduct | null> {
    const reference = classified.productReference;
    if (reference !== undefined) {
      const direct = await this.dependencies.catalog.getProduct({ sku: reference });
      if (direct !== null) {
        return direct;
      }
    }
    if (session.city === undefined) {
      return null;
    }
    const result = await this.dependencies.catalog.searchProducts({
      query: classified.query,
      city: session.city,
      warehouseId: session.warehouseId,
      filters: {},
      inStockOnly: false,
      limit: 1
    });
    return result.items[0]?.product ?? null;
  }

  private async requireProduct(
    session: ConversationSession,
    classified: IntentClassification,
    language: ConversationSession["language"]
  ): Promise<CatalogProduct> {
    const product = await this.resolveProduct(session, classified);
    if (product === null) {
      throw new AppError(
        "NOT_FOUND",
        localizedMessage(
          language,
          "Товар не найден. Укажите артикул или точное название.",
          "Тауар табылмады. Артикулды немесе нақты атауын көрсетіңіз.",
          "Product not found. Provide an SKU or exact name."
        ),
        404
      );
    }
    return product;
  }
}

function noProductResponse(
  intent: Intent,
  language: ConversationSession["language"]
): AssistantResponse {
  return {
    type: "message",
    intent,
    message: localizedMessage(
      language,
      "Укажите артикул или точное название товара.",
      "Тауардың артикулын немесе нақты атауын көрсетіңіз.",
      "Please provide an SKU or exact product name."
    ),
    quickReplies: productQuickReplies(language)
  };
}

function productQuickReplies(language: ConversationSession["language"]): readonly string[] {
  return [
    localizedMessage(language, "Проверить наличие", "Қолжетімділікті тексеру", "Check stock"),
    localizedMessage(language, "Узнать цену", "Бағасын білу", "Check price"),
    localizedMessage(language, "Подобрать аналог", "Аналог таңдау", "Find an analog")
  ];
}

function explicitConfirmQuickReplies(language: ConversationSession["language"]): readonly string[] {
  return [localizedMessage(language, "Добавить в корзину", "Себетке қосу", "Add to cart")];
}

function enrichClassificationWithAttachment(
  classification: IntentClassification,
  attachmentTexts: readonly string[] | undefined
): IntentClassification {
  const extracted = attachmentTexts
    ?.filter((text) => text.trim().length > 0)
    .join(" ")
    .trim();
  if (extracted === undefined || extracted.length === 0) return classification;
  const query =
    classification.intent === "IMAGE_PRODUCT_SEARCH"
      ? extracted
      : `${classification.query} ${extracted}`;
  return { ...classification, query };
}
