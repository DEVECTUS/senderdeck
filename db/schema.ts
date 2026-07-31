import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const emailAccounts = sqliteTable(
  "email_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    provider: text("provider", { enum: ["google", "microsoft"] }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    email: text("email").notNull(),
    label: text("label").notNull(),
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: integer("token_expires_at"),
    scopes: text("scopes").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("email_accounts_user_provider_account_uidx").on(
      table.userId,
      table.provider,
      table.providerAccountId,
    ),
    index("email_accounts_user_idx").on(table.userId),
  ],
);

export const oauthStates = sqliteTable(
  "oauth_states",
  {
    stateHash: text("state_hash").primaryKey(),
    userId: text("user_id").notNull(),
    provider: text("provider", { enum: ["google", "microsoft"] }).notNull(),
    codeVerifier: text("code_verifier").notNull(),
    label: text("label").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("oauth_states_expiry_idx").on(table.expiresAt)],
);
