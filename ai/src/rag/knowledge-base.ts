import type { Language } from "../types/domain.js";

export type KnowledgeDocumentType =
  "delivery" | "payment" | "return" | "faq" | "policy" | "certificate";

export interface KnowledgeChunk {
  readonly id: string;
  readonly documentId: string;
  readonly title: string;
  readonly section: string;
  readonly content: string;
  readonly sourceUrl: string;
  readonly language: Language;
  readonly documentType: KnowledgeDocumentType;
  readonly productId?: string;
  readonly category?: string;
  readonly updatedAt: string;
}

export interface KnowledgeSearchInput {
  readonly query: string;
  readonly language: Language;
  readonly limit: number;
}

export interface KnowledgeRepository {
  search(input: KnowledgeSearchInput): Promise<readonly KnowledgeChunk[]>;
}

/**
 * Demo-only official-content repository. It deliberately returns attributed source chunks,
 * never model-generated policy text. A PostgreSQL retrieval adapter can replace it in production.
 */
export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  private readonly chunks: readonly KnowledgeChunk[];

  public constructor(siteUrl: string) {
    const sourceUrl = `${siteUrl.replace(/\/$/, "")}/delivery-and-payment`;
    this.chunks = [
      {
        id: "kb-delivery-ru",
        documentId: "delivery-payment",
        title: "Доставка и оплата",
        section: "Уточнение условий",
        content:
          "Точные сроки, стоимость доставки и доступные способы оплаты зависят от города, состава заказа и условий EKT. Перед оформлением их необходимо подтвердить по официальному источнику.",
        sourceUrl,
        language: "ru",
        documentType: "delivery",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "kb-return-ru",
        documentId: "returns",
        title: "Возврат",
        section: "Возврат товара",
        content:
          "Условия возврата зависят от типа товара и статуса заказа. Для точного решения необходимо сверить официальные правила и данные заказа.",
        sourceUrl: `${siteUrl.replace(/\/$/, "")}/returns`,
        language: "ru",
        documentType: "return",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "kb-delivery-kk",
        documentId: "delivery-payment",
        title: "Жеткізу және төлем",
        section: "Шарттарды нақтылау",
        content:
          "Жеткізудің нақты мерзімі, құны және төлем тәсілдері қалаға, тапсырыс құрамына және EKT шарттарына байланысты. Рәсімдеу алдында оларды ресми дереккөзден растау қажет.",
        sourceUrl,
        language: "kk",
        documentType: "delivery",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "kb-return-kk",
        documentId: "returns",
        title: "Қайтару",
        section: "Тауарды қайтару",
        content:
          "Қайтару шарттары тауар түріне және тапсырыс мәртебесіне тәуелді. Нақты шешім үшін ресми ережелер мен тапсырыс деректерін тексеру қажет.",
        sourceUrl: `${siteUrl.replace(/\/$/, "")}/returns`,
        language: "kk",
        documentType: "return",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ];
  }

  public async search(input: KnowledgeSearchInput): Promise<readonly KnowledgeChunk[]> {
    const terms = tokenize(input.query);
    const sameLanguage = this.chunks.filter((chunk) => chunk.language === input.language);
    const candidateChunks =
      sameLanguage.length > 0
        ? sameLanguage
        : this.chunks.filter((chunk) => chunk.language === "ru");
    return candidateChunks
      .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, input.limit)
      .map(({ chunk }) => chunk);
  }
}

function tokenize(value: string): readonly string[] {
  return value
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 3);
}

function scoreChunk(chunk: KnowledgeChunk, terms: readonly string[]): number {
  const haystack = `${chunk.title} ${chunk.section} ${chunk.content}`.toLocaleLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}
