import { scrypt, timingSafeEqual } from "node:crypto";
import { authenticatedUser, cookieValue, errorResponse, HttpError, SESSION_COOKIE } from "./auth";
import { randomBase64Url, sha256Base64Url } from "./crypto";
import { createSessionResponse, safeReturnPath } from "./identity-auth";
import { isUserRetired } from "./retired-users";
import { limitedBody } from "./social/webhooks";
import type { Env } from "./env";

// OWASP's memory-bounded scrypt profile: N=2^14, r=8, p=5 (~16 MiB).
const SCRYPT = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
const WINDOW = 15 * 60 * 1000;
interface Login { user_id: string; username: string; email: string; password_hash: string }
export function normaliseUsername(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Enter a username.");
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) throw new HttpError(400, "Use 3–64 letters, numbers, dots, underscores or hyphens for the username.");
  return username;
}
function passwordText(value: unknown): string {
  if (typeof value !== "string" || value.length < 15 || new TextEncoder().encode(value).length > 1024) throw new HttpError(400, "Use a password of at least 15 characters and at most 1024 bytes.");
  return value;
}
async function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 32, SCRYPT, (error, result) => error ? reject(error) : resolve(result)));
}
export async function hashPassword(password: string): Promise<string> {
  passwordText(password);
  const salt = randomBase64Url(24);
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString("base64url")}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (new TextEncoder().encode(password).length > 1024) return false;
  const parts = encoded.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt-v1" || !/^[A-Za-z0-9_-]{32}$/.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return false;
  const actual = await derive(password, parts[1]);
  return timingSafeEqual(actual, Buffer.from(parts[2], "base64url"));
}
async function limit(env: Env, request: Request, username: string) {
  const now = Date.now();
  // Store hashed dimensions, never usernames or raw IPs in the rate-limit table.
  const dimensions = ["user:" + username, "ip:" + (request.headers.get("cf-connecting-ip") || "unknown")];
  await env.DB.prepare("DELETE FROM senderdeck_login_attempts WHERE expires_at < ?").bind(now).run();
  for (const dimension of dimensions) {
    const key = await sha256Base64Url(dimension);
    const row = await env.DB.prepare(`INSERT INTO senderdeck_login_attempts (key,attempts,expires_at) VALUES (?,1,?)
      ON CONFLICT(key) DO UPDATE SET attempts=senderdeck_login_attempts.attempts+1
      RETURNING attempts`).bind(key, now + WINDOW).first<{ attempts: number }>();
    if (!row || row.attempts > (dimension.startsWith("user:") ? 10 : 50)) throw new HttpError(429, "Too many sign-in attempts. Try again in 15 minutes.");
  }
}
function redirectInvalid(origin: string, returnTo: string) {
  const destination = new URL("/signin", origin);
  destination.searchParams.set("error", "invalid");
  destination.searchParams.set("return_to", returnTo);
  return new Response(null, { status: 303, headers: { location: destination.toString(), "cache-control": "no-store" } });
}

export async function handlePasswordAuth(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!["/auth/password", "/api/password-login"].includes(url.pathname)) return null;
  try {
    if (request.method !== "POST" && !(url.pathname === "/api/password-login" && request.method === "GET")) return new Response(null, { status: 405, headers: { allow: url.pathname === "/auth/password" ? "POST" : "GET, POST" } });
    if (request.method === "POST" && (url.protocol !== "https:" || request.headers.get("origin") !== url.origin)) throw new HttpError(403, "Invalid request origin.");
    if (url.pathname === "/auth/password") {
      if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get("content-type") || "")) throw new HttpError(415, "A sign-in form is required.");
      const form = new URLSearchParams(await limitedBody(request, 4096));
      const returnTo = safeReturnPath(form.get("return_to") || "/settings");
      const rawUsername = form.get("username") || "";
      const password = form.get("password") || "";
      // Invalid usernames also consume rate limits and receive the same error.
      await limit(env, request, rawUsername.trim().toLowerCase());
      let username: string;
      try { username = normaliseUsername(rawUsername); } catch { return redirectInvalid(url.origin, returnTo); }
      const login = await env.DB.prepare("SELECT * FROM senderdeck_password_logins WHERE username=?").bind(username).first<Login>();
      // A fixed dummy hash keeps an unknown account on the same KDF path.
      const dummy = `scrypt-v1$${"a".repeat(32)}$${"A".repeat(43)}`;
      const valid = await verifyPassword(password, login?.password_hash || dummy);
      if (!login || !valid || await isUserRetired(env, login.user_id)) return redirectInvalid(url.origin, returnTo);
      // Re-check against rotation/removal during the expensive password calculation.
      const current = await env.DB.prepare("SELECT user_id FROM senderdeck_password_logins WHERE user_id=? AND password_hash=?").bind(login.user_id, login.password_hash).first();
      if (!current) return redirectInvalid(url.origin, returnTo);
      return createSessionResponse(env, login.user_id, login.email, new URL(returnTo, url.origin).toString(), 86400);
    }

    const user = await authenticatedUser(request, env);
    if (!user || user.source !== "senderdeck") throw new HttpError(401, "Sign in to your SenderDeck account with Google, Microsoft or your existing password first.");
    const existing = await env.DB.prepare("SELECT * FROM senderdeck_password_logins WHERE user_id=?").bind(user.userId).first<Login>();
    if (request.method === "GET") return Response.json({ username: existing?.username || "", hasPassword: !!existing }, { headers: { "cache-control": "no-store" } });
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || "")) throw new HttpError(415, "JSON required.");
    const data = JSON.parse(await limitedBody(request, 8192)) as Record<string, unknown>;
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new HttpError(400, "Invalid request.");
    const username = normaliseUsername(data.username);
    const password = passwordText(data.password);
    await limit(env, request, "manage:" + user.userId);
    if (existing) {
      if (typeof data.currentPassword !== "string" || !await verifyPassword(data.currentPassword, existing.password_hash)) throw new HttpError(403, "Enter your current SenderDeck password to change this login.");
    } else {
      const token = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
      const recent = token && await env.DB.prepare("SELECT created_at FROM senderdeck_sessions WHERE token_hash=? AND user_id=? AND created_at>? AND expires_at>?").bind(await sha256Base64Url(token), user.userId, Date.now() - WINDOW, Date.now()).first();
      if (!recent) throw new HttpError(403, "Sign in again with Google or Microsoft, then return here within 15 minutes to add your password.");
    }
    const hash = await hashPassword(password);
    const at = Date.now();
    const write = existing
      ? env.DB.prepare("UPDATE senderdeck_password_logins SET username=?,password_hash=?,updated_at=? WHERE user_id=? AND password_hash=? RETURNING user_id").bind(username, hash, at, user.userId, existing.password_hash)
      : env.DB.prepare("INSERT INTO senderdeck_password_logins (user_id,username,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING user_id").bind(user.userId, username, user.email, hash, at, at);
    const result = await env.DB.batch([
      write,
      // Other browser sessions must sign in again following a credential change.
      env.DB.prepare("DELETE FROM senderdeck_sessions WHERE user_id=? AND token_hash<>? AND EXISTS(SELECT 1 FROM senderdeck_password_logins WHERE user_id=? AND password_hash=?)").bind(user.userId, await sha256Base64Url(cookieValue(request.headers.get("cookie"), SESSION_COOKIE) || ""), user.userId, hash),
    ]).catch(() => { throw new HttpError(409, "This username is unavailable or the login changed. Reload and try again."); });
    if (!result[0].results.length) throw new HttpError(409, "This username is unavailable or the login changed. Reload and try again.");
    return Response.json({ saved: true, username }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const response = errorResponse(error instanceof HttpError ? error : new HttpError(500, "Sign-in could not be completed. Please try again."));
    response.headers.set("cache-control", "no-store");
    if (response.status === 429) response.headers.set("retry-after", "900");
    return response;
  }
}
