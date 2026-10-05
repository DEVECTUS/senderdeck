import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { encrypt } from "../worker/crypto";
import type { Env, StoredAccount } from "../worker/env";
import { handleMcp } from "../worker/mcp";
import { handleMcpAuthentication } from "../worker/mcp-auth";

async function harness(t: TestContext, ids: string[], failure = "invalid_grant") {
  const key = Buffer.alloc(32, 3).toString("base64");
  const accounts: StoredAccount[] = await Promise.all(ids.map(async id => ({
    id, user_id: "owner", provider: "google" as const, provider_account_id: id,
    email: `${id}@example.com`, label: id,
    encrypted_access_token: await encrypt("provider-token", key),
    encrypted_refresh_token: id === "expired" ? await encrypt("refresh", key) : null,
    token_expires_at: id === "expired" ? 1 : null, scopes: "", created_at: 0, updated_at: 0,
  })));
  const env = { TOKEN_ENCRYPTION_KEY: key, GOOGLE_CLIENT_ID: "test", GOOGLE_CLIENT_SECRET: "test",
    DB: { prepare(query: string) { return { bind() { return this; }, async first() {
      assert.match(query, /mcp_oauth_tokens/);
      return { user_id: "owner", resource: "https://example.com/api/mcp", scope: "senderdeck" };
    }, async all() { return { results: accounts }; } }; } },
  } as unknown as Env;
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(String(url));
    assert.doesNotMatch(String(url), /\/send(?:\?|$)/);
    if (String(url).includes("oauth2.googleapis.com/token")) return Response.json({ error: failure }, { status: 400 });
    assert.match(String(url), /gmail.*\/messages\?/);
    return Response.json({ messages: [] });
  });
  async function call(name: string, args: object) {
    const response = await handleMcp(new Request("https://example.com/api/mcp", {
      method: "POST", headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }), env);
    assert.ok(response);
    return (await response.json()).result;
  }
  return { call, calls };
}

test("all failed mailbox searches are errors with actionable reconnect instructions", async t => {
  const { call } = await harness(t, ["expired"]);
  const result = await call("email_search", { query: "invoice" });
  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent.result.results, []);
  assert.deepEqual(result.structuredContent.result.successfulAccountIds, []);
  assert.match(result.structuredContent.result.errors[0].error, /Reconnect expired@example.com/);
});

test("partial search failure retains the successful mailbox and identifies the failed one", async t => {
  const { call } = await harness(t, ["expired", "healthy"]);
  const result = await call("email_search", { query: "invoice" });
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent.result.successfulAccountIds, ["healthy"]);
  assert.equal(result.structuredContent.result.errors[0].accountId, "expired");
});

test("successful empty search remains a valid no-match result", async t => {
  const { call } = await harness(t, ["healthy"]);
  const result = await call("email_search", { query: "invoice" });
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent.result.errors, []);
  assert.deepEqual(result.structuredContent.result.successfulAccountIds, ["healthy"]);
});

test("transient provider failures do not incorrectly demand reconnection", async t => {
  const { call } = await harness(t, ["expired"], "temporarily_unavailable");
  const result = await call("email_search", { query: "invoice" });
  assert.equal(result.isError, true);
  assert.doesNotMatch(result.structuredContent.result.errors[0].error, /Reconnect/);
});

test("missing reviewer sender label fails without accessing any provider", async t => {
  const { call, calls } = await harness(t, ["healthy"]);
  const result = await call("route_account", { hint: "Work" });
  assert.equal(result.isError, true);
  assert.equal(calls.length, 0);
});

test("MCP resource discovery supports the endpoint path variants used by clients", async () => {
  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp", "/api/mcp/.well-known/oauth-protected-resource"]) {
    const response = await handleMcpAuthentication(new Request(`https://example.com${path}`), {} as Env);
    assert.ok(response);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).resource, "https://example.com/api/mcp");
  }
});

