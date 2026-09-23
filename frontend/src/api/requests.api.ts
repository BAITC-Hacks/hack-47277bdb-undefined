import apiClient, { requestData } from "./client";
import type { CustomerRequest, CustomerRequestPayload } from "../types/content.types";

export const requestsApi = {
  create: ({ type, name, phone, email, company, message }: CustomerRequestPayload) =>
    requestData<CustomerRequest>(apiClient.post("/requests", { type, name, phone, email, company, message })),
  async imageSearch(_file: FormData): Promise<never> {
    throw Object.assign(new Error("Сурет бойынша іздеу әзірге бапталмаған. Атауы немесе артикулы бойынша іздеңіз."), { code: "IMAGE_SEARCH_NOT_CONFIGURED" });
  },
};
