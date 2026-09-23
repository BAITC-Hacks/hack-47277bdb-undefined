export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  name: string;
  phone?: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}
