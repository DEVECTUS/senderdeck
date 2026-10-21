import { authenticatedUser, cookieValue, HttpError, SESSION_COOKIE } from "../auth";
import { decrypt, encrypt, randomBase64Url, sha256Base64Url } from "../crypto";
import type { Env } from "../env";

export const META_SECRET_KEYS = ["META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN"] as const;
type SecretKey = typeof META_SECRET_KEYS[number];
type SecretRow = { key: SecretKey; encrypted: string; updated_at: number };

export async function storedMetaSecrets(env: Env) {
  return (await env.DB.prepare("SELECT key, encrypted, updated_at FROM social_platform_secrets WHERE key IN ('META_APP_SECRET','META_WEBHOOK_VERIFY_TOKEN')").all<SecretRow>()).results;
}
export async function resolveMetaSecrets(env: Env): Promise<Env> {
  if (META_SECRET_KEYS.every(key => !!env[key])) return env;
  const resolved = { ...env };
  for (const row of await storedMetaSecrets(env)) {
    if (resolved[row.key]) continue; // Hosting values always win. Never mutate the shared binding object.
    try {
      const saved = JSON.parse(await decrypt(row.encrypted, env.TOKEN_ENCRYPTION_KEY));
      if (saved.key !== row.key || typeof saved.value !== "string" || !saved.value) throw new Error();
      resolved[row.key] = saved.value;
    } catch { throw new HttpError(503, "Stored Meta configuration could not be loaded. A platform administrator must replace it."); }
  }
  return resolved;
}
export async function verifiedOperator(request: Request, env: Env) {
  const user = await authenticatedUser(request, env);
  if (!user) throw new HttpError(401, "Authentication required.");
  const allowed = (env.SOCIAL_OPERATOR_USER_IDS || "").split(",").map(id => id.trim()).includes(user.userId);
  if (!allowed || user.source === "development") throw new HttpError(403, "Verified platform administrator access is required.");
  const identity = await env.DB.prepare("SELECT user_id FROM senderdeck_identities WHERE user_id=? LIMIT 1").bind(user.userId).first();
  if (!identity) throw new HttpError(403, "Sign in with the verified platform administrator identity.");
  return user;
}
async function sessionBinding(request: Request) {
  return sha256Base64Url(cookieValue(request.headers.get("cookie"), SESSION_COOKIE) || "platform-authenticated-session");
}
export async function operatorCsrf(request: Request, env: Env, purpose = "meta-secret-write") {
  const user = await verifiedOperator(request, env);
  return encrypt(JSON.stringify({ purpose, user: user.userId, session: await sessionBinding(request), expires: Date.now() + 600000, nonce: randomBase64Url() }), env.TOKEN_ENCRYPTION_KEY);
}
export async function verifyOperatorWrite(request: Request, env: Env, purpose: string) {
  const user = await verifiedOperator(request, env);
  if (new URL(request.url).protocol !== "https:" || request.headers.get("origin") !== new URL(request.url).origin || !/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || "") || request.headers.get("sec-fetch-site") === "cross-site") throw new HttpError(403, "Same-origin HTTPS JSON request required.");
  try {
    const csrf = JSON.parse(await decrypt(request.headers.get("x-senderdeck-csrf") || "", env.TOKEN_ENCRYPTION_KEY));
    if (csrf.purpose !== purpose || csrf.user !== user.userId || csrf.session !== await sessionBinding(request) || csrf.expires <= Date.now() || csrf.expires > Date.now() + 600000) throw new Error();
  } catch { throw new HttpError(403, "Setup session expired. Refresh the page before saving."); }
  return user;
}
export async function saveMetaSecrets(request: Request, env: Env) {
  const user = await verifyOperatorWrite(request,env,"meta-secret-write");
  // Bound the stream, including chunked requests. Never reflect a body or provider secret in errors.
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (!reader) throw new HttpError(400, "Enter a supported Meta secret.");
  while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 4096) { await reader.cancel(); throw new HttpError(413, "Request is too large."); } chunks.push(next.value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body: Record<string, unknown>;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, "Invalid secret configuration request."); }
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length || Object.keys(body).some(key => !META_SECRET_KEYS.includes(key as SecretKey))) throw new HttpError(400, "Only the Meta app secret and webhook verification token can be changed here.");
  const keys = Object.keys(body) as SecretKey[];
  for (const key of keys) {
    if (typeof body[key] !== "string" || !/^[A-Za-z0-9_-]{16,512}$/.test(body[key])) throw new HttpError(400, "Use a secret of 16 to 512 letters, numbers, underscores or hyphens, without spaces.");
    if (env[key]) throw new HttpError(409, "A native hosting secret takes precedence. Change that value through hosting controls.");
  }
  const updatedAt = Date.now(); const statements = [];
  for (const key of keys) statements.push(env.DB.prepare("INSERT INTO social_platform_secrets (key, encrypted, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET encrypted=excluded.encrypted, updated_at=excluded.updated_at").bind(key, await encrypt(JSON.stringify({key, value:body[key]}), env.TOKEN_ENCRYPTION_KEY), updatedAt));
  statements.push(env.DB.prepare("INSERT INTO social_platform_audit (id, user_id, action, keys, created_at) VALUES (?, ?, 'meta_secrets_saved', ?, ?)").bind(crypto.randomUUID(), user.userId, JSON.stringify(keys.sort()), updatedAt));
  await env.DB.batch(statements);
  return { saved: true, updatedKeys: keys };
}
