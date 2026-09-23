import apiClient, { requestData, requestList } from "./client";
import type { NewsArticle } from "../types/content.types";
import type { ListResult } from "../types/api.types";
import { news } from "../mocks/mock-data";
import { mockResponse, useMocks } from "../mocks/mock-api";
import { resolveAssetUrl } from "../utils/assets";

const normalize = (article: NewsArticle): NewsArticle => ({ ...article, imageUrl: resolveAssetUrl(article.imageUrl) });
export const newsApi = {
  async list({ page = 1, limit = 20 }: { page?: number; limit?: number } = {}): Promise<ListResult<NewsArticle>> {
    if (useMocks) return mockResponse({ data: news.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total: news.length, totalPages: Math.ceil(news.length / limit) } });
    const result = await requestList<NewsArticle>(apiClient.get("/news", { params: { page, limit } }));
    return { ...result, data: result.data.map(normalize) };
  },
  async get(slug: string): Promise<NewsArticle> {
    if (useMocks) {
      const article = news.find((item) => item.slug === slug);
      if (!article) throw Object.assign(new Error("Жаңалық табылмады"), { status: 404 });
      return mockResponse(article);
    }
    return normalize(await requestData<NewsArticle>(apiClient.get(`/news/${encodeURIComponent(slug)}`)));
  },
};
