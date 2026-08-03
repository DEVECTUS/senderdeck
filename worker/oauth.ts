import { HttpError, requireUserId } from "./auth";
import { googleScopes, microsoftScopes, saveAccount } from "./accounts";
import { randomBase64Url, sha256Base64Url } from "./crypto";
import type { Env, Provider } from "./env";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export async function handleOAuthRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/oauth\/(google|microsoft)\/(start|callback)$/);
  if (!match) return null;
  const provider = match[1] as Provider;

  try {
    return match[2] === "start"
      ? await startOAuth(request, env, provider)
      : await finishOAuth(request, env, provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth failed.";
    return new Response(oauthResultPage(false, message, provider), {
      status: error instanceof HttpError ? error.status : 500,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}

async function startOAuth(request: Request, env: Env, provider: Provider): Promise<Response> {
  const url = new URL(request.url);
  const authenticatedUser = request.headers.get("oai-authenticated-user-id")?.trim()
    || request.headers.get("oai-authenticated-user-email")?.trim();
  const devEmail = env.ALLOW_DEV_AUTH === "true"
    ? request.headers.get("x-dev-user-email")?.trim()
    : null;
  if (!authenticatedUser && !devEmail) {
    const returnTo = `${url.pathname}${url.search}`;
    return Response.redirect(`${url.origin}/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`, 302);
  }
  const userId = requireUserId(request, env);
  assertProviderConfigured(env, provider);
  const label = (url.searchParams.get("label") || defaultLabel(provider)).trim().slice(0, 80);
  const state = randomBase64Url();
  const stateHash = await sha256Base64Url(state);
  const codeVerifier = randomBase64Url(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const redirectUri = `${url.origin}/oauth/${provider}/callback`;
  const now = Date.now();

  await env.DB.prepare(`DELETE FROM oauth_states WHERE expires_at < ?`).bind(now).run();
  await env.DB.prepare(
    `INSERT INTO oauth_states (
      state_hash, user_id, provider, code_verifier, label, redirect_uri, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      stateHash,
      userId,
      provider,
      codeVerifier,
      label,
      redirectUri,
      now,
      now + OAUTH_STATE_TTL_MS,
    )
    .run();

  const authorizeUrl =
    provider === "google"
      ? googleAuthorizeUrl(env, redirectUri, state, codeChallenge)
      : microsoftAuthorizeUrl(env, redirectUri, state, codeChallenge);
  return Response.redirect(authorizeUrl, 302);
}

async function finishOAuth(request: Request, env: Env, provider: Provider): Promise<Response> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) throw new HttpError(400, `Authorization was not completed: ${error}.`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) throw new HttpError(400, "OAuth callback is missing code or state.");

  const stateHash = await sha256Base64Url(state);
  const stored = await env.DB.prepare(
    `SELECT * FROM oauth_states WHERE state_hash = ? AND provider = ?`,
  )
    .bind(stateHash, provider)
    .first<{
      state_hash: string;
      user_id: string;
      provider: Provider;
      code_verifier: string;
      label: string;
      redirect_uri: string;
      expires_at: number;
    }>();
  if (!stored || stored.expires_at < Date.now()) {
    throw new HttpError(400, "OAuth state is invalid or expired. Start the connection again.");
  }
  await env.DB.prepare(`DELETE FROM oauth_states WHERE state_hash = ?`).bind(stateHash).run();

  const token = await exchangeCode(env, provider, code, stored.redirect_uri, stored.code_verifier);
  const profile =
    provider === "google"
      ? await googleProfile(token.accessToken)
      : await microsoftProfile(token.accessToken);
  const account = await saveAccount(env, {
    userId: stored.user_id,
    provider,
    providerAccountId: profile.id,
    email: profile.email,
    label: stored.label,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: Date.now() + token.expiresIn * 1000,
    scopes: token.scopes,
  });

  return new Response(
    oauthResultPage(true, `${account.email} is connected as “${account.label}”.`, provider),
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

function googleAuthorizeUrl(
  env: Env,
  redirectUri: string,
  state: string,
  codeChallenge: string,
): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: googleScopes().join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent select_account",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

function microsoftAuthorizeUrl(
  env: Env,
  redirectUri: string,
  state: string,
  codeChallenge: string,
): string {
  const tenant = env.MICROSOFT_TENANT || "common";
  const url = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`,
  );
  url.search = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: microsoftScopes().join(" "),
    prompt: "select_account",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

async function exchangeCode(
  env: Env,
  provider: Provider,
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scopes: string[];
}> {
  const isGoogle = provider === "google";
  const endpoint = isGoogle
    ? "https://oauth2.googleapis.com/token"
    : `https://login.microsoftonline.com/${encodeURIComponent(env.MICROSOFT_TENANT || "common")}/oauth2/v2.0/token`;
  const clientId = isGoogle ? env.GOOGLE_CLIENT_ID! : env.MICROSOFT_CLIENT_ID!;
  const clientSecret = isGoogle
    ? env.GOOGLE_CLIENT_SECRET!
    : env.MICROSOFT_CLIENT_SECRET!;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
  if (!isGoogle) body.set("scope", microsoftScopes().join(" "));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new HttpError(
      400,
      `Token exchange failed: ${data.error_description ?? data.error ?? response.status}.`,
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
    scopes: (data.scope || (isGoogle ? googleScopes() : microsoftScopes()).join(" "))
      .split(" ")
      .filter(Boolean),
  };
}

async function googleProfile(accessToken: string): Promise<{ id: string; email: string }> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = (await response.json()) as { id?: string; email?: string };
  if (!response.ok || !data.id || !data.email) throw new HttpError(400, "Could not read Google account identity.");
  return { id: data.id, email: data.email };
}

async function microsoftProfile(accessToken: string): Promise<{ id: string; email: string }> {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = (await response.json()) as {
    id?: string;
    mail?: string;
    userPrincipalName?: string;
  };
  const email = data.mail || data.userPrincipalName;
  if (!response.ok || !data.id || !email) {
    throw new HttpError(400, "Could not read Microsoft account identity.");
  }
  return { id: data.id, email };
}

function assertProviderConfigured(env: Env, provider: Provider): void {
  if (provider === "google" && (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)) {
    throw new HttpError(503, "Google OAuth credentials have not been configured.");
  }
  if (
    provider === "microsoft" &&
    (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET)
  ) {
    throw new HttpError(503, "Microsoft OAuth credentials have not been configured.");
  }
}

function defaultLabel(provider: Provider): string {
  return provider === "google" ? "Google account" : "Microsoft account";
}

function oauthResultPage(success: boolean, message: string, provider: Provider): string {
  const escaped = message.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const providerName = provider === "google" ? "Google" : "Microsoft";
  const connectUrl = `/oauth/${provider}/start?label=${encodeURIComponent(`${providerName} account`)}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>SenderDeck by DEVECTUS</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="font-family:system-ui;max-width:42rem;margin:5rem auto;padding:1rem;background:#f7f7f2;color:#17221b">
  <p style="text-transform:uppercase;letter-spacing:.12em;color:#58725f">${success ? "Connected" : "Connection failed"}</p>
  <h1>${success ? "Account ready" : "Could not connect account"}</h1><p style="line-height:1.6">${escaped}</p>
  <div style="display:flex;flex-wrap:wrap;gap:.75rem;margin-top:2rem">
  <a href="/#connections" style="display:inline-flex;align-items:center;min-height:44px;padding:.7rem 1rem;border-radius:4px;background:#c9f16a;color:#17251a;text-decoration:none;font-weight:650">Manage connections</a>
  <a href="${connectUrl}" style="display:inline-flex;align-items:center;min-height:44px;padding:.7rem 1rem;border:1px solid #58725f;border-radius:4px;color:#17221b;text-decoration:none;font-weight:650">${success ? `Connect another ${providerName} account` : `Try ${providerName} again`}</a>
  </div></body></html>`;
}
