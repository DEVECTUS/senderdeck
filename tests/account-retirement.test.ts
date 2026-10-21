import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { handleAccountRetirement } from "../worker/account-retirement";
import { authenticatedUser } from "../worker/auth";
import { sha256Base64Url } from "../worker/crypto";
import { handleMcpAuthentication, requireMcpUserId } from "../worker/mcp-auth";
import { isUserRetired, retiredUserKey } from "../worker/retired-users";
import type { D1PreparedStatement, Env, WorkerD1Database } from "../worker/env";

async function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url)).filter(file => file.endsWith(".sql")).sort()) sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
  const wrap = (query: string, values: unknown[] = []): D1PreparedStatement => ({
    bind: (...args) => wrap(query, args),
    async first<T>() { return (sql.prepare(query).get(...values as never[]) as T) || null; },
    async all<T>() { return { success: true, results: sql.prepare(query).all(...values as never[]) as T[] }; },
    async run<T>() { return { success: true, results: [] as T[], meta: { changes: sql.prepare(query).run(...values as never[]).changes } }; },
  });
  const DB: WorkerD1Database = { prepare: wrap, async batch<T>(statements: D1PreparedStatement[]) {
    sql.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.all<T>()); sql.exec("COMMIT"); return results; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  } };
  const token = "x".repeat(43);
  const plan = { sourceUserId: "legacy", targetUserId: "retained", sourceBrandId: "old-brand", targetBrandId: "new-brand", tokenHash: await sha256Base64Url(token), expiresAt: Date.now() + 600000 };
  const env = { DB, TOKEN_ENCRYPTION_KEY: "", ACCOUNT_RETIREMENT_PLAN: JSON.stringify(plan) } as Env;
  sql.exec(`
    INSERT INTO social_customers VALUES ('old-customer','Business',1),('new-customer','Business',1),('other-customer','Unrelated',1);
    INSERT INTO social_members VALUES ('old-member','old-customer','legacy','owner'),('new-member','new-customer','retained','owner'),('other-member','other-customer','someone-else','owner');
    INSERT INTO social_brands VALUES ('old-brand','old-customer','Business','{}',1,1),('new-brand','new-customer','Business','{}',1,1),('other-brand','other-customer','Other','{}',1,1);
    INSERT INTO senderdeck_identities VALUES ('google','google-subject','retained','owner@example.test',1,1);
    INSERT INTO email_accounts VALUES ('old-email','legacy','google','google-subject','owner@example.test','Old','encrypted-old','refresh-old',NULL,'',1,1),('new-email','retained','google','google-subject','owner@example.test','Personal','encrypted-new','refresh-new',NULL,'',1,1),('other-email','someone-else','google','other-subject','other@example.test','Other','encrypted-other',NULL,NULL,'',1,1);
    INSERT INTO social_accounts (id,brand_id,provider,asset_id,name,token,user_token,permissions,status,validation,monitoring,created_at) VALUES ('page','old-brand','facebook','page-asset','Business','page-token','user-token','[]','connected','{}','{}',1),('instagram','old-brand','instagram','ig-asset','business','ig-token','user-token','[]','connected','{}','{}',1),('other-page','other-brand','facebook','other-asset','Other','other-token',NULL,'[]','connected','{}','{}',1);
    INSERT INTO social_threads (id,account_id,provider_id,kind,target,status,assigned_to,next_action,updated_at) VALUES ('thread','page','conversation','message','person','new','legacy','Review',1);
    INSERT INTO social_activity VALUES ('activity','old-brand','legacy','connected','page','',1);
    INSERT INTO social_monitor_evidence (account_id,messages_at,poll_errors) VALUES ('page',1,'[]');
    INSERT INTO social_drafts (id,thread_id,snapshot_id,brand_revision,revision,encrypted,state,created_by,approval_hash,approver,approval_expires_at,expires_at,created_at) VALUES ('draft','thread','snapshot',1,'revision','draft-data','draft','legacy','approval','legacy',9999999999999,9999999999999,1);
    INSERT INTO social_snapshots VALUES ('snapshot','thread','legacy','digest','snapshot-data',1,9999999999999);
    INSERT INTO social_grants VALUES ('old-grant','old-brand','legacy','encrypted',9999999999999),('target-grant','new-brand','retained','encrypted',9999999999999);
  `);
  async function call(action: string, body: unknown, options: { env?: Env; token?: string; origin?: string } = {}) {
    const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${options.token || token}` };
    if (options.origin) headers.origin = options.origin;
    return (await handleAccountRetirement(new Request(`https://senderdeck.test/api/account-retirement/${action}`, { method: "POST", headers, body: JSON.stringify(body) }), options.env || env))!;
  }
  async function preview() { const response = await call("preview", {}); assert.equal(response.status, 200, await response.clone().text()); const data = await response.json() as { revision: string }; return { revision: data.revision }; }
  return { sql, env, plan, call, preview };
}

test("retirement preserves social records, retains destination credentials and revokes only the source", async () => {
  const f = await fixture();
  const response = await f.call("apply", { ...await f.preview(), confirmed: true });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(await isUserRetired(f.env, "legacy"), true);
  assert.equal(await isUserRetired(f.env, "retained"), false);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM email_accounts WHERE user_id='legacy'").get()!.n, 0);
  assert.equal(f.sql.prepare("SELECT encrypted_refresh_token FROM email_accounts WHERE id='new-email'").get()!.encrypted_refresh_token, "refresh-new");
  assert.equal(f.sql.prepare("SELECT brand_id FROM social_accounts WHERE id='page'").get()!.brand_id, "new-brand");
  assert.equal(f.sql.prepare("SELECT token FROM social_accounts WHERE id='page'").get()!.token, "page-token");
  assert.equal(f.sql.prepare("SELECT brand_id FROM social_accounts WHERE id='instagram'").get()!.brand_id, "new-brand");
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_threads").get()!.n, 1);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_monitor_evidence").get()!.n, 1);
  assert.equal(f.sql.prepare("SELECT brand_id FROM social_activity WHERE id='activity'").get()!.brand_id, "new-brand");
  const draft = f.sql.prepare("SELECT * FROM social_drafts WHERE id='draft'").get()!;
  assert.equal(draft.state, "superseded"); assert.equal(draft.approval_hash, null); assert.equal(draft.encrypted, "draft-data");
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_customers WHERE id='old-customer'").get()!.n, 0);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM social_grants").get()!.n, 0);
  assert.equal(f.sql.prepare("SELECT brand_id FROM social_accounts WHERE id='other-page'").get()!.brand_id, "other-brand");
  assert.equal(f.sql.prepare("SELECT encrypted_access_token FROM email_accounts WHERE id='other-email'").get()!.encrypted_access_token, "encrypted-other");
  assert.equal((await f.call("apply", { revision: "old", confirmed: true })).status, 409);
  f.sql.close();
});

test("retirement is unavailable by default and rejects expired, wrong, cross-origin and unconfirmed requests", async () => {
  const f = await fixture();
  assert.equal((await f.call("preview", {}, { env: { ...f.env, ACCOUNT_RETIREMENT_PLAN: undefined } })).status, 404);
  assert.equal((await f.call("preview", {}, { env: { ...f.env, ACCOUNT_RETIREMENT_PLAN: JSON.stringify({ ...f.plan, expiresAt: Date.now() - 1 }) } })).status, 404);
  assert.equal((await f.call("preview", {}, { token: "y".repeat(43) })).status, 401);
  assert.equal((await f.call("preview", {}, { origin: "https://evil.test" })).status, 401);
  assert.equal((await f.call("apply", await f.preview())).status, 409);
  assert.equal((await f.call("apply", { ...await f.preview(), confirmed: true, targetUserId: "someone-else" })).status, 409);
  assert.equal(await isUserRetired(f.env, "legacy"), false);
  f.sql.close();
});

test("retirement refuses stale previews, nonmatching provider subjects, other members and policy conflicts", async () => {
  for (const mutation of [
    "UPDATE senderdeck_identities SET provider_account_id='different-subject'",
    "INSERT INTO social_members VALUES ('extra','old-customer','another-user','viewer')",
    "UPDATE social_brands SET profile='{\"different\":true}' WHERE id='new-brand'",
    "UPDATE social_drafts SET state='sending' WHERE id='draft'",
    "UPDATE social_drafts SET state='delivery_unknown' WHERE id='draft'",
    "UPDATE email_accounts SET label='Changed' WHERE id='old-email'",
  ]) {
    const f = await fixture(); const preview = await f.preview(); f.sql.exec(mutation);
    assert.equal((await f.call("apply", { ...preview, confirmed: true })).status, 409, mutation);
    assert.equal(await isUserRetired(f.env, "legacy"), false);
    assert.equal(f.sql.prepare("SELECT brand_id FROM social_accounts WHERE id='page'").get()!.brand_id, "old-brand");
    f.sql.close();
  }
});

test("transaction guard rolls back every write if membership changes after inspection", async () => {
  const f = await fixture(); const preview = await f.preview();
  const batch = f.env.DB.batch;
  f.env.DB.batch = async statements => {
    f.sql.exec("INSERT INTO social_members VALUES ('racing-member','old-customer','another-user','viewer')");
    return batch(statements);
  };
  assert.equal((await f.call("apply", { ...preview, confirmed: true })).status, 409);
  assert.equal(await isUserRetired(f.env, "legacy"), false);
  assert.equal(f.sql.prepare("SELECT brand_id FROM social_accounts WHERE id='page'").get()!.brand_id, "old-brand");
  assert.equal(f.sql.prepare("SELECT count(*) n FROM email_accounts WHERE user_id='legacy'").get()!.n, 1);
  f.sql.close();
});

test("retired identity cannot use hosting headers, cookies, stale MCP access or refresh tokens", async () => {
  const f = await fixture();
  f.sql.prepare("INSERT INTO social_runtime VALUES (?,?)").run(await retiredUserKey("legacy"), Date.now());
  f.sql.prepare("INSERT INTO senderdeck_sessions VALUES (?,?,?,?,?)").run(await sha256Base64Url("session"), "legacy", "owner@example.test", 1, Date.now() + 600000);
  const headers = { "oai-authenticated-user-id": "legacy", "oai-authenticated-user-email": "owner@example.test" };
  assert.equal(await authenticatedUser(new Request("https://senderdeck.test/", { headers }), f.env), null);
  assert.equal(await authenticatedUser(new Request("https://senderdeck.test/", { headers: { cookie: "senderdeck_session=session" } }), f.env), null);
  assert.equal((await authenticatedUser(new Request("https://senderdeck.test/", { headers: { ...headers, "oai-authenticated-user-id": "another-openai-user" } }), f.env))?.source, "openai");
  for (const type of ["access", "refresh"]) f.sql.prepare("INSERT INTO mcp_oauth_tokens VALUES (?,?,?,?,?,?,?,?)").run(await sha256Base64Url(type), type, "legacy", "client", "senderdeck", "https://senderdeck.test/api/mcp", Math.floor(Date.now() / 1000) + 600, 1);
  await assert.rejects(requireMcpUserId(new Request("https://senderdeck.test/api/mcp", { headers: { authorization: "Bearer access" } }), f.env), /Connect SenderDeck/);
  const response = await handleMcpAuthentication(new Request("https://senderdeck.test/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=refresh_token&client_id=client&refresh_token=refresh" }), f.env);
  assert.equal(response?.status, 400);
  assert.match(await response!.text(), /Reconnect using an active SenderDeck sign-in/);
  f.sql.close();
});
