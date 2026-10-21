import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { encrypt } from "../worker/crypto";
import type { Env, StoredAccount } from "../worker/env";
import type { AttachmentInfo, MessageDetail } from "../worker/mail-types";
import { handleMcp } from "../worker/mcp";

interface Part {
  partId?: string;
  filename?: string;
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: Part[];
}

const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const types = [
  ["submission.docx", docx], ["minutes.docx", docx], ["report.pdf", "application/pdf"],
  ["sheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["photo.jpg", "image/jpeg"], ["logo.png", "image/png"], ["table.csv", "text/csv"],
  ["notes.txt", "text/plain"], ["bundle.zip", "application/zip"],
] as const;

async function harness(t: TestContext, provider: "google" | "microsoft" = "google") {
  const key = Buffer.alloc(32, 7).toString("base64");
  const account: StoredAccount = { id: "business", user_id: "owner", provider, provider_account_id: "provider-owner", email: "owner@example.com", label: "Business", encrypted_access_token: await encrypt("business-token", key), encrypted_refresh_token: null, token_expires_at: null, scopes: "", created_at: 0, updated_at: 0 };
  const second = { ...account, id: "other", encrypted_access_token: await encrypt("other-token", key) };
  const state = {
    generation: 0, downloaded: [] as string[], calls: [] as string[],
    payload: { partId: "", mimeType: "multipart/mixed", parts: [
      { partId: "0", mimeType: "multipart/related", parts: [
        { partId: "0.0", mimeType: "multipart/alternative", parts: [
          { partId: "0.0.0", mimeType: "text/plain", body: { data: "SGVsbG8", size: 5 } },
          { partId: "0.0.1", mimeType: "text/html", body: { data: "SGVsbG8", size: 5 } },
        ] },
        { partId: "0.1", mimeType: "image/png", headers: [{ name: "Content-ID", value: "<logo@fixture>" }], body: { attachmentId: "inline", size: 4 } },
      ] },
      ...types.map(([filename, mimeType], index) => ({ partId: String(index + 1), filename, mimeType, body: { attachmentId: `file-${index}`, size: 4 } })),
    ] } as Part,
    bytes: Buffer.from([0, 251, 255, 42]), providerSize: undefined as number | undefined,
    downloadError: 0, invalidData: false, missingData: false, rotateTokens: true,
  };
  const env = { TOKEN_ENCRYPTION_KEY: key, DB: { prepare(query: string) {
    let values: unknown[] = [];
    return { bind(...args: unknown[]) { values = args; return this; }, async first() {
      if (query.includes("mcp_oauth_tokens")) return { user_id: "owner", resource: "https://example.com/api/mcp", scope: "senderdeck" };
      assert.match(query, /WHERE user_id = \? AND id = \?/);
      return [account, second].find(item => item.user_id === values[0] && item.id === values[1]) ?? null;
    }, async all() { return { results: [account, second].filter(item => item.user_id === values[0]) }; } };
  } } } as unknown as Env;

  // No live mailbox writes: every provider call must be a read and is mocked.
  t.mock.method(globalThis, "fetch", async (input: string, init: RequestInit = {}) => {
    assert.equal(init.method || "GET", "GET");
    const url = new URL(input);
    state.calls.push(input);
    const token = new Headers(init.headers).get("authorization");
    assert.ok(["Bearer business-token", "Bearer other-token"].includes(token!));
    if (url.pathname.includes("/attachments/")) {
      const id = decodeURIComponent(url.pathname.split("/attachments/")[1]);
      state.downloaded.push(id);
      if (provider === "google") {
        if (state.rotateTokens) assert.match(id, new RegExp(`-read-${state.generation}$`), "must resolve the current Gmail token");
        if (state.downloadError) return new Response("Provider failed", { status: state.downloadError });
        if (state.invalidData) return Response.json({ data: "!invalid!", size: 4 });
        if (state.missingData) return Response.json({ size: 4 });
        return Response.json({ data: state.bytes.toString("base64url"), size: state.providerSize ?? state.bytes.length });
      }
      return Response.json({ id, name: "report.pdf", contentType: "application/pdf", size: 4, contentBytes: state.bytes.toString("base64"), "@odata.type": "#microsoft.graph.fileAttachment" });
    }
    if (provider === "microsoft") {
      assert.match(url.pathname, /\/messages\/message\/attachments$/);
      return Response.json({ value: [{ id: "graph-file", name: "report.pdf", contentType: "application/pdf", size: 4 }] });
    }
    assert.equal(url.hostname, "gmail.googleapis.com");
    if (url.pathname.endsWith("/messages")) return Response.json({ messages: [{ id: "message" }] });
    assert.match(url.pathname, /\/messages\/(message|other-message)$/);
    state.generation++;
    const payload = structuredClone(state.payload);
    function rotate(part: Part) {
      if (part.body?.attachmentId) part.body.attachmentId += `-read-${state.generation}`;
      part.parts?.forEach(rotate);
    }
    if (state.rotateTokens) rotate(payload);
    return Response.json({ id: url.pathname.split("/").at(-1), threadId: "different-thread-id", payload: url.searchParams.get("format") === "metadata" ? { headers: [] } : payload });
  });
  async function rpc(name: string, args: Record<string, unknown> = {}) {
    const response = await handleMcp(new Request("https://example.com/api/mcp", { method: "POST", headers: { authorization: "Bearer test-mcp-token" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: { accountId: account.id, messageId: "message", ...args } } }) }), env);
    return (await response!.json()).result;
  }
  async function ok(name: string, args: Record<string, unknown> = {}) {
    const result = await rpc(name, args);
    assert.notEqual(result.isError, true, result.content[0].text);
    return JSON.parse(result.content[0].text);
  }
  return { state, env, rpc, ok };
}

test("MCP downloads both DOCX files using email_read IDs after Gmail rotates its attachment tokens", async t => {
  const h = await harness(t);
  const read = await h.ok("email_read") as MessageDetail;
  const listed = await h.ok("attachment_list");
  assert.deepEqual(read.attachments, listed.attachments);
  for (const attachment of read.attachments.filter(item => item.contentType === docx)) {
    const downloaded = await h.ok("attachment_download", { attachmentId: attachment.id });
    assert.equal(downloaded.filename, attachment.filename);
    assert.equal(downloaded.id, attachment.id);
    assert.deepEqual(Buffer.from(downloaded.contentBase64, "base64"), h.state.bytes);
    assert.equal(downloaded.size, h.state.bytes.length);
  }
  assert.equal(h.state.downloaded.length, 2);
  assert.match(h.state.downloaded[0], /^file-0-read-/);
  assert.match(h.state.downloaded[1], /^file-1-read-/);
  assert.ok(h.state.calls.every(url => !url.includes("different-thread-id")));
});

test("nested inline PNG and common file types round-trip with scoped stable IDs", async t => {
  const h = await harness(t);
  const read = await h.ok("email_read") as MessageDetail;
  assert.equal(read.attachments.length, types.length + 1);
  assert.equal(read.attachments[0].contentId, "logo@fixture");
  assert.equal(read.attachments[0].isInline, true);
  for (const attachment of read.attachments) {
    const result = await h.ok("attachment_download", { attachmentId: attachment.id });
    assert.deepEqual(Buffer.from(result.contentBase64, "base64"), h.state.bytes);
    assert.equal(result.contentType, attachment.contentType);
  }
});

test("embedded data, empty attachments, root parts and absent part IDs remain downloadable", async t => {
  const h = await harness(t);
  h.state.payload = { mimeType: "multipart/mixed", parts: [
    { filename: "same.txt", mimeType: "text/plain", body: { data: "YQ", size: 1 } },
    { partId: "1", filename: "same.txt", mimeType: "text/plain", body: { data: "Yg", size: 1 } },
    { filename: "empty.txt", mimeType: "text/plain", body: { data: "", size: 0 } },
  ] };
  const read = await h.ok("email_read") as MessageDetail;
  assert.equal(new Set(read.attachments.map(item => item.id)).size, 3);
  for (let index = 0; index < 3; index++) {
    const result = await h.ok("attachment_download", { attachmentId: read.attachments[index].id });
    assert.equal(Buffer.from(result.contentBase64, "base64").toString(), ["a", "b", ""][index]);
  }
  h.state.payload = { partId: "", filename: "root.txt", mimeType: "text/plain", body: { data: "Yw", size: 1 } };
  const root = await h.ok("email_read") as MessageDetail;
  assert.equal((await h.ok("attachment_download", { attachmentId: root.attachments[0].id })).contentBase64, "Yw==");
  assert.equal(h.state.downloaded.length, 0);
});

test("attachment IDs reject another account, message, unknown ID and removed part without downloading bytes", async t => {
  const h = await harness(t);
  const read = await h.ok("email_read") as MessageDetail;
  const attachmentId = read.attachments[1].id;
  for (const args of [{ accountId: "other" }, { messageId: "other-message" }, { attachmentId: "unknown" }, { accountId: "unowned" }]) {
    assert.equal((await h.rpc("attachment_download", { attachmentId, ...args })).isError, true);
  }
  h.state.payload.parts!.splice(1, 1);
  assert.equal((await h.rpc("attachment_download", { attachmentId })).isError, true);
  assert.equal(h.state.downloaded.length, 0);
});

test("Gmail search agrees with read for nested documents, inline-only messages and no attachments", async t => {
  const h = await harness(t);
  for (const payload of [h.state.payload, h.state.payload.parts![0], { mimeType: "text/plain", body: { data: "SGVsbG8", size: 5 } }]) {
    h.state.payload = payload;
    const search = await h.ok("email_search", { accountIds: ["business"], query: "fixture" });
    const read = await h.ok("email_read") as MessageDetail;
    assert.equal(search.errors.length, 0);
    assert.equal(search.results[0].hasAttachments, read.attachments.length > 0);
    assert.equal(read.hasAttachments, read.attachments.length > 0);
    assert.equal(search.results[0].bodyText, undefined);
    assert.equal(search.results[0].attachments, undefined);
  }
  assert.equal(h.state.downloaded.length, 0);
});

test("download checks blocked types and declared and actual sizes", async t => {
  const h = await harness(t);
  const file = h.state.payload.parts![1];
  for (const change of [{ filename: "malware.exe", mimeType: "application/octet-stream" }, { filename: "safe.docx", mimeType: "application/x-msdownload" }]) {
    Object.assign(file, change);
    const read = await h.ok("email_read") as MessageDetail;
    assert.equal((await h.rpc("attachment_download", { attachmentId: read.attachments[1].id })).isError, true);
  }
  Object.assign(file, { filename: "safe.docx", mimeType: docx });
  h.env.MAX_ATTACHMENT_BYTES = "3";
  const read = await h.ok("email_read") as MessageDetail;
  assert.equal((await h.rpc("attachment_download", { attachmentId: read.attachments[1].id })).isError, true);
  assert.equal(h.state.downloaded.length, 0);
  file.body!.size = 2;
  h.state.providerSize = 2;
  assert.equal((await h.rpc("attachment_download", { attachmentId: read.attachments[1].id })).isError, true);
  assert.equal(h.state.downloaded.length, 1);
});

test("Microsoft PDF attachment download retains provider ID and message scoping", async t => {
  const h = await harness(t, "microsoft");
  const list = await h.ok("attachment_list") as { attachments: AttachmentInfo[] };
  const result = await h.ok("attachment_download", { attachmentId: list.attachments[0].id });
  assert.equal(result.id, "graph-file");
  assert.equal(result.filename, "report.pdf");
  assert.deepEqual(Buffer.from(result.contentBase64, "base64"), h.state.bytes);
  assert.ok(h.state.calls.every(url => url.includes("/me/messages/message/attachments")));
});

test("legacy Gmail tokens work only while still present on the selected message", async t => {
  const h = await harness(t);
  h.state.rotateTokens = false;
  assert.equal((await h.ok("attachment_download", { attachmentId: "file-0" })).filename, "submission.docx");
  h.state.rotateTokens = true;
  const stale = await h.rpc("attachment_download", { attachmentId: "file-0" });
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /Read or list.*current ID/);
  assert.equal(h.state.downloaded.length, 1);
});

test("Gmail download reports missing, invalid and failed provider responses", async t => {
  const h = await harness(t);
  const read = await h.ok("email_read") as MessageDetail;
  const args = { attachmentId: read.attachments[1].id };
  h.state.downloadError = 503;
  const failed = await h.rpc("attachment_download", args);
  assert.equal(failed.isError, true);
  assert.match(failed.content[0].text, /503/);
  h.state.downloadError = 0; h.state.invalidData = true;
  assert.match((await h.rpc("attachment_download", args)).content[0].text, /invalid attachment data/);
  h.state.invalidData = false; h.state.missingData = true;
  assert.match((await h.rpc("attachment_download", args)).content[0].text, /did not return attachment data/);
});
