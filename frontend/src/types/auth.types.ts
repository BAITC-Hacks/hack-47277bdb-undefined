export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  role: "CUSTOMER" | "ADMIN" | "MANAGER";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
}

export interface ProfileUpdatePayload {
  firstName?: string;
  lastName?: string | null;
  phone?: string | null;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}
