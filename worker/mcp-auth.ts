import { HttpError } from "./auth";
import type { Env } from "./env";

const AUTH_REQUEST_TTL_SECONDS = 10 * 60;
const AUTH_CODE_TTL_SECONDS = 5 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const SCOPE = "senderdeck";

interface ClientRow {
  client_id: string;
  redirect_uris: string;
}

interface AuthorizationRequestRow {
  request_hash: string;
  user_id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  state: string | null;
  resource: string;
  expires_at: number;
}

interface AuthorizationCodeRow {
  code_hash: string;
  user_id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  resource: string;
  expires_at: number;
}

interface TokenRow {
  token_hash: string;
  token_type: "access" | "refresh";
  user_id: string;
  client_id: string;
  scope: string;
  resource: string;
  expires_at: number;
}

export class McpAuthenticationError extends HttpError {
  constructor(public readonly challenge: string) {
    super(401, "Connect SenderDeck to continue.");
  }
}

export async function handleMcpAuthentication(
  request: Request,
  env: Env,
): Promise<Response | null> {
  try {
    return await routeMcpAuthentication(request, env);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const description = error instanceof Error ? error.message : "Unexpected authorization error.";
    return oauthError("invalid_request", description, status);
  }
}

async function routeMcpAuthentication(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const origin = url.origin;

  if (url.pathname === "/.well-known/oauth-protected-resource") {
    return json({
      resource: resourceUrl(origin),
      authorization_servers: [origin],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ["header"],
    });
  }

  if (
    url.pathname === "/.well-known/oauth-authorization-server" ||
    url.pathname === "/.well-known/openid-configuration"
  ) {
    return json({
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      revocation_endpoint: `${origin}/oauth/revoke`,
      registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [SCOPE],
    });
  }

  if (url.pathname === "/oauth/register") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    return registerClient(request, env);
  }

  if (url.pathname === "/oauth/authorize") {
    if (request.method === "GET") return beginAuthorization(request, env);
    if (request.method === "POST") return completeAuthorization(request, env);
    return methodNotAllowed("GET, POST");
  }

  if (url.pathname === "/oauth/token") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    return exchangeToken(request, env);
  }

  if (url.pathname === "/oauth/revoke") {
    if (request.method !== "POST") return methodNotAllowed("POST");
    return revokeToken(request, env);
  }

  return null;
}

export async function requireMcpUserId(request: Request, env: Env): Promise<string> {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  const origin = new URL(request.url).origin;
  const challenge = oauthChallenge(origin);
  if (!match) throw new McpAuthenticationError(challenge);

  const now = epochSeconds();
  const tokenHash = await sha256(match[1]);
  const token = await env.DB.prepare(
    `SELECT * FROM mcp_oauth_tokens
     WHERE token_hash = ? AND token_type = 'access' AND expires_at > ?`,
  )
    .bind(tokenHash, now)
    .first<TokenRow>();
  if (!token || token.resource !== resourceUrl(origin) || !token.scope.split(" ").includes(SCOPE)) {
    throw new McpAuthenticationError(challenge);
  }
  return token.user_id;
}

export function oauthChallenge(origin: string): string {
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", error="invalid_token", error_description="Connect SenderDeck to continue"`;
}

async function registerClient(request: Request, env: Env): Promise<Response> {
  if (Number(request.headers.get("content-length") || 0) > 32_768) {
    return oauthError("invalid_client_metadata", "Client metadata is too large.", 413);
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return oauthError("invalid_client_metadata", "Request body must be valid JSON.", 400);
  }
  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((value): value is string => typeof value === "string")
    : [];
  if (redirectUris.length === 0 || !redirectUris.every(validRedirectUri)) {
    return oauthError("invalid_redirect_uri", "Use an approved HTTPS or loopback redirect URI.", 400);
  }
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") {
    return oauthError("invalid_client_metadata", "Only public PKCE clients are supported.", 400);
  }

  const clientId = `sd_${randomToken(24)}`;
  const now = epochSeconds();
  const clientName = typeof body.client_name === "string" ? body.client_name.slice(0, 120) : null;
  await env.DB.prepare(
    `INSERT INTO mcp_oauth_clients (client_id, redirect_uris, client_name, created_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(clientId, JSON.stringify(redirectUris), clientName, now)
    .run();

  return json(
    {
      client_id: clientId,
      client_id_issued_at: now,
      redirect_uris: redirectUris,
      client_name: clientName,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201,
  );
}

async function beginAuthorization(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const userId = sitesUserId(request);
  if (!userId) {
    const returnTo = `${url.pathname}${url.search}`;
    return Response.redirect(`${url.origin}/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`, 302);
  }

  const clientId = requiredParam(url.searchParams, "client_id");
  const redirectUri = requiredParam(url.searchParams, "redirect_uri");
  const responseType = requiredParam(url.searchParams, "response_type");
  const codeChallenge = requiredParam(url.searchParams, "code_challenge");
  const codeChallengeMethod = requiredParam(url.searchParams, "code_challenge_method");
  const scope = normalizeScope(url.searchParams.get("scope"));
  const resource = url.searchParams.get("resource") || resourceUrl(url.origin);
  const state = url.searchParams.get("state");

  const client = await getClient(env, clientId);
  if (!client || !JSON.parse(client.redirect_uris).includes(redirectUri)) {
    return oauthError("invalid_request", "Unknown client or redirect URI.", 400);
  }
  if (responseType !== "code") return authorizationError(redirectUri, state, "unsupported_response_type");
  if (codeChallengeMethod !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    return authorizationError(redirectUri, state, "invalid_request", "PKCE with S256 is required.");
  }
  if (resource !== resourceUrl(url.origin)) {
    return authorizationError(redirectUri, state, "invalid_target", "The requested resource is not SenderDeck.");
  }
  const requestToken = randomToken(32);
  const now = epochSeconds();
  await cleanupExpired(env, now);
  await env.DB.prepare(
    `INSERT INTO mcp_authorization_requests
      (request_hash, user_id, client_id, redirect_uri, code_challenge, scope, state, resource, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      await sha256(requestToken),
      userId,
      clientId,
      redirectUri,
      codeChallenge,
      scope,
      state,
      resource,
      now + AUTH_REQUEST_TTL_SECONDS,
    )
    .run();

  const displayIdentity = request.headers.get("oai-authenticated-user-email")?.trim()
    || "your ChatGPT account";
  return html(consentPage(requestToken, displayIdentity));
}

async function completeAuthorization(request: Request, env: Env): Promise<Response> {
  const userId = sitesUserId(request);
  if (!userId) return new Response("Authentication required.", { status: 401 });
  const form = await request.formData();
  const requestToken = String(form.get("request_token") || "");
  const decision = String(form.get("decision") || "deny");
  if (!requestToken) return new Response("Authorization request is missing.", { status: 400 });

  const now = epochSeconds();
  const requestHash = await sha256(requestToken);
  const pending = await env.DB.prepare(
    `SELECT * FROM mcp_authorization_requests
     WHERE request_hash = ? AND user_id = ? AND expires_at > ?`,
  )
    .bind(requestHash, userId, now)
    .first<AuthorizationRequestRow>();
  if (!pending) return new Response("Authorization request expired. Return to Codex and try again.", { status: 400 });
  await env.DB.prepare("DELETE FROM mcp_authorization_requests WHERE request_hash = ?")
    .bind(requestHash)
    .run();

  if (decision !== "approve") {
    return authorizationError(pending.redirect_uri, pending.state, "access_denied");
  }

  const code = randomToken(32);
  await env.DB.prepare(
    `INSERT INTO mcp_authorization_codes
      (code_hash, user_id, client_id, redirect_uri, code_challenge, scope, resource, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      await sha256(code),
      pending.user_id,
      pending.client_id,
      pending.redirect_uri,
      pending.code_challenge,
      pending.scope,
      pending.resource,
      now + AUTH_CODE_TTL_SECONDS,
    )
    .run();

  const redirect = new URL(pending.redirect_uri);
  redirect.searchParams.set("code", code);
  if (pending.state) redirect.searchParams.set("state", pending.state);
  return Response.redirect(redirect.toString(), 302);
}

async function exchangeToken(request: Request, env: Env): Promise<Response> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return oauthError("invalid_request", "Use application/x-www-form-urlencoded.", 400);
  }
  const form = new URLSearchParams(await request.text());
  const grantType = form.get("grant_type");
  if (grantType === "authorization_code") return exchangeAuthorizationCode(form, env);
  if (grantType === "refresh_token") return exchangeRefreshToken(form, env);
  return oauthError("unsupported_grant_type", "Supported grants are authorization_code and refresh_token.", 400);
}

async function exchangeAuthorizationCode(form: URLSearchParams, env: Env): Promise<Response> {
  const code = requiredForm(form, "code");
  const clientId = requiredForm(form, "client_id");
  const redirectUri = requiredForm(form, "redirect_uri");
  const verifier = requiredForm(form, "code_verifier");
  const now = epochSeconds();
  const codeHash = await sha256(code);
  const row = await env.DB.prepare(
    `SELECT * FROM mcp_authorization_codes WHERE code_hash = ? AND expires_at > ?`,
  )
    .bind(codeHash, now)
    .first<AuthorizationCodeRow>();
  if (!row) return oauthError("invalid_grant", "Authorization code is invalid or expired.", 400);
  await env.DB.prepare("DELETE FROM mcp_authorization_codes WHERE code_hash = ?").bind(codeHash).run();
  if (row.client_id !== clientId || row.redirect_uri !== redirectUri) {
    return oauthError("invalid_grant", "Authorization code does not match this client.", 400);
  }
  if ((await pkceChallenge(verifier)) !== row.code_challenge) {
    return oauthError("invalid_grant", "PKCE verification failed.", 400);
  }
  return issueTokens(env, row.user_id, row.client_id, row.scope, row.resource, now);
}

async function exchangeRefreshToken(form: URLSearchParams, env: Env): Promise<Response> {
  const refreshToken = requiredForm(form, "refresh_token");
  const clientId = requiredForm(form, "client_id");
  const now = epochSeconds();
  const tokenHash = await sha256(refreshToken);
  const row = await env.DB.prepare(
    `SELECT * FROM mcp_oauth_tokens
     WHERE token_hash = ? AND token_type = 'refresh' AND expires_at > ?`,
  )
    .bind(tokenHash, now)
    .first<TokenRow>();
  if (!row || row.client_id !== clientId) return oauthError("invalid_grant", "Refresh token is invalid or expired.", 400);
  await env.DB.prepare("DELETE FROM mcp_oauth_tokens WHERE token_hash = ?").bind(tokenHash).run();
  return issueTokens(env, row.user_id, row.client_id, row.scope, row.resource, now);
}

async function revokeToken(request: Request, env: Env): Promise<Response> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return oauthError("invalid_request", "Use application/x-www-form-urlencoded.", 400);
  }
  const form = new URLSearchParams(await request.text());
  const tokenValue = form.get("token");
  const clientId = form.get("client_id");
  if (!tokenValue || !clientId) return oauthError("invalid_request", "Missing token or client_id.", 400);
  const tokenHash = await sha256(tokenValue);
  const token = await env.DB.prepare("SELECT * FROM mcp_oauth_tokens WHERE token_hash = ?")
    .bind(tokenHash)
    .first<TokenRow>();
  if (token && token.client_id === clientId) {
    await env.DB.prepare("DELETE FROM mcp_oauth_tokens WHERE user_id = ? AND client_id = ?")
      .bind(token.user_id, clientId)
      .run();
  }
  return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
}

async function issueTokens(
  env: Env,
  userId: string,
  clientId: string,
  scope: string,
  resource: string,
  now: number,
): Promise<Response> {
  const accessToken = randomToken(32);
  const refreshToken = randomToken(40);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO mcp_oauth_tokens
        (token_hash, token_type, user_id, client_id, scope, resource, expires_at, created_at)
       VALUES (?, 'access', ?, ?, ?, ?, ?, ?)`,
    ).bind(await sha256(accessToken), userId, clientId, scope, resource, now + ACCESS_TOKEN_TTL_SECONDS, now),
    env.DB.prepare(
      `INSERT INTO mcp_oauth_tokens
        (token_hash, token_type, user_id, client_id, scope, resource, expires_at, created_at)
       VALUES (?, 'refresh', ?, ?, ?, ?, ?, ?)`,
    ).bind(await sha256(refreshToken), userId, clientId, scope, resource, now + REFRESH_TOKEN_TTL_SECONDS, now),
  ]);
  return json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope,
  });
}

async function cleanupExpired(env: Env, now: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM mcp_authorization_requests WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM mcp_authorization_codes WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM mcp_oauth_tokens WHERE expires_at <= ?").bind(now),
  ]);
}

async function getClient(env: Env, clientId: string): Promise<ClientRow | null> {
  return env.DB.prepare("SELECT * FROM mcp_oauth_clients WHERE client_id = ?")
    .bind(clientId)
    .first<ClientRow>();
}

function sitesUserId(request: Request): string | null {
  return request.headers.get("oai-authenticated-user-id")?.trim()
    || request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase()
    || null;
}

function validRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.hash) return false;
    if (url.protocol === "https:") {
      return url.hostname === "chatgpt.com" || url.hostname.endsWith(".chatgpt.com") || url.hostname.endsWith(".openai.com");
    }
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

function normalizeScope(value: string | null): string {
  const scopes = (value || SCOPE).split(/\s+/).filter(Boolean);
  if (scopes.some((scope) => scope !== SCOPE)) throw new HttpError(400, "Unsupported OAuth scope.");
  return SCOPE;
}

function resourceUrl(origin: string): string {
  return `${origin}/api/mcp`;
}

function requiredParam(params: URLSearchParams, name: string): string {
  const value = params.get(name);
  if (!value) throw new HttpError(400, `Missing ${name}.`);
  return value;
}

function requiredForm(form: URLSearchParams, name: string): string {
  const value = form.get(name);
  if (!value) throw new HttpError(400, `Missing ${name}.`);
  return value;
}

function authorizationError(
  redirectUri: string,
  state: string | null,
  error: string,
  description?: string,
): Response {
  if (!validRedirectUri(redirectUri)) return oauthError(error, description || error, 400);
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("error", error);
  if (description) redirect.searchParams.set("error_description", description);
  if (state) redirect.searchParams.set("state", state);
  return Response.redirect(redirect.toString(), 302);
}

function consentPage(requestToken: string, email: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect SenderDeck</title><style>body{margin:0;background:#f3f4ef;color:#17241c;font:16px/1.5 system-ui,sans-serif}.card{max-width:600px;margin:10vh auto;padding:40px;background:#fff;border:1px solid #d5dcd5;border-radius:20px;box-shadow:0 20px 60px #17342018}h1{margin-top:0}li{margin:.7rem 0}.actions{display:flex;gap:12px;margin-top:28px}button{padding:12px 18px;border-radius:10px;border:1px solid #294c35;font:inherit;font-weight:700;cursor:pointer}.approve{background:#294c35;color:#fff}.deny{background:#fff;color:#294c35}.fine{color:#526259;font-size:14px}</style></head><body><main class="card"><h1>Connect SenderDeck</h1><p>Signed in as <strong>${escapeHtml(email)}</strong>.</p><p>Codex is requesting permission to:</p><ul><li>Connect the Google and Microsoft email accounts you choose.</li><li>Search and read messages only when you ask.</li><li>Create drafts and send only after exact confirmation.</li></ul><p class="fine">SenderDeck stores encrypted provider tokens and account labels. It does not index or retain mailbox content.</p><form method="post" action="/oauth/authorize"><input type="hidden" name="request_token" value="${escapeHtml(requestToken)}"><div class="actions"><button class="approve" name="decision" value="approve" type="submit">Allow</button><button class="deny" name="decision" value="deny" type="submit">Cancel</button></div></form></main></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

function epochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function randomToken(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

async function pkceChallenge(verifier: string): Promise<string> {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return "";
  return sha256(verifier);
}

function base64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "content-type": "application/json" },
  });
}

function oauthError(error: string, description: string, status: number): Response {
  return json({ error, error_description: description }, status);
}

function html(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function methodNotAllowed(allow: string): Response {
  return new Response(null, { status: 405, headers: { Allow: allow } });
}
