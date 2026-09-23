import apiClient, { requestData } from "./client";

export interface HealthStatus { status: "OK"; database: "connected"; timestamp: string; }
export const healthApi = { get: () => requestData<HealthStatus>(apiClient.get("/health")) };
