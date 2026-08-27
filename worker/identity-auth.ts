import {
  authenticatedUser,
  HttpError,
  SESSION_COOKIE,
} from "./auth";
import { saveAccount } from "./accounts";
import { randomBase64Url, sha256Base64Url } from "./crypto";
import type { Env, Provider } from "./env";
import {
  assertProviderConfigured,
  exchangeCode,
  googleAuthorizeUrl,
  googleProfile,
  microsoftAuthorizeUrl,
  microsoftProfile,
} from "./oauth";

const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

interface LoginStateRow {
  state_hash: string;
  provider: Provider;
  code_verifier: string;
  redirect_uri: string;
  return_to: string;
  linking_user_id: string | null;
  expires_at: number;
}

interface IdentityRow {
  user_id: string;
  email: string;
}

interface MatchingAccountRow {
  user_id: string;
  label: string;
}

export async function handleIdentityAuthRoute(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === "/auth/signout") {
    return signOut(request, env);
  }

  const startMatch = url.pathname.match(/^\/auth\/(google|microsoft)\/start$/);
  if (startMatch) {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return startSignIn(request, env, startMatch[1] as Provider);
  }

  const callbackMatch = url.pathname.match(/^\/oauth\/(google|microsoft)\/callback$/);
  if (callbackMatch) {
    return finishSignInIfMatched(request, env, callbackMatch[1] as Provider);
  }

  return null;
}

async function startSignIn(request: Request, env: Env, provider: Provider): Promise<Response> {
  assertProviderConfigured(env, provider);
  const url = new URL(request.url);
  const state = randomBase64Url();
  const stateHash = await sha256Base64Url(state);
  const codeVerifier = randomBase64Url(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const redirectUri = `${url.origin}/oauth/${provider}/callback`;
  const returnTo = safeReturnPath(url.searchParams.get("return_to") || "/settings");
  const linkingUserId = (await authenticatedUser(request, env))?.userId || null;
  const now = Date.now();

  await env.DB.batch([
    env.DB.prepare("DELETE FROM senderdeck_login_states WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM senderdeck_sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare(
      `INSERT INTO senderdeck_login_states
        (state_hash, provider, code_verifier, redirect_uri, return_to, linking_user_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      stateHash,
      provider,
      codeVerifier,
      redirectUri,
      returnTo,
      linkingUserId,
      now,
      now + LOGIN_STATE_TTL_MS,
    ),
  ]);

  const authorizeUrl = provider === "google"
    ? googleAuthorizeUrl(env, redirectUri, state, codeChallenge)
    : microsoftAuthorizeUrl(env, redirectUri, state, codeChallenge);
  return Response.redirect(authorizeUrl, 302);
}

async function finishSignInIfMatched(
  request: Request,
  env: Env,
  provider: Provider,
): Promise<Response | null> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (!state) return null;

  const stateHash = await sha256Base64Url(state);
  const stored = await env.DB.prepare(
    "SELECT * FROM senderdeck_login_states WHERE state_hash = ? AND provider = ?",
  )
    .bind(stateHash, provider)
    .first<LoginStateRow>();
  if (!stored) return null;

  await env.DB.prepare("DELETE FROM senderdeck_login_states WHERE state_hash = ?")
    .bind(stateHash)
    .run();

  try {
    if (stored.expires_at < Date.now()) {
      throw new HttpError(400, "Sign-in expired. Start again.");
    }
    const providerError = url.searchParams.get("error");
    if (providerError) {
      throw new HttpError(400, `Sign-in was not completed: ${providerError}.`);
    }
    const code = url.searchParams.get("code");
    if (!code) throw new HttpError(400, "Sign-in callback is missing its authorization code.");

    const token = await exchangeCode(env, provider, code, stored.redirect_uri, stored.code_verifier);
    const profile = provider === "google"
      ? await googleProfile(token.accessToken)
      : await microsoftProfile(token.accessToken);
    const email = profile.email.trim().toLowerCase();
    const identity = await env.DB.prepare(
      `SELECT user_id, email FROM senderdeck_identities
       WHERE provider = ? AND provider_account_id = ?`,
    )
      .bind(provider, profile.id)
      .first<IdentityRow>();
    const matchingAccounts = await env.DB.prepare(
      `SELECT user_id, label FROM email_accounts
       WHERE provider = ? AND provider_account_id = ?
       ORDER BY updated_at DESC LIMIT 2`,
    )
      .bind(provider, profile.id)
      .all<MatchingAccountRow>();

    const matchedLink = stored.linking_user_id
      ? matchingAccounts.results.find((account) => account.user_id === stored.linking_user_id)
      : undefined;
    const canonicalAccount = matchedLink || matchingAccounts.results[0];
    const userId = identity?.user_id
      || matchedLink?.user_id
      || (matchingAccounts.results.length === 1 ? canonicalAccount?.user_id : null)
      || stored.linking_user_id
      || `usr_${randomBase64Url(18)}`;
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO senderdeck_identities
        (provider, provider_account_id, user_id, email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, provider_account_id) DO UPDATE SET
         email = excluded.email,
         updated_at = excluded.updated_at`,
    )
      .bind(provider, profile.id, userId, email, now, now)
      .run();

    const resolvedIdentity = await env.DB.prepare(
      `SELECT user_id, email FROM senderdeck_identities
       WHERE provider = ? AND provider_account_id = ?`,
    )
      .bind(provider, profile.id)
      .first<IdentityRow>();
    if (!resolvedIdentity) throw new HttpError(500, "Could not establish the SenderDeck identity.");

    const label = matchingAccounts.results.find(
      (account) => account.user_id === resolvedIdentity.user_id,
    )?.label || `${provider === "google" ? "Google" : "Microsoft"} account`;
    await saveAccount(env, {
      userId: resolvedIdentity.user_id,
      provider,
      providerAccountId: profile.id,
      email,
      label,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: Date.now() + token.expiresIn * 1000,
      scopes: token.scopes,
    });

    const sessionToken = randomBase64Url(32);
    await env.DB.prepare(
      `INSERT INTO senderdeck_sessions (token_hash, user_id, email, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        await sha256Base64Url(sessionToken),
        resolvedIdentity.user_id,
        resolvedIdentity.email,
        now,
        now + SESSION_TTL_SECONDS * 1000,
      )
      .run();

    const destination = new URL(safeReturnPath(stored.return_to), url.origin).toString();
    return new Response(null, {
      status: 303,
      headers: {
        location: destination,
        "cache-control": "no-store",
        "set-cookie": sessionCookie(sessionToken),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign-in failed.";
    return new Response(signInResultPage(message, provider), {
      status: error instanceof HttpError ? error.status : 500,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
}

async function signOut(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (token) {
    await env.DB.prepare("DELETE FROM senderdeck_sessions WHERE token_hash = ?")
      .bind(await sha256Base64Url(token))
      .run();
  }
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL(safeReturnPath(url.searchParams.get("return_to") || "/"), url.origin).toString(),
      "cache-control": "no-store",
      "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}

export function safeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "https://senderdeck.local");
    if (parsed.origin !== "https://senderdeck.local") return "/";
    if (parsed.pathname.startsWith("/auth/") || parsed.pathname === "/signin") return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

function methodNotAllowed(allow: string): Response {
  return new Response(null, { status: 405, headers: { allow } });
}

function signInResultPage(message: string, provider: Provider): string {
  const escaped = escapeHtml(message);
  const providerName = provider === "google" ? "Google" : "Microsoft";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SenderDeck sign-in</title></head><body style="font-family:system-ui;max-width:42rem;margin:5rem auto;padding:1rem;background:#f7f7f2;color:#17221b"><p style="text-transform:uppercase;letter-spacing:.12em;color:#58725f">Sign-in failed</p><h1>Could not sign in with ${providerName}</h1><p style="line-height:1.6">${escaped}</p><a href="/signin" style="display:inline-flex;margin-top:1rem;padding:.75rem 1rem;background:#294c35;color:white;text-decoration:none;border-radius:8px">Try again</a></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
