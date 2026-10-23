import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { handlePasswordAuth, hashPassword, normaliseUsername, verifyPassword } from "../worker/password-auth";
import { authenticatedUser, SESSION_COOKIE } from "../worker/auth";
import { sha256Base64Url } from "../worker/crypto";
import type { Env, D1PreparedStatement, WorkerD1Database } from "../worker/env";

function database() {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url)).filter(f => f.endsWith(".sql")).sort()) sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
  const wrap = (query: string, values: unknown[] = []): D1PreparedStatement => ({
    bind: (...args: unknown[]) => wrap(query, args),
    async first<T>() { return (sql.prepare(query).get(...values as never[]) as T) || null; },
    async all<T>() { return { success: true, results: sql.prepare(query).all(...values as never[]) as T[] }; },
    async run<T>() { const result = sql.prepare(query).run(...values as never[]); return { success: true, results: [] as T[], meta: { changes: result.changes } }; },
  });
  const DB: WorkerD1Database = { prepare: wrap, async batch<T>(statements: D1PreparedStatement[]) {
    sql.exec("BEGIN"); try { const results = []; for (const s of statements) results.push(await s.all<T>()); sql.exec("COMMIT"); return results; } catch (error) { sql.exec("ROLLBACK"); throw error; }
  } };
  const env = { DB, TOKEN_ENCRYPTION_KEY: "unused" } as Env;
  return { sql, env };
}
const origin = "https://senderdeck.example";
const password = "sample account strong password";
async function session(f: ReturnType<typeof database>, user: string, age = 0) {
  const token = `opaque-token-${user}`;
  f.sql.prepare("INSERT INTO senderdeck_sessions VALUES (?,?,?,?,?)").run(await sha256Base64Url(token), user, `${user}@example.com`, Date.now() - age, Date.now() + 86400000);
  return `${SESSION_COOKIE}=${token}`;
}
function manage(cookie: string, body: Record<string, unknown>, requestOrigin = origin) {
  return new Request(`${origin}/api/password-login`, { method: "POST", headers: { origin: requestOrigin, cookie, "content-type": "application/json", "cf-connecting-ip": "192.0.2.1" }, body: JSON.stringify(body) });
}
function login(username: string, enteredPassword = password, returnTo = "/settings") {
  return new Request(`${origin}/auth/password`, { method: "POST", headers: { origin, "cf-connecting-ip": "192.0.2.1" }, body: new URLSearchParams({ username, password: enteredPassword, return_to: returnTo }) });
}
test("password hashes are salted, bounded and verified with exact password bytes", async () => {
  const a = await hashPassword(password); const b = await hashPassword(password);
  assert.notEqual(a, b); assert.ok(!a.includes(password));
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword(`${password} `, a), false);
  assert.equal(await verifyPassword(password, "malformed"), false);
  await assert.rejects(hashPassword("short"), /15 characters/);
  await assert.rejects(hashPassword("a".repeat(1025)), /1024/);
  assert.equal(normaliseUsername(" Review.User "), "review.user");
  assert.throws(() => normaliseUsername("<script>"));
});
test("an existing user adds credentials and password login opens the SAME identity with a safe OAuth return path", async () => {
  const f = database(); const cookie = await session(f, "sample");
  const saved = await handlePasswordAuth(manage(cookie, { username: "senderdeck-reviewer", password, userId: "someone-else" }), f.env);
  assert.equal(saved?.status, 200);
  assert.equal(f.sql.prepare("SELECT user_id FROM senderdeck_password_logins").get()?.user_id, "sample");
  const status = await handlePasswordAuth(new Request(`${origin}/api/password-login`, { headers: { cookie } }), f.env);
  assert.deepEqual(await status?.json(), { username: "senderdeck-reviewer", hasPassword: true });
  const result = await handlePasswordAuth(login("SENDERDECK-REVIEWER", password, "/oauth/authorize?client_id=abc"), f.env);
  assert.equal(result?.status, 303);
  assert.equal(result?.headers.get("location"), `${origin}/oauth/authorize?client_id=abc`);
  const setCookie = result?.headers.get("set-cookie") || "";
  assert.match(setCookie, /HttpOnly; Secure; SameSite=Lax/);
  const signedIn = await authenticatedUser(new Request(`${origin}/settings`, { headers: { cookie: setCookie.split(";")[0] } }), f.env);
  assert.equal(signedIn?.userId, "sample"); assert.equal(signedIn?.email, "sample@example.com");
  const external = await handlePasswordAuth(login("senderdeck-reviewer", password, "https://evil.example"), f.env);
  assert.equal(external?.headers.get("location"), `${origin}/`);
  f.sql.close();
});
test("credential setup rejects anonymous/platform-only, cross-origin, oversized and stale-session requests", async () => {
  const f = database(); const body = { username: "reviewer", password };
  assert.equal((await handlePasswordAuth(manage("", body), f.env))?.status, 401);
  assert.equal((await handlePasswordAuth(new Request(`${origin}/api/password-login`, { headers: { "oai-authenticated-user-id": "platform-user", "oai-authenticated-user-email": "platform@example.com" } }), f.env))?.status, 401);
  const cookie = await session(f, "sample", 16 * 60000);
  assert.equal((await handlePasswordAuth(manage(cookie, body, "https://evil.example"), f.env))?.status, 403);
  assert.equal((await handlePasswordAuth(manage(cookie, body), f.env))?.status, 403);
  assert.equal((await handlePasswordAuth(manage(cookie, { ...body, junk: "a".repeat(10000) }), f.env))?.status, 413);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM senderdeck_password_logins").get()?.n, 0);
  f.sql.close();
});
test("username collisions cannot link accounts; changes require the current password and revoke other browser sessions", async () => {
  const f = database(); const alice = await session(f, "alice"); const bob = await session(f, "bob");
  assert.equal((await handlePasswordAuth(manage(alice, { username: "reviewer", password }), f.env))?.status, 200);
  assert.equal((await handlePasswordAuth(manage(bob, { username: "reviewer", password }), f.env))?.status, 409);
  const other = await handlePasswordAuth(login("reviewer"), f.env); const otherCookie = other?.headers.get("set-cookie")?.split(";")[0] || "";
  const next = { username: "reviewer-new", password: "new long unique passphrase", currentPassword: "wrong" };
  assert.equal((await handlePasswordAuth(manage(alice, next), f.env))?.status, 403);
  assert.equal((await handlePasswordAuth(manage(alice, { ...next, currentPassword: password }), f.env))?.status, 200);
  assert.equal(await authenticatedUser(new Request(origin, { headers: { cookie: otherCookie } }), f.env), null);
  assert.equal((await authenticatedUser(new Request(origin, { headers: { cookie: alice } }), f.env))?.userId, "alice");
  assert.equal((await handlePasswordAuth(login("reviewer-new", password), f.env))?.headers.get("location")?.includes("error=invalid"), true);
  assert.equal((await handlePasswordAuth(login("reviewer-new", next.password), f.env))?.headers.get("location"), `${origin}/settings`);
  f.sql.close();
});
test("bad and unknown logins return generic errors, rate limits persist, and retired users cannot sign in", async () => {
  const f = database(); const cookie = await session(f, "sample");
  await handlePasswordAuth(manage(cookie, { username: "reviewer", password }), f.env);
  const wrong = await handlePasswordAuth(login("reviewer", "wrong"), f.env);
  const absent = await handlePasswordAuth(login("unknown", "wrong"), f.env);
  assert.equal(wrong?.headers.get("location"), absent?.headers.get("location"));
  for (let i = 0; i < 9; i++) await handlePasswordAuth(login("unknown", "wrong"), f.env);
  const blocked = await handlePasswordAuth(login("unknown", "wrong"), f.env);
  assert.equal(blocked?.status, 429); assert.equal(blocked?.headers.get("retry-after"), "900");
  f.sql.prepare("INSERT INTO social_runtime (key,value) VALUES (?,?)").run(`retired_user:${await sha256Base64Url("sample")}`, Date.now());
  const retired = await handlePasswordAuth(login("reviewer"), f.env);
  assert.equal(retired?.headers.get("location")?.includes("error=invalid"), true);
  assert.equal((await handlePasswordAuth(manage(cookie, { username: "reviewer", password }), f.env))?.status, 401);
  f.sql.close();
});

test("hosting provisioning is disabled by default, requires the exact bearer and never accepts account selectors", async () => {
  const f = database();
  const bearer = "b".repeat(43);
  const request = (body = {}, token = bearer, requestOrigin?: string) => new Request(`${origin}/api/password-login/provision`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(requestOrigin ? { origin: requestOrigin } : {}) }, body: JSON.stringify(body) });
  assert.equal((await handlePasswordAuth(request(), f.env))?.status, 404);
  const plan = { userId: "sample", email: "sample@example.com", username: "review-user", passwordHash: await hashPassword(password), tokenHash: await sha256Base64Url(bearer), expiresAt: Date.now() + 1800000 };
  f.env.PASSWORD_PROVISION_PLAN = JSON.stringify(plan);
  assert.equal((await handlePasswordAuth(request({}, "x".repeat(43)), f.env))?.status, 401);
  assert.equal((await handlePasswordAuth(request({}, bearer, origin), f.env))?.status, 401);
  assert.equal((await handlePasswordAuth(request({ userId: "owner" }), f.env))?.status, 400);
  assert.equal((await handlePasswordAuth(request(), f.env))?.status, 409);
  f.sql.prepare("INSERT INTO senderdeck_identities VALUES (?,?,?,?,?,?)").run("google", "provider-sample", "sample", "sample@example.com", Date.now(), Date.now());
  assert.equal((await handlePasswordAuth(request(), f.env))?.status, 200);
  assert.equal((await handlePasswordAuth(request(), f.env))?.status, 200);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM senderdeck_password_logins").get()?.n, 1);
  const signedIn = await handlePasswordAuth(login("review-user"), f.env);
  assert.equal(signedIn?.headers.get("location"), `${origin}/settings`);
  f.env.PASSWORD_PROVISION_PLAN = JSON.stringify({ ...plan, passwordHash: await hashPassword("different long password value") });
  assert.equal((await handlePasswordAuth(request(), f.env))?.status, 409);
  assert.equal(f.sql.prepare("SELECT password_hash FROM senderdeck_password_logins").get()?.password_hash, plan.passwordHash);
  f.env.PASSWORD_PROVISION_PLAN = JSON.stringify({ ...plan, expiresAt: Date.now() - 1 });
  assert.equal((await handlePasswordAuth(request(), f.env))?.status, 404);
  delete f.env.PASSWORD_PROVISION_PLAN;
  assert.equal((await handlePasswordAuth(request(), f.env))?.status, 404);
  f.sql.close();
});
