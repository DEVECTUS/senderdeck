import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { encrypt } from "../worker/crypto";
import type { Env, StoredAccount } from "../worker/env";
import { googleScopes, listAccounts, routeAccount } from "../worker/accounts";
import { handleMcp } from "../worker/mcp";
import { buildMime, decodeBase64Url, encodeBase64Url } from "../worker/providers/shared";
import { getGoogleDraft } from "../worker/providers/google";
import { inspectedSender } from "../worker/sender-address";

const primary = "owner@example.com";
const alias = "support@example.com";
const otherAlias = "support@other.example";
const pending = "pending@example.com";

async function harness(t: TestContext) {
  const key = Buffer.alloc(32, 5).toString("base64");
  const account: StoredAccount = { id: "account", user_id: "owner", provider: "google", provider_account_id: "google-owner", email: primary, label: "Work", encrypted_access_token: await encrypt("account-token", key), encrypted_refresh_token: null, token_expires_at: null, scopes: googleScopes().join(" "), created_at: 0, updated_at: 0 };
  const second: StoredAccount = { ...account, id: "second", email: "second@example.com", encrypted_access_token: await encrypt("second-token", key) };
  const state = {
    accounts: [account],
    identities: [
      { sendAsEmail: primary, isPrimary: true, isDefault: false },
      { sendAsEmail: alias, verificationStatus: "accepted", isDefault: true, displayName: "Support", signature: "PRIVATE SIGNATURE", smtpMsa: { host: "PRIVATE SMTP" } },
      { sendAsEmail: otherAlias, verificationStatus: "accepted" },
      { sendAsEmail: pending, verificationStatus: "pending" },
      { sendAsEmail: "unknown@example.com", verificationStatus: "verificationStatusUnspecified" },
      { sendAsEmail: "missing@example.com" },
    ],
    raw: buildMime({ from: alias, to: ["recipient@example.com"], cc: ["cc@example.com"], bcc: ["bcc@example.com"], subject: "Alias test draft", bodyText: "Safe fixture", bodyHtml: "<p>Safe fixture</p>", inReplyTo: "<parent@example.com>", references: "<parent@example.com>", attachments: [{ filename: "test.txt", contentType: "text/plain", contentBase64: "YWJj" }] }),
    version: 1, settingsError: 0, changeOnSettings: false, sent: 0,
    overrideHeaders: undefined as Array<{ name: string; value: string }> | undefined,
  };
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  const env = { TOKEN_ENCRYPTION_KEY: key, DB: { prepare(query: string) {
    let values: unknown[] = [];
    return { bind(...args: unknown[]) { values = args; return this; }, async first() {
      if (query.includes("social_runtime")) return null;
      if (query.includes("mcp_oauth_tokens")) return { user_id: "owner", resource: "https://example.com/api/mcp", scope: "senderdeck" };
      assert.match(query, /WHERE user_id = \? AND id = \?/);
      return state.accounts.find((item) => item.user_id === values[0] && item.id === values[1]) ?? null;
    }, async all() {
      assert.match(query, /WHERE user_id = \?/);
      return { results: state.accounts.filter((item) => item.user_id === values[0]) };
    } };
  } } } as unknown as Env;

  // All HTTP is mocked, including send. No test may reach a real mailbox.
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, method, body });
    const token = new Headers(init.headers).get("authorization");
    assert.ok(["Bearer account-token", "Bearer second-token"].includes(token!));
    assert.match(url, /^https:\/\/gmail.googleapis.com\/gmail\/v1\/users\/me\//);
    if (url.includes("/settings/sendAs?")) {
      assert.equal(method, "GET");
      assert.match(url, /fields=sendAs\(/);
      if (state.settingsError) return new Response("Settings unavailable", { status: state.settingsError });
      if (state.changeOnSettings) { state.raw = state.raw.replace("Alias test draft", "Externally changed"); state.version++; state.changeOnSettings = false; }
      return Response.json({ sendAs: token === "Bearer second-token" ? [{ sendAsEmail: second.email, isPrimary: true }, { sendAsEmail: alias, verificationStatus: "accepted" }] : state.identities });
    }
    if (url.endsWith("/drafts/send")) {
      assert.equal(method, "POST"); assert.equal(body.id, "draft"); state.sent++;
      return Response.json({ id: "mock-sent", threadId: "thread" });
    }
    if (url.includes("/messages/original")) return Response.json({ id: "original", threadId: "thread", payload: { headers: [{ name: "From", value: "recipient@example.com" }, { name: "Message-ID", value: "<parent@example.com>" }, { name: "Subject", value: "Original" }] } });
    assert.match(url, /\/drafts(?:\/draft)?(?:\?|$)/);
    if (method !== "GET") {
      assert.ok(method === "POST" || method === "PUT");
      if (method === "PUT") {
        assert.equal(body.id, "draft");
        assert.equal(body.message.id, `message-${state.version}`);
        assert.notEqual(body.message.id, body.message.threadId);
      }
      state.raw = decodeBase64Url(body.message.raw); state.version++;
      return Response.json({ id: "draft", message: { id: `message-${state.version}`, threadId: "thread" } });
    }
    const message = { id: `message-${state.version}`, threadId: "thread" };
    if (url.includes("format=raw")) return Response.json({ id: "draft", message: { ...message, raw: encodeBase64Url(state.raw) } });
    const headers = state.overrideHeaders ?? state.raw.split("\r\n\r\n")[0].split("\r\n").map((line) => ({ name: line.slice(0, line.indexOf(":")), value: line.slice(line.indexOf(":") + 1).trim() }));
    // Include the exact MIME as body fixture data so every saved edit affects revision.
    return Response.json({ id: "draft", message: { ...message, payload: { headers, mimeType: "text/plain", body: { data: encodeBase64Url(state.raw) } } } });
  });
  async function rpc(name: string, args: Record<string, unknown>) {
    const response = await handleMcp(new Request("https://example.com/api/mcp", { method: "POST", headers: { authorization: "Bearer mcp-token" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), env);
    return (await response!.json()).result;
  }
  async function inspect() { return getGoogleDraft(env, account, "draft"); }
  async function approval() {
    const draft = await inspect();
    return { accountId: account.id, draftId: draft.draftId, confirmed: true, confirmation: { revision: draft.revision, sender: draft.sender, to: draft.to, cc: draft.cc, bcc: draft.bcc, subject: draft.subject, attachments: draft.attachments.map(({ filename, size }) => ({ filename, size })) } };
  }
  return { state, calls, account, second, env, rpc, inspect, approval };
}

test("discovery nests only Gmail primary and accepted aliases under the owning OAuth account", async t => {
  const h = await harness(t);
  const accounts = await listAccounts(h.env, "owner");
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].id, "account");
  assert.deepEqual(accounts[0].senderIdentities?.map(item => item.email), [primary, alias, otherAlias]);
  assert.doesNotMatch(JSON.stringify(accounts), /PRIVATE|pending@|unknown@|missing@|token/);
  assert.deepEqual(googleScopes(), ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"]);
  assert.deepEqual(await listAccounts(h.env, "other-owner"), []);
});

test("routing an alias returns its owner and explicit From; duplicate ownership is ambiguous", async t => {
  const h = await harness(t);
  const routed = await routeAccount(h.env, "owner", alias.toUpperCase());
  assert.equal(routed.id, "account"); assert.equal(routed.selectedFrom, alias);
  await assert.rejects(routeAccount(h.env, "owner", pending), /No account or authorised/);
  h.state.accounts.push(h.second);
  await assert.rejects(routeAccount(h.env, "owner", alias), /multiple accounts/);
});

test("discovery failures are explicit and cannot turn into alias authorisation", async t => {
  const h = await harness(t); h.state.settingsError = 403;
  const [account] = await listAccounts(h.env, "owner");
  assert.deepEqual(account.senderIdentities, []); assert.match(account.senderDiscoveryError!, /403/);
  await assert.rejects(routeAccount(h.env, "owner", alias), /Could not verify/);
  const result = await h.rpc("draft_create", { accountId: "account", from: alias, to: [], subject: "Test", bodyText: "Unsent" });
  assert.equal(result.isError, true); assert.ok(h.calls.every(call => call.method === "GET"));
});

for (const from of [alias, otherAlias, primary, undefined]) {
  test(`create preserves ${from ?? "implicit primary"} in provider MIME and inspection`, async t => {
    const h = await harness(t);
    const result = await h.rpc("draft_create", { accountId: "account", ...(from ? { from: from.toUpperCase() } : {}), to: [], subject: "Safe draft", bodyText: "Never send this fixture" });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const saved = result.structuredContent.result;
    assert.equal(saved.sender, from ?? primary); assert.equal(saved.fromHeader, from ?? primary);
    assert.ok(h.state.raw.startsWith(`From: ${from ?? primary}\r\n`));
    assert.equal(h.state.sent, 0);
    if (!from) assert.ok(h.calls.every(call => !call.url.includes("sendAs")));
  });
}

test("reply drafts retain the requested alias and original thread headers", async t => {
  const h = await harness(t);
  const result = await h.rpc("draft_reply", { accountId: "account", messageId: "original", from: alias, bodyText: "Safe reply fixture" });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.equal(result.structuredContent.result.sender, alias);
  assert.match(h.state.raw, /In-Reply-To: <parent@example.com>/);
  const write = h.calls.find(call => call.method === "POST")!;
  assert.equal((write.body.message as { threadId: string }).threadId, "thread");
  assert.equal(h.state.sent, 0);
});

for (const from of ["attacker@example.com", pending, "unknown@example.com", "missing@example.com", "", null, "support@example.com\r\nBcc: attacker@example.com", "Display <support@example.com>", "support@example.com,attacker@example.com"]) {
  test(`create and update reject invalid or unauthorised From ${JSON.stringify(from)}`, async t => {
    const h = await harness(t); const before = await h.inspect();
    for (const [name, args] of [
      ["draft_create", { to: [], subject: "Unsafe sender", bodyText: "Do not save" }],
      ["draft_reply", { messageId: "original", bodyText: "Do not save" }],
      ["draft_update", { draftId: "draft", expectedRevision: before.revision }],
    ] as const) {
      const result = await h.rpc(name, { accountId: "account", ...args, from });
      assert.equal(result.isError, true, JSON.stringify(result));
    }
    assert.ok(h.calls.every(call => call.method === "GET")); assert.equal(h.state.sent, 0);
  });
}

test("From-only update preserves body, attachments, thread and draft ID; omitted From stays selected", async t => {
  const h = await harness(t); const before = await h.inspect();
  const originalPayload = h.state.raw.slice(h.state.raw.indexOf("\r\n\r\n"));
  const result = await h.rpc("draft_update", { accountId: "account", draftId: "draft", expectedRevision: before.revision, from: otherAlias });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const saved = result.structuredContent.result;
  assert.equal(saved.sender, otherAlias); assert.equal(saved.draftId, "draft"); assert.notEqual(saved.revision, before.revision);
  assert.equal(h.state.raw.slice(h.state.raw.indexOf("\r\n\r\n")), originalPayload);
  assert.match(h.state.raw, /In-Reply-To: <parent@example.com>/);
  const update = await h.rpc("draft_update", { accountId: "account", draftId: "draft", expectedRevision: saved.revision, bodyText: "Revised safe fixture" });
  assert.notEqual(update.isError, true, JSON.stringify(update)); assert.equal(update.structuredContent.result.sender, otherAlias);
  assert.deepEqual(h.calls.filter(call => call.method !== "GET").map(call => call.method), ["PUT", "PUT"]);
});

test("mock send succeeds only with current authorisation and exact inspected alias confirmation", async t => {
  const h = await harness(t); const args = await h.approval();
  const result = await h.rpc("email_send", args);
  assert.notEqual(result.isError, true, JSON.stringify(result)); assert.equal(result.structuredContent.result.sender, alias);
  assert.equal(h.state.sent, 1);
  assert.ok(h.calls.at(-3)!.url.includes("settings/sendAs"));
  assert.ok(h.calls.at(-2)!.url.includes("format=full"));
  assert.ok(h.calls.at(-1)!.url.endsWith("drafts/send"));
});

for (const mode of ["removed", "pending", "provider failure", "revision changed during alias lookup"] as const) {
  test(`mock send fails closed when ${mode}`, async t => {
    const h = await harness(t); const args = await h.approval();
    if (mode === "removed") h.state.identities = h.state.identities.filter(item => item.sendAsEmail !== alias);
    if (mode === "pending") h.state.identities.find(item => item.sendAsEmail === alias)!.verificationStatus = "pending";
    if (mode === "provider failure") h.state.settingsError = 503;
    if (mode === "revision changed during alias lookup") h.state.changeOnSettings = true;
    const result = await h.rpc("email_send", args);
    assert.equal(result.isError, true, JSON.stringify(result)); assert.equal(h.state.sent, 0);
    assert.ok(h.calls.every(call => call.method === "GET"));
  });
}

test("From changes invalidate prior send approval; primary confirmation cannot approve an alias", async t => {
  const h = await harness(t); const args = await h.approval();
  const wrong = structuredClone(args); wrong.confirmation.sender = primary;
  assert.equal((await h.rpc("email_send", wrong)).isError, true);
  const update = await h.rpc("draft_update", { accountId: "account", draftId: "draft", expectedRevision: args.confirmation.revision, from: otherAlias });
  assert.notEqual(update.isError, true);
  assert.equal((await h.rpc("email_send", args)).isError, true);
  assert.equal((await h.rpc("email_send", { ...args, confirmed: false })).isError, true);
  const missing = { ...args, confirmation: { ...args.confirmation, revision: undefined } };
  assert.equal((await h.rpc("email_send", missing)).isError, true);
  assert.equal(h.state.sent, 0);
});

test("alias permission is account-scoped and cannot cross an owner's accounts or users", async t => {
  const h = await harness(t); h.state.accounts.push(h.second);
  const result = await h.rpc("draft_create", { accountId: "second", from: otherAlias, to: [], subject: "Unsafe", bodyText: "Do not save" });
  assert.equal(result.isError, true);
  h.state.accounts.push({ ...h.account, id: "other-owner", user_id: "other-user" });
  const count = h.calls.length;
  for (const name of ["draft_create", "draft_inspect", "draft_update", "email_send"]) {
    assert.equal((await h.rpc(name, { accountId: "other-owner", confirmed: true, from: alias })).isError, true);
  }
  assert.equal(h.calls.length, count); assert.ok(h.calls.every(call => call.method === "GET"));
});

test("Microsoft alias input is rejected rather than silently using a different sender", async t => {
  const h = await harness(t); h.account.provider = "microsoft";
  for (const [name, args] of [
    ["draft_create", { to: [], subject: "Test", bodyText: "Unsent" }],
    ["draft_reply", { messageId: "original", bodyText: "Unsent" }],
    ["draft_update", { draftId: "draft", expectedRevision: "r" }],
  ] as const) assert.equal((await h.rpc(name, { accountId: "account", from: alias, ...args })).isError, true);
  assert.equal(h.calls.length, 0);
});

test("inspection rejects spoofed, repeated, multiple or absent provider From headers", async t => {
  const h = await harness(t);
  for (const headers of [[], [{ name: "From", value: alias }, { name: "From", value: primary }], [{ name: "From", value: `${alias}, ${primary}` }], [{ name: "From", value: `Support <${alias}>, Attacker <attacker@example.com>` }], [{ name: "From", value: `Support <${alias}>\r\nBcc: attacker@example.com` }]]) {
    h.state.overrideHeaders = headers;
    await assert.rejects(h.inspect(), /unambiguous From/);
  }
  assert.deepEqual(inspectedSender([{ name: "From", value: `"Support, Team" <${alias}>` }]), { sender: alias, fromHeader: `"Support, Team" <${alias}>` });
});

test("public MCP schemas advertise explicit From without changing confirmation requirements", async () => {
  const response = await handleMcp(new Request("https://example.com/api/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), {} as Env);
  const { result } = await response!.json();
  for (const name of ["draft_create", "draft_reply", "draft_update"]) {
    const tool = result.tools.find((item: { name: string }) => item.name === name);
    assert.equal(tool.inputSchema.properties.from.type, "string");
    assert.ok(!tool.inputSchema.required.includes("from"));
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
  const send = result.tools.find((item: { name: string }) => item.name === "email_send");
  assert.deepEqual(send.inputSchema.properties.confirmation.required, ["revision", "sender", "to", "cc", "bcc", "subject", "attachments"]);
  assert.equal(send.inputSchema.properties.confirmed.const, true);
});
