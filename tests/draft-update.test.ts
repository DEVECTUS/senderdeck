import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { encrypt } from "../worker/crypto";
import type { Env, StoredAccount, Provider } from "../worker/env";
import { handleMcp } from "../worker/mcp";
import { buildMime, encodeBase64Url, decodeBase64Url } from "../worker/providers/shared";
import { updateRawMime } from "../worker/providers/mime-update";
import { getGoogleDraft, updateGoogleDraft } from "../worker/providers/google";
import { getMicrosoftDraft, updateMicrosoftDraft } from "../worker/providers/microsoft";

const logo = { filename: "logo.png", contentType: "image/png", contentBase64: "AAH+/w==", contentId: "logo@signature" };
const originalHtml = '<p>Hello</p><img src="cid:logo@signature">';
const originalRaw = buildMime({ from: "sender@example.com", to: ["recipient@example.com"], cc: ["cc@example.com"], subject: "Re: Project", bodyText: "Hello", bodyHtml: originalHtml, inReplyTo: "<parent@example.com>", references: "<root@example.com> <parent@example.com>", attachments: [logo] });
function bodies(raw: string): string[] {
  return [...raw.matchAll(/Content-Type: text\/(?:plain|html); charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]*)(?=--|$)/g)]
    .map((match) => Buffer.from(match[1].replace(/\s/g, ""), "base64").toString("utf8"));
}

test("MIME body edit retains reply headers, other body representation and opaque attachment bytes", () => {
  const updated = decodeBase64Url(updateRawMime(encodeBase64Url(originalRaw), { expectedRevision: "r", bodyText: "Changed café 👋" }));
  assert.deepEqual(bodies(updated), ["Changed café 👋", originalHtml]);
  assert.match(updated, /In-Reply-To: <parent@example.com>/);
  assert.match(updated, /References: <root@example.com> <parent@example.com>/);
  const originalImage = originalRaw.match(/Content-Type: image\/png[\s\S]*?(?=\r\n--)/)![0];
  assert.ok(updated.includes(originalImage));
});

test("MIME selective clears, explicit attachment replacement, and missing alternatives", () => {
  const cleared = decodeBase64Url(updateRawMime(encodeBase64Url(originalRaw), { expectedRevision: "r", subject: "", cc: [], bodyHtml: "", attachments: [] }));
  assert.match(cleared, /subject: \r\n/i);
  assert.match(cleared, /cc: \r\n/i);
  assert.deepEqual(bodies(cleared), ["Hello", ""]);
  assert.doesNotMatch(cleared, /logo\.png|AAH\+\/w==/);
  const replaced = decodeBase64Url(updateRawMime(encodeBase64Url(originalRaw), { expectedRevision: "r", attachments: [{ filename: "new.txt", contentType: "text/plain", contentBase64: "bmV3" }] }));
  assert.doesNotMatch(replaced, /logo\.png/);
  assert.match(replaced, /filename="new.txt"/);
  assert.ok(bodies(replaced).includes(originalHtml));
  const plain = buildMime({ from: "s@example.com", to: [], subject: "", bodyText: "Plain" });
  assert.deepEqual(bodies(decodeBase64Url(updateRawMime(encodeBase64Url(plain), { expectedRevision: "r", bodyHtml: "<b>Rich</b>" }))), ["Plain", "<b>Rich</b>"]);
});

test("metadata updates preserve entire original MIME payload, including binary bytes", () => {
  const raw = 'From: sender@example.com\r\nSubject: Old\r\nContent-Type: application/octet-stream\r\n\r\n\x00\xfe\xff';
  const edited = Buffer.from(updateRawMime(Buffer.from(raw, "latin1").toString("base64url"), { expectedRevision: "r", subject: "New" }), "base64url").toString("latin1");
  assert.equal(edited.split("\r\n\r\n")[1], raw.split("\r\n\r\n")[1]);
});

test("MIME editor fails closed on malformed or cryptographically protected content", () => {
  assert.throws(() => updateRawMime(encodeBase64Url("Broken"), { expectedRevision: "r", bodyText: "x" }), /Malformed/);
  const signed = 'Content-Type: multipart/signed; boundary="x"\r\n\r\n--x\r\nContent-Type: text/plain\r\n\r\nSigned\r\n--x--\r\n';
  assert.throws(() => updateRawMime(encodeBase64Url(signed), { expectedRevision: "r", bodyText: "x" }), /Signed\/encrypted/);
});

async function harness(t: TestContext, provider: Provider) {
  const key = Buffer.alloc(32, 2).toString("base64");
  const account: StoredAccount = { id: "account", user_id: "owner", provider, provider_account_id: "p", email: "sender@example.com", label: "Sender", encrypted_access_token: await encrypt("provider-token", key), encrypted_refresh_token: null, token_expires_at: null, scopes: "", created_at: 0, updated_at: 0 };
  const env = { TOKEN_ENCRYPTION_KEY: key, DB: { prepare(query: string) { let values: unknown[]; return { bind(...args: unknown[]) { values = args; return this; }, async first() {
    if (query.includes("mcp_oauth_tokens")) return { user_id: "owner", resource: "https://example.com/api/mcp", scope: "senderdeck" };
    assert.match(query, /WHERE user_id = \? AND id = \?/);
    return values[0] === "owner" && values[1] === "account" ? account : null;
  } }; } } } as unknown as Env;
  const state = { version: 1, raw: originalRaw, fail: "", missing: false, isDraft: true, failDelete: false, raceOnRaw: false, raceOnInspect: false,
    graph: { id: "draft", subject: "Re: Project", conversationId: "thread", from: { emailAddress: { address: account.email } }, toRecipients: [{ emailAddress: { address: "recipient@example.com" } }], ccRecipients: [{ emailAddress: { address: "cc@example.com" } }], bccRecipients: [], body: { contentType: "HTML", content: originalHtml } },
    attachments: [{ id: "image", name: logo.filename, contentType: logo.contentType, contentBytes: logo.contentBase64, contentId: logo.contentId, isInline: true, size: 4 }],
  };
  const calls: Array<{ url: string; method: string; body: Record<string, unknown>; headers: Headers }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, method, body, headers: new Headers(init.headers) });
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer provider-token");
    assert.doesNotMatch(url, /\/send$/);
    if (state.missing) return new Response("Draft not found", { status: 404 });
    if (state.fail && method !== "GET") return new Response(state.fail, { status: 412 });
    if (provider === "google") {
      assert.match(url, /\/drafts\/draft(?:\?|$)/);
      if (method === "PUT") {
        assert.equal(body.id, "draft"); assert.equal(body.message.threadId, "thread");
        state.raw = decodeBase64Url(body.message.raw); state.version++;
      }
      if (state.raceOnRaw && url.includes("format=raw")) state.version++;
      const message = { id: `message-${state.version}`, threadId: "thread" };
      if (url.includes("format=raw")) return Response.json({ id: "draft", message: { ...message, raw: encodeBase64Url(state.raw) } });
      const values = bodies(state.raw);
      return Response.json({ id: "draft", message: { ...message, payload: { headers: [{ name: "From", value: account.email }, { name: "Subject", value: "Re: Project" }, { name: "To", value: "recipient@example.com" }, { name: "Cc", value: "cc@example.com" }], parts: [
        { mimeType: "text/plain", body: { data: encodeBase64Url(values[0] || "") } },
        { mimeType: "text/html", body: { data: encodeBase64Url(values[1] || "") } },
        ...(state.raw.includes('filename="logo.png"') ? [{ filename: logo.filename, mimeType: logo.contentType, headers: [{ name: "Content-ID", value: "<logo@signature>" }], body: { attachmentId: "image", size: 4 } }] : []),
      ] } } });
    }
    assert.match(url, /\/messages\/draft(?:[/?]|$)/);
    if (url.includes("/attachments")) {
      if (state.raceOnInspect) { state.version++; state.raceOnInspect = false; }
      if (method === "POST") { state.attachments.push({ ...body, id: "replacement" }); state.version++; }
      if (method === "DELETE") {
        if (state.failDelete) return new Response("Delete failed", { status: 503 });
        state.attachments = state.attachments.filter((item) => !url.endsWith(`/${item.id}`)); state.version++;
        return new Response(null, { status: 204 });
      }
      return Response.json({ value: state.attachments });
    }
    if (method === "PATCH") { Object.assign(state.graph, body); state.version++; }
    return Response.json({ ...state.graph, changeKey: String(state.version), "@odata.etag": `W/"${state.version}"`, isDraft: state.isDraft });
  });
  const inspect = () => provider === "google" ? getGoogleDraft(env, account, "draft") : getMicrosoftDraft(env, account, "draft");
  const update = provider === "google" ? updateGoogleDraft : updateMicrosoftDraft;
  async function rpc(name: string, args: Record<string, unknown>) {
    const response = await handleMcp(new Request("https://example.com/api/mcp", { method: "POST", headers: { authorization: "Bearer mcp-token" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), env);
    return (await response!.json()).result;
  }
  return { env, account, state, calls, inspect, update, rpc };
}

for (const provider of ["google", "microsoft"] as const) {
  test(`${provider}: edits in place, preserves omitted fields/thread/inline files, and inspects saved HTML`, async (t) => {
    const h = await harness(t, provider);
    const before = await h.inspect();
    const result = await h.rpc("draft_update", { accountId: "account", draftId: "draft", expectedRevision: before.revision, bodyHtml: "<p>Updated</p><img src=\"cid:logo@signature\">" });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const saved = JSON.parse(result.content[0].text);
    assert.equal(saved.draftId, "draft"); assert.equal(saved.threadId, "thread");
    assert.equal(saved.bodyHtml, '<p>Updated</p><img src="cid:logo@signature">');
    assert.deepEqual(saved.to, before.to); assert.deepEqual(saved.cc, before.cc);
    assert.deepEqual(saved.attachments, before.attachments); assert.notEqual(saved.revision, before.revision);
    const writes = h.calls.filter((call) => call.method !== "GET");
    assert.equal(writes.length, 1); assert.equal(writes[0].method, provider === "google" ? "PUT" : "PATCH");
    if (provider === "google") assert.match(h.state.raw, /In-Reply-To: <parent@example.com>/);
    else { assert.deepEqual(Object.keys(writes[0].body), ["body"]); assert.equal(writes[0].headers.get("if-match"), 'W/"1"'); }
  });
  test(`${provider}: stale revisions, missing drafts and wrong accounts cause no mutations`, async (t) => {
    const h = await harness(t, provider);
    const before = await h.inspect(); h.state.version++;
    await assert.rejects(h.update(h.env, h.account, "draft", { expectedRevision: before.revision, subject: "Stale" }), /draft changed/);
    h.state.missing = true;
    await assert.rejects(h.inspect(), /404/); h.state.missing = false;
    const count = h.calls.length;
    const denied = await h.rpc("draft_update", { accountId: "other-owner-account", draftId: "draft", expectedRevision: before.revision, subject: "Forbidden" });
    assert.equal(denied.isError, true); assert.equal(h.calls.length, count);
    assert.ok(h.calls.every((call) => call.method === "GET"));
  });
  test(`${provider}: body-only changes invalidate earlier send confirmation`, async (t) => {
    const h = await harness(t, provider);
    const before = await h.inspect();
    await h.update(h.env, h.account, "draft", { expectedRevision: before.revision, bodyHtml: "<p>New wording</p>" });
    const confirmation = { revision: before.revision, sender: before.sender, to: before.to, cc: before.cc, bcc: before.bcc, subject: before.subject, attachments: before.attachments.map(({ filename, size }) => ({ filename, size })) };
    const result = await h.rpc("email_send", { accountId: "account", draftId: "draft", confirmed: true, confirmation });
    assert.equal(result.isError, true); assert.match(result.content[0].text, /confirm again/);
    assert.ok(h.calls.every((call) => !call.url.endsWith("/send")));
  });
  test(`${provider}: explicitly clears attachments and empty fields without creating a duplicate`, async (t) => {
    const h = await harness(t, provider);
    const before = await h.inspect();
    const result = await h.update(h.env, h.account, "draft", { expectedRevision: before.revision, cc: [], subject: "", bodyHtml: "", attachments: [] });
    assert.equal(result.bodyHtml, ""); assert.deepEqual(result.attachments, []);
    if (provider === "microsoft") { assert.equal(result.subject, ""); assert.deepEqual(result.cc, []); }
    else { assert.match(h.state.raw, /subject: \r\n/i); assert.match(h.state.raw, /cc: \r\n/i); }
    assert.ok(h.calls.every((call) => call.method !== "POST"));
  });
  test(`${provider}: provider precondition failure is reported and never retried as a create`, async (t) => {
    const h = await harness(t, provider); const before = await h.inspect(); h.state.fail = "Changed";
    await assert.rejects(h.update(h.env, h.account, "draft", { expectedRevision: before.revision, bodyHtml: "<p>New</p>" }), /412/);
    assert.equal(h.calls.filter((call) => call.method !== "GET").length, 1);
  });
}

test("Outlook protects HTML from implicit plain-text conversion and rejects sent messages", async (t) => {
  const h = await harness(t, "microsoft"); const before = await h.inspect();
  await assert.rejects(h.update(h.env, h.account, "draft", { expectedRevision: before.revision, bodyText: "Text" }), /one body/);
  assert.ok(h.calls.every((call) => call.method === "GET"));
  const saved = await h.update(h.env, h.account, "draft", { expectedRevision: before.revision, bodyHtml: "", bodyText: "Text" });
  assert.equal(saved.bodyText, "Text"); assert.equal(saved.bodyHtml, undefined);
  h.state.isDraft = false; await assert.rejects(h.inspect(), /not a draft/);
});

test("Outlook replaces inline attachments only on explicit request and reports partial failure", async (t) => {
  const h = await harness(t, "microsoft"); const before = await h.inspect(); h.state.failDelete = true;
  await assert.rejects(h.update(h.env, h.account, "draft", { expectedRevision: before.revision, attachments: [{ ...logo, filename: "replacement.png" }] }), /partial changes.*Inspect draft/);
  assert.equal(h.state.attachments.length, 2); // original preserved on failed deletion
  assert.notEqual((await h.inspect()).revision, before.revision);
  const writes = h.calls.filter((call) => call.method !== "GET");
  assert.deepEqual(writes.map((call) => call.method), ["POST", "DELETE"]);
  assert.equal(writes[0].body.contentId, logo.contentId); assert.equal(writes[0].body.isInline, true);
});

test("update schema exposes selective fields and revision-bound sending", async () => {
  const response = await handleMcp(new Request("https://example.com/api/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), {} as Env);
  const { result } = await response!.json();
  const update = result.tools.find((tool: { name: string }) => tool.name === "draft_update");
  assert.deepEqual(update.inputSchema.required, ["accountId", "draftId", "expectedRevision"]);
  for (const field of ["bodyText", "bodyHtml", "to", "cc", "bcc", "subject", "attachments"]) assert.ok(update.inputSchema.properties[field]);
  const send = result.tools.find((tool: { name: string }) => tool.name === "email_send");
  assert.ok(send.inputSchema.properties.confirmation.required.includes("revision"));
});

test("MIME leaves attached text, nested emails and quoted-printable HTML unchanged during a text edit", () => {
  const raw = [
    'From: sender@example.com', 'Content-Type: multipart/mixed; boundary="mixed"', '',
    '--mixed', 'Content-Type: multipart/alternative; boundary="alt"', '',
    '--alt', 'Content-Type: text/plain; charset=utf-8', '', 'Old text',
    '--alt', 'Content-Type: text/html; charset=iso-8859-1', 'Content-Transfer-Encoding: quoted-printable', 'Content-ID: <html-root>', '', '<p>Caf=E9</p>', '--alt--',
    '--mixed', 'Content-Type: text/plain; name*0*=utf-8\'\'notes;', 'Content-Disposition: inline; filename*0*=utf-8\'\'notes', '', 'Attached text must survive',
    '--mixed', 'Content-Type: message/rfc822', 'Content-Disposition: attachment; filename="forward.eml"', '', 'From: other@example.com', 'Content-Type: text/plain', '', 'Original nested email', '--mixed--', '',
  ].join('\r\n');
  const updated = decodeBase64Url(updateRawMime(encodeBase64Url(raw), { expectedRevision: "r", bodyText: "New text" }));
  assert.ok(updated.includes('Content-Transfer-Encoding: quoted-printable\r\nContent-ID: <html-root>\r\n\r\n<p>Caf=E9</p>'));
  assert.ok(updated.includes('Attached text must survive'));
  assert.ok(updated.includes('Original nested email'));
  assert.ok(updated.includes('Content-Type: message/rfc822'));
  const rich = decodeBase64Url(updateRawMime(encodeBase64Url(raw), { expectedRevision: "r", bodyHtml: "<p>New HTML</p>" }));
  assert.match(rich, /Content-ID: <html-root>/);
});

for (const provider of ["google", "microsoft"] as const) {
  test(`${provider}: attachment-only changes invalidate approval even for matching filename and size`, async (t) => {
    const h = await harness(t, provider); const before = await h.inspect();
    await h.update(h.env, h.account, "draft", { expectedRevision: before.revision, attachments: [{ ...logo, contentBase64: "AQIDBA==" }] });
    const after = await h.inspect(); assert.notEqual(after.revision, before.revision);
    assert.equal(after.subject, before.subject); assert.equal(after.bodyHtml, before.bodyHtml);
  });
  test(`${provider}: null, unknown fields, missing revisions and no-op updates fail before provider calls`, async (t) => {
    const h = await harness(t, provider);
    for (const extra of [{ expectedRevision: "r", bodyHtml: null }, { expectedRevision: "r", attachments: null }, { expectedRevision: "r", unexpected: true }, { subject: "Missing revision" }, { expectedRevision: "r" }]) {
      const result = await h.rpc("draft_update", { accountId: "account", draftId: "draft", ...extra });
      assert.equal(result.isError, true);
    }
    assert.equal(h.calls.length, 0);
  });
}

test("Gmail rejects a draft changed between full and raw reads", async (t) => {
  const h = await harness(t, "google"); const before = await h.inspect(); h.state.raceOnRaw = true;
  await assert.rejects(h.update(h.env, h.account, "draft", { expectedRevision: before.revision, bodyHtml: "<p>New</p>" }), /changed while reading/);
  assert.ok(h.calls.every((call) => call.method === "GET"));
});

test("Outlook rejects an inconsistent body/attachment inspection snapshot", async (t) => {
  const h = await harness(t, "microsoft"); h.state.raceOnInspect = true;
  await assert.rejects(h.inspect(), /changed during inspection/);
  assert.ok(h.calls.every((call) => call.method === "GET"));
});
