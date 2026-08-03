export interface WorkerFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface WorkerD1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export interface Env {
  ASSETS: WorkerFetcher;
  DB: WorkerD1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  TOKEN_ENCRYPTION_KEY: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  MICROSOFT_TENANT?: string;
  ALLOW_DEV_AUTH?: string;
  MAX_ATTACHMENT_BYTES?: string;
  MAX_TOTAL_ATTACHMENT_BYTES?: string;
  BLOCKED_ATTACHMENT_EXTENSIONS?: string;
  BLOCKED_ATTACHMENT_MIME_TYPES?: string;
  OPENAI_APPS_CHALLENGE?: string;
}

export type Provider = "google" | "microsoft";

export interface StoredAccount {
  id: string;
  user_id: string;
  provider: Provider;
  provider_account_id: string;
  email: string;
  label: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string | null;
  token_expires_at: number | null;
  scopes: string;
  created_at: number;
  updated_at: number;
}

export interface AccountView {
  id: string;
  provider: Provider;
  email: string;
  label: string;
  scopes: string[];
  connectedAt: string;
}
