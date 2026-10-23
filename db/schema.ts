import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Social data is separate from mailbox records. Every application query authorises
// membership before using a customer, brand or account supplied by a client.
export const socialCustomers = sqliteTable("social_customers", {
  id: text("id").primaryKey(), name: text("name").notNull(), createdAt: integer("created_at").notNull(),
});
export const socialRuntime = sqliteTable("social_runtime", { key: text("key").primaryKey(), value: integer("value").notNull() });
// Global operator configuration is never owned by a customer or exposed by workspace tools.
export const socialPlatformSecrets = sqliteTable("social_platform_secrets", {
  key: text("key").primaryKey(), encrypted: text("encrypted").notNull(), updatedAt: integer("updated_at").notNull(),
});
export const socialPlatformAudit = sqliteTable("social_platform_audit", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), action: text("action").notNull(), keys: text("keys").notNull(), createdAt: integer("created_at").notNull(),
});
export const socialMembers = sqliteTable("social_members", {
  id: text("id").primaryKey(), customerId: text("customer_id").notNull().references(() => socialCustomers.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(), role: text("role").notNull(),
}, t => [uniqueIndex("social_member_unique").on(t.customerId, t.userId), index("social_member_user").on(t.userId)]);
export const socialBrands = sqliteTable("social_brands", {
  id: text("id").primaryKey(), customerId: text("customer_id").notNull().references(() => socialCustomers.id, { onDelete: "cascade" }),
  name: text("name").notNull(), profile: text("profile").notNull(), revision: integer("revision").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});
export const socialAccounts = sqliteTable("social_accounts", {
  id: text("id").primaryKey(), brandId: text("brand_id").notNull().references(() => socialBrands.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), assetId: text("asset_id").notNull(), parentId: text("parent_id"),
  providerUserId: text("provider_user_id"), name: text("name").notNull(), token: text("token"), userToken: text("user_token"),
  expiresAt: integer("expires_at"), permissions: text("permissions").notNull(), status: text("status").notNull(),
  validation: text("validation").notNull(), validatedAt: integer("validated_at"),
  monitoring: text("monitoring").notNull(), lastReconciledAt: integer("last_reconciled_at"),
  createdAt: integer("created_at").notNull(),
}, t => [uniqueIndex("social_asset_unique").on(t.provider, t.assetId), index("social_account_brand").on(t.brandId)]);
export const socialMonitorEvidence = sqliteTable("social_monitor_evidence", {
  accountId: text("account_id").primaryKey().references(() => socialAccounts.id, { onDelete: "cascade" }),
  messagesAt: integer("messages_at"), commentsAt: integer("comments_at"), pollAt: integer("poll_at"),
  pollErrors: text("poll_errors").notNull().default("[]"),
});
export const socialOauth = sqliteTable("social_oauth", {
  hash: text("hash").primaryKey(), brandId: text("brand_id").notNull().references(() => socialBrands.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(), redirectUri: text("redirect_uri").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const socialGrants = sqliteTable("social_grants", {
  id: text("id").primaryKey(), brandId: text("brand_id").notNull().references(() => socialBrands.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(), encrypted: text("encrypted").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const socialThreads = sqliteTable("social_threads", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(), kind: text("kind").notNull(), target: text("target").notNull(),
  sourceUrl: text("source_url"), status: text("status").notNull(), assignedTo: text("assigned_to"),
  nextAction: text("next_action").notNull(), lastInboundAt: integer("last_inbound_at"), lastDigest: text("last_digest"),
  updatedAt: integer("updated_at").notNull(),
}, t => [uniqueIndex("social_thread_unique").on(t.accountId, t.kind, t.providerId)]);
export const socialSnapshots = sqliteTable("social_snapshots", {
  id: text("id").primaryKey(), threadId: text("thread_id").notNull().references(() => socialThreads.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(), digest: text("digest").notNull(), encrypted: text("encrypted").notNull(),
  complete: integer("complete").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const socialDrafts = sqliteTable("social_drafts", {
  id: text("id").primaryKey(), threadId: text("thread_id").notNull().references(() => socialThreads.id, { onDelete: "cascade" }),
  snapshotId: text("snapshot_id").notNull(), brandRevision: integer("brand_revision").notNull(),
  revision: text("revision").notNull(), encrypted: text("encrypted").notNull(), state: text("state").notNull(),
  createdBy: text("created_by").notNull(), approvalHash: text("approval_hash"), approver: text("approver"),
  approvalExpiresAt: integer("approval_expires_at"), expiresAt: integer("expires_at").notNull(),
  providerResult: text("provider_result"), createdAt: integer("created_at").notNull(),
});
export const socialQueue = sqliteTable("social_queue", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
  encrypted: text("encrypted").notNull(), state: text("state").notNull(), attempts: integer("attempts").notNull().default(0),
  error: text("error"), createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull(),
  claimedAt: integer("claimed_at"),
}, t => [index("social_queue_state").on(t.state, t.createdAt)]);
export const socialActivity = sqliteTable("social_activity", {
  id: text("id").primaryKey(), brandId: text("brand_id").notNull().references(() => socialBrands.id, { onDelete: "cascade" }),
  actor: text("actor").notNull(), action: text("action").notNull(), objectId: text("object_id").notNull(),
  detail: text("detail").notNull(), createdAt: integer("created_at").notNull(),
});
export const socialNotices = sqliteTable("social_notices", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
  fingerprint: text("fingerprint").notNull(), reason: text("reason").notNull(), readAt: integer("read_at"),
  createdAt: integer("created_at").notNull(),
}, t => [uniqueIndex("social_notice_fingerprint").on(t.accountId, t.fingerprint)]);
export const socialIdentityLinks = sqliteTable("social_identity_links", {
  id: text("id").primaryKey(), brandId: text("brand_id").notNull().references(() => socialBrands.id, { onDelete: "cascade" }),
  encrypted: text("encrypted").notNull(), confirmedBy: text("confirmed_by").notNull(), createdAt: integer("created_at").notNull(),
});

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

export const senderdeckPasswordLogins = sqliteTable("senderdeck_password_logins", {
  userId: text("user_id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const senderdeckLoginAttempts = sqliteTable("senderdeck_login_attempts", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, table => [index("senderdeck_login_attempts_expiry_idx").on(table.expiresAt)]);

export const senderdeckIdentities = sqliteTable(
  "senderdeck_identities",
  {
    provider: text("provider", { enum: ["google", "microsoft"] }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("senderdeck_identities_provider_account_uidx").on(
      table.provider,
      table.providerAccountId,
    ),
    index("senderdeck_identities_user_idx").on(table.userId),
  ],
);

export const senderdeckLoginStates = sqliteTable(
  "senderdeck_login_states",
  {
    stateHash: text("state_hash").primaryKey(),
    provider: text("provider", { enum: ["google", "microsoft"] }).notNull(),
    codeVerifier: text("code_verifier").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    returnTo: text("return_to").notNull(),
    linkingUserId: text("linking_user_id"),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("senderdeck_login_states_expiry_idx").on(table.expiresAt)],
);

export const senderdeckSessions = sqliteTable(
  "senderdeck_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    index("senderdeck_sessions_user_idx").on(table.userId),
    index("senderdeck_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const mcpOauthClients = sqliteTable("mcp_oauth_clients", {
  clientId: text("client_id").primaryKey(),
  redirectUris: text("redirect_uris").notNull(),
  clientName: text("client_name"),
  createdAt: integer("created_at").notNull(),
});

export const mcpAuthorizationRequests = sqliteTable(
  "mcp_authorization_requests",
  {
    requestHash: text("request_hash").primaryKey(),
    userId: text("user_id").notNull(),
    clientId: text("client_id").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    scope: text("scope").notNull(),
    state: text("state"),
    resource: text("resource").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("mcp_authorization_requests_expiry_idx").on(table.expiresAt)],
);

export const mcpAuthorizationCodes = sqliteTable(
  "mcp_authorization_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    userId: text("user_id").notNull(),
    clientId: text("client_id").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    scope: text("scope").notNull(),
    resource: text("resource").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("mcp_authorization_codes_expiry_idx").on(table.expiresAt)],
);

export const mcpOauthTokens = sqliteTable(
  "mcp_oauth_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    tokenType: text("token_type", { enum: ["access", "refresh"] }).notNull(),
    userId: text("user_id").notNull(),
    clientId: text("client_id").notNull(),
    scope: text("scope").notNull(),
    resource: text("resource").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("mcp_oauth_tokens_expiry_idx").on(table.expiresAt),
    index("mcp_oauth_tokens_user_idx").on(table.userId),
  ],
);
