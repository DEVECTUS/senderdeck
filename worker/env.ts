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
  ASSETS?: WorkerFetcher;
  DB: WorkerD1Database;
  IMAGES?: {
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
  /** Hosting-owner-approved exact OpenAI subject -> active provider user ID links. */
  OPENAI_SIGNIN_LINKS?: string;
  /** Expiring, narrowly scoped hosting-operator retirement plan. Absent by default. */
  ACCOUNT_RETIREMENT_PLAN?: string;
  /** Expiring hosting-owner plan for creating one existing user's password login. */
  PASSWORD_PROVISION_PLAN?: string;
  MAX_ATTACHMENT_BYTES?: string;
  MAX_TOTAL_ATTACHMENT_BYTES?: string;
  BLOCKED_ATTACHMENT_EXTENSIONS?: string;
  BLOCKED_ATTACHMENT_MIME_TYPES?: string;
  OPENAI_APPS_CHALLENGE?: string;
  REVIEW_ACCESS_USERNAME?: string;
  REVIEW_ACCESS_PASSWORD_HASH?: string;
  REVIEW_ACCESS_USER_ID?: string;
  REVIEW_ACCESS_EMAIL?: string;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  META_LOGIN_CONFIG_ID?: string;
  WHATSAPP_LOGIN_CONFIG_ID?: string;
  WHATSAPP_COEXISTENCE_CONFIG_ID?: string;
  META_WEBHOOK_VERIFY_TOKEN?: string;
  META_ACCESS_TIER?: string;
  SOCIAL_PUBLIC_ORIGIN?: string;
  SOCIAL_SEND_ENABLED?: string;
  SOCIAL_SCHEDULER_ENABLED?: string;
  SOCIAL_MAINTENANCE_TOKEN?: string;
  SOCIAL_OPERATOR_USER_IDS?: string;
  LINKEDIN_CLIENT_ID?: string;
  LINKEDIN_CLIENT_SECRET?: string;
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
  signInEnabled?: boolean;
  id: string;
  provider: Provider;
  email: string;
  label: string;
  scopes: string[];
  connectedAt: string;
  senderIdentities?: SenderIdentity[];
  senderDiscoveryError?: string;
  /** Present only when routing an exact sender email, not a label. */
  selectedFrom?: string;
}

export interface SenderIdentity {
  email: string;
  displayName: string;
  isPrimary: boolean;
  isDefault: boolean;
}
