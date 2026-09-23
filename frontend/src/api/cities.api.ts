import apiClient, { requestData } from "./client";
import { cities } from "../mocks/mock-data";
import { mockResponse, useMocks } from "../mocks/mock-api";
import type { City, Branch } from "../types/city.types";
export const citiesApi = {
  list: () => useMocks ? mockResponse(cities) : requestData<City[]>(apiClient.get("/cities")),
  async get(slug: string): Promise<City> {
    if (useMocks) {
      const city = cities.find((item) => item.slug === slug);
      if (!city) throw Object.assign(new Error("Қала табылмады"), { status: 404 });
      return mockResponse(city);
    }
    return requestData<City>(apiClient.get(`/cities/${encodeURIComponent(slug)}`));
  },
  branches: (city?: string) => requestData<Branch[]>(apiClient.get("/branches", { params: { city } })),
};
