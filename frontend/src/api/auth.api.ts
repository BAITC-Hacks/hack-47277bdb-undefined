import apiClient, { requestData } from "./client";
import type { AuthSession, LoginPayload, RegisterPayload, AuthUser } from "../types/auth.types";
export const authApi = {
  login: ({ email, password }: LoginPayload) => requestData<AuthSession>(apiClient.post("/auth/login", { email, password })),
  register: ({ email, password, firstName, lastName, phone }: RegisterPayload) =>
    requestData<AuthSession>(apiClient.post("/auth/register", { email, password, firstName, lastName, phone })),
  me: () => requestData<AuthUser>(apiClient.get("/auth/me"))
};
