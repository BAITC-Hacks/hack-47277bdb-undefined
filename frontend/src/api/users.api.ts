import apiClient, { requestData } from "./client";
import type { AuthUser, ProfileUpdatePayload } from "../types/auth.types";

export const usersApi = {
  me: () => requestData<AuthUser>(apiClient.get("/users/me")),
  update: ({ firstName, lastName, phone }: ProfileUpdatePayload) =>
    requestData<AuthUser>(apiClient.patch("/users/me", { firstName, lastName, phone })),
};
