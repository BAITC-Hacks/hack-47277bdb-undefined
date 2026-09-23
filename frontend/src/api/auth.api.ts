import apiClient, { requestData } from "./client";
import type { AuthSession, LoginPayload, RegisterPayload, AuthUser } from "../types/auth.types";
export const authApi = {
  login: (payload: LoginPayload) => requestData<AuthSession>(apiClient.post("/auth/login", payload)),
  register: (payload: RegisterPayload) => requestData<AuthSession>(apiClient.post("/auth/register", payload)),
  me: () => requestData<AuthUser>(apiClient.get("/auth/me"))
};
