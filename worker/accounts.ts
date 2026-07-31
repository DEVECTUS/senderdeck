import { decrypt, encrypt } from "./crypto";
import type { AccountView, Env, Provider, StoredAccount } from "./env";
import { HttpError } from "./auth";

const MAX_ACCOUNTS = 10;

function accountView(account: StoredAccount): AccountView {
  return {
    id: account.id,
    provider: account.provider,
    email: account.email,
    label: account.label,
    scopes: account.scopes.split(" ").filter(Boolean),
    connectedAt: new Date(account.created_at).toISOString(),
  };
}

export async function listAccounts(env: Env, userId: string): Promise<AccountView[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM email_accounts WHERE user_id = ? ORDER BY created_at ASC`,
  )
    .bind(userId)
    .all<StoredAccount>();
  return result.results.map(accountView);
}

export async function getAccount(
  env: Env,
  userId: string,
  accountId: string,
): Promise<StoredAccount> {
  const account = await env.DB.prepare(
    `SELECT * FROM email_accounts WHERE user_id = ? AND id = ?`,
  )
    .bind(userId, accountId)
    .first<StoredAccount>();
  if (!account) throw new HttpError(404, `Email account ${accountId} was not found.`);
  return account;
}

export async function resolveAccounts(
  env: Env,
  userId: string,
  accountIds?: string[],
): Promise<StoredAccount[]> {
  const allResult = await env.DB.prepare(
    `SELECT * FROM email_accounts WHERE user_id = ? ORDER BY created_at ASC`,
  )
    .bind(userId)
    .all<StoredAccount>();
  const all = allResult.results;
  if (!accountIds?.length) return all;
  const selected = accountIds.map((id) => all.find((account) => account.id === id));
  if (selected.some((account) => !account)) {
    throw new HttpError(400, "One or more selected account IDs are invalid.");
  }
  return selected as StoredAccount[];
}

export async function routeAccount(
  env: Env,
  userId: string,
  hint: string,
  provider?: Provider,
): Promise<AccountView> {
  const normalizedHint = hint.trim().toLowerCase();
  const accounts = (await resolveAccounts(env, userId)).filter(
    (account) => !provider || account.provider === provider,
  );
  const exact = accounts.filter(
    (account) =>
      account.id.toLowerCase() === normalizedHint ||
      account.email.toLowerCase() === normalizedHint ||
      account.label.toLowerCase() === normalizedHint,
  );
  if (exact.length === 1) return accountView(exact[0]);
  const partial = accounts.filter(
    (account) =>
      account.email.toLowerCase().includes(normalizedHint) ||
      account.label.toLowerCase().includes(normalizedHint),
  );
  if (partial.length === 1) return accountView(partial[0]);
  if (exact.length + partial.length === 0) {
    throw new HttpError(404, "No account matches that sender hint.");
  }
  throw new HttpError(
    409,
    "The sender hint is ambiguous. Ask the user to select an account ID explicitly.",
  );
}

export async function updateAccountLabel(
  env: Env,
  userId: string,
  accountId: string,
  label: string,
): Promise<AccountView> {
  const cleanLabel = label.trim();
  if (!cleanLabel || cleanLabel.length > 80) {
    throw new HttpError(400, "Account label must be between 1 and 80 characters.");
  }
  await getAccount(env, userId, accountId);
  await env.DB.prepare(
    `UPDATE email_accounts SET label = ?, updated_at = ? WHERE user_id = ? AND id = ?`,
  )
    .bind(cleanLabel, Date.now(), userId, accountId)
    .run();
  return accountView(await getAccount(env, userId, accountId));
}

export async function disconnectAccount(
  env: Env,
  userId: string,
  accountId: string,
): Promise<void> {
  await getAccount(env, userId, accountId);
  await env.DB.prepare(`DELETE FROM email_accounts WHERE user_id = ? AND id = ?`)
    .bind(userId, accountId)
    .run();
}

export async function saveAccount(
  env: Env,
  input: {
    userId: string;
    provider: Provider;
    providerAccountId: string;
    email: string;
    label: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    scopes: string[];
  },
): Promise<AccountView> {
  const existing = await env.DB.prepare(
    `SELECT * FROM email_accounts
     WHERE user_id = ? AND provider = ? AND provider_account_id = ?`,
  )
    .bind(input.userId, input.provider, input.providerAccountId)
    .first<StoredAccount>();

  if (!existing) {
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM email_accounts WHERE user_id = ?`,
    )
      .bind(input.userId)
      .first<{ count: number }>();
    if ((count?.count ?? 0) >= MAX_ACCOUNTS) {
      throw new HttpError(409, `A maximum of ${MAX_ACCOUNTS} email accounts may be connected.`);
    }
  }

  const now = Date.now();
  const id = existing?.id ?? crypto.randomUUID();
  const encryptedAccessToken = await encrypt(input.accessToken, env.TOKEN_ENCRYPTION_KEY);
  const encryptedRefreshToken = input.refreshToken
    ? await encrypt(input.refreshToken, env.TOKEN_ENCRYPTION_KEY)
    : existing?.encrypted_refresh_token ?? null;

  await env.DB.prepare(
    `INSERT INTO email_accounts (
      id, user_id, provider, provider_account_id, email, label,
      encrypted_access_token, encrypted_refresh_token, token_expires_at,
      scopes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, provider, provider_account_id) DO UPDATE SET
      email = excluded.email,
      label = excluded.label,
      encrypted_access_token = excluded.encrypted_access_token,
      encrypted_refresh_token = excluded.encrypted_refresh_token,
      token_expires_at = excluded.token_expires_at,
      scopes = excluded.scopes,
      updated_at = excluded.updated_at`,
  )
    .bind(
      id,
      input.userId,
      input.provider,
      input.providerAccountId,
      input.email.toLowerCase(),
      input.label,
      encryptedAccessToken,
      encryptedRefreshToken,
      input.expiresAt ?? null,
      input.scopes.join(" "),
      existing?.created_at ?? now,
      now,
    )
    .run();

  return accountView(await getAccount(env, input.userId, id));
}

export async function getAccessToken(env: Env, account: StoredAccount): Promise<string> {
  if (!account.token_expires_at || account.token_expires_at > Date.now() + 60_000) {
    return decrypt(account.encrypted_access_token, env.TOKEN_ENCRYPTION_KEY);
  }
  if (!account.encrypted_refresh_token) {
    throw new HttpError(401, `Reconnect ${account.email}; its authorization has expired.`);
  }

  const refreshToken = await decrypt(
    account.encrypted_refresh_token,
    env.TOKEN_ENCRYPTION_KEY,
  );
  const refreshed =
    account.provider === "google"
      ? await refreshGoogleToken(env, refreshToken)
      : await refreshMicrosoftToken(env, refreshToken);
  const encryptedAccessToken = await encrypt(
    refreshed.accessToken,
    env.TOKEN_ENCRYPTION_KEY,
  );
  const expiresAt = Date.now() + refreshed.expiresIn * 1000;
  await env.DB.prepare(
    `UPDATE email_accounts
     SET encrypted_access_token = ?, token_expires_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(encryptedAccessToken, expiresAt, Date.now(), account.id, account.user_id)
    .run();
  return refreshed.accessToken;
}

async function refreshGoogleToken(
  env: Env,
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth is not configured.");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !data.access_token) {
    throw new HttpError(401, `Google token refresh failed: ${data.error ?? response.status}.`);
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 };
}

async function refreshMicrosoftToken(
  env: Env,
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new Error("Microsoft OAuth is not configured.");
  }
  const tenant = env.MICROSOFT_TENANT || "common";
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: microsoftScopes().join(" "),
      }),
    },
  );
  const data = (await response.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !data.access_token) {
    throw new HttpError(
      401,
      `Microsoft token refresh failed: ${data.error ?? response.status}.`,
    );
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 };
}

export function googleScopes(): string[] {
  return [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
  ];
}

export function microsoftScopes(): string[] {
  return ["openid", "profile", "email", "offline_access", "Mail.ReadWrite", "Mail.Send"];
}
