import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { handleIdentityAuthRoute } from "../worker/identity-auth";
import { handleOAuthRoute } from "../worker/oauth";
import { handleAccountApi } from "../worker/account-api";
import { disconnectAccount, enableAccountSignIn } from "../worker/accounts";
import { authenticatedUser, SESSION_COOKIE } from "../worker/auth";
import { encrypt, sha256Base64Url } from "../worker/crypto";
import { handleMcpAuthentication } from "../worker/mcp-auth";
import type { D1PreparedStatement, Env, Provider, WorkerD1Database } from "../worker/env";

const origin = "https://senderdeck.example";
function fixture() {
  const sql = new DatabaseSync(":memory:");
  for (const f of readdirSync(new URL("../drizzle/", import.meta.url)).filter(f => f.endsWith(".sql")).sort()) sql.exec(readFileSync(new URL(`../drizzle/${f}`, import.meta.url), "utf8"));
  const wrap = (q: string, v: unknown[] = []): D1PreparedStatement => ({
    bind: (...args) => wrap(q, args),
    async first<T>() { return (sql.prepare(q).get(...v as never[]) as T) || null; },
    async all<T>() { return { success: true, results: sql.prepare(q).all(...v as never[]) as T[] }; },
    async run<T>() { const r = sql.prepare(q).run(...v as never[]); return { success: true, results: [] as T[], meta: { changes: r.changes } }; },
  });
  const DB: WorkerD1Database = { prepare: wrap, async batch<T>(statements: D1PreparedStatement[]) {
    sql.exec("BEGIN"); try { const results = []; for (const s of statements) results.push(await s.all<T>()); sql.exec("COMMIT"); return results; } catch (e) { sql.exec("ROLLBACK"); throw e; }
  } };
  const env = { DB, TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"), GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test", MICROSOFT_CLIENT_ID: "test", MICROSOFT_CLIENT_SECRET: "test" } as Env;
  return { sql, env };
}
async function session(f: ReturnType<typeof fixture>, user = "owner") {
  const token = `session-${user}`;
  f.sql.prepare("INSERT OR REPLACE INTO senderdeck_sessions VALUES (?,?,?,?,?)").run(await sha256Base64Url(token), user, `${user}@example.com`, Date.now(), Date.now() + 600000);
  return `${SESSION_COOKIE}=${token}`;
}
async function mailbox(f: ReturnType<typeof fixture>, provider: Provider, owner = "owner") {
  f.sql.prepare("INSERT INTO email_accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(`account-${owner}`, owner, provider, "provider-subject", "sample@example.com", "Sample", await encrypt("access", f.env.TOKEN_ENCRYPTION_KEY), null, Date.now() + 600000, "email", Date.now(), Date.now());
}
function providerMock(t: TestContext) {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input); calls.push(url);
    if (url.includes("/token")) return Response.json({ access_token: "access", expires_in: 3600 });
    if (url.includes("userinfo")) return Response.json({ id: "provider-subject", email: "sample@example.com", verified_email: true });
    if (url.includes("graph.microsoft.com")) return Response.json({ id: "provider-subject", mail: "sample@example.com" });
    throw new Error("Unexpected provider request");
  });
  return calls;
}

for (const provider of ["google", "microsoft"] as const) {
  for (const flow of ["signin", "connect"] as const) {
    test(`${provider} ${flow}: stolen state cannot finish in another browser or consume the real flow`, async t => {
      const f = fixture(); t.after(() => f.sql.close()); const calls = providerMock(t);
      const owner = await session(f);
      const route = flow === "signin" ? handleIdentityAuthRoute : handleOAuthRoute;
      const start = await route(new Request(`${origin}/${flow === "signin" ? "auth" : "oauth"}/${provider}/start`, { headers: { cookie: owner } }), f.env);
      assert.equal(start?.status, 302);
      const cookie = start!.headers.get("set-cookie")!;
      assert.match(cookie, /^__Host-senderdeck-oauth-/); assert.match(cookie, /Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
      const state = new URL(start!.headers.get("location")!).searchParams.get("state")!;
      const callback = `${origin}/oauth/${provider}/callback?state=${state}&code=sample-code`;
      for (const wrongCookie of ["", owner, `${owner}; __Host-senderdeck-oauth-wrong=${state}`]) {
        assert.equal((await route(new Request(callback, { headers: { cookie: wrongCookie } }), f.env))?.status, 403);
      }
      assert.equal(calls.length, 0);
      const goodCookie = `${owner}; ${cookie.split(";")[0]}`;
      if (flow === "connect") {
        const other = await session(f, "other");
        assert.equal((await route(new Request(callback, { headers: { cookie: `${other}; ${cookie.split(";")[0]}` } }), f.env))?.status, 403);
        assert.equal(calls.length, 0);
      }
      const good = await route(new Request(callback, { headers: { cookie: goodCookie } }), f.env);
      assert.equal(good?.status, flow === "signin" ? 303 : 200);
      const beforeReplay = calls.length;
      const replay = await route(new Request(callback, { headers: { cookie: goodCookie } }), f.env);
      assert.ok(!replay || replay.status >= 400); assert.equal(calls.length, beforeReplay);
    });
  }

  test(`${provider}: a connected mailbox cannot adopt its owner's account; explicit owner approval is required`, async t => {
    const f = fixture(); t.after(() => f.sql.close()); providerMock(t); await mailbox(f, provider);
    const start = await handleIdentityAuthRoute(new Request(`${origin}/auth/${provider}/start`), f.env);
    const state = new URL(start!.headers.get("location")!).searchParams.get("state")!;
    const response = await handleIdentityAuthRoute(new Request(`${origin}/oauth/${provider}/callback?state=${state}&code=code`, { headers: { cookie: start!.headers.get("set-cookie")!.split(";")[0] } }), f.env);
    assert.equal(response?.status, 303);
    const cookies = response!.headers.getSetCookie().find(c => c.startsWith(SESSION_COOKIE))!.split(";")[0];
    const signedIn = await authenticatedUser(new Request(origin, { headers: { cookie: cookies } }), f.env);
    assert.notEqual(signedIn?.userId, "owner");
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM email_accounts WHERE user_id='owner'").get()?.n, 1);
    await assert.rejects(enableAccountSignIn(f.env, "owner", "account-owner"), /different SenderDeck account/);
  });

  test(`${provider}: owner opt-in is same-origin, scoped and removed by disconnect`, async t => {
    const f = fixture(); t.after(() => f.sql.close()); await mailbox(f, provider); const cookie = await session(f);
    const request = (userCookie: string, requestOrigin: string, confirmed = true) => new Request(`${origin}/api/accounts`, { method: "POST", headers: { cookie: userCookie, origin: requestOrigin, "content-type": "application/json" }, body: JSON.stringify({ accountId: "account-owner", enableSignIn: true, confirmed }) });
    assert.equal((await handleAccountApi(request(cookie, "https://evil.example"), f.env))?.status, 403);
    assert.equal((await handleAccountApi(request(cookie, origin, false), f.env))?.status, 400);
    assert.equal((await handleAccountApi(request(await session(f, "other"), origin), f.env))?.status, 404);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM senderdeck_identities").get()?.n, 0);
    assert.equal((await handleAccountApi(request(cookie, origin), f.env))?.status, 200);
    assert.equal(f.sql.prepare("SELECT user_id FROM senderdeck_identities").get()?.user_id, "owner");
    providerMock(t);
    const signIn = async () => {
      const start = await handleIdentityAuthRoute(new Request(`${origin}/auth/${provider}/start`), f.env);
      const state = new URL(start!.headers.get("location")!).searchParams.get("state")!;
      const response = await handleIdentityAuthRoute(new Request(`${origin}/oauth/${provider}/callback?state=${state}&code=code`, { headers: { cookie: start!.headers.get("set-cookie")!.split(";")[0] } }), f.env);
      assert.equal(response?.status, 303);
      const cookie = response!.headers.getSetCookie().find(c => c.startsWith(SESSION_COOKIE))!.split(";")[0];
      return authenticatedUser(new Request(origin, { headers: { cookie } }), f.env);
    };
    assert.equal((await signIn())?.userId, "owner");
    await disconnectAccount(f.env, "owner", "account-owner");
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM senderdeck_identities").get()?.n, 0);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM email_accounts").get()?.n, 0);
    assert.notEqual((await signIn())?.userId, "owner");
  });
}

test("MCP consent identifies and escapes the registered requesting app", async t => {
  const f = fixture(); t.after(() => f.sql.close()); const cookie = await session(f);
  const redirect = "https://claude.ai/api/mcp/auth_callback";
  f.sql.prepare("INSERT INTO mcp_oauth_clients VALUES (?,?,?,?)").run("client", JSON.stringify([redirect]), '<script>fake</script> Claude', Date.now());
  const params = new URLSearchParams({ client_id: "client", redirect_uri: redirect, response_type: "code", code_challenge: "a".repeat(43), code_challenge_method: "S256" });
  const response = await handleMcpAuthentication(new Request(`${origin}/oauth/authorize?${params}`, { headers: { cookie } }), f.env);
  assert.equal(response?.status, 200);
  const html = await response!.text();
  assert.match(html, /&lt;script&gt;fake&lt;\/script&gt; Claude/);
  assert.doesNotMatch(html, /<script>fake<\/script>/);
});
