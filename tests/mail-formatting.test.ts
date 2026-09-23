import assert from "node:assert/strict";
import test from "node:test";
import { handleMcp } from "../worker/mcp";
import { encrypt } from "../worker/crypto";
import type { Env, StoredAccount } from "../worker/env";
import { buildMime, decodeBase64Url } from "../worker/providers/shared";
import { validateAttachments } from "../worker/attachments";

const html = '<p style="color:#123456">Hello café 👋</p><table><tr><td><b>Sender</b><img src="cid:logo@signature"></td></tr></table>';
const text = "Hello café 👋\nSender";
const logo = { filename: "logo.png", contentType: "image/png", contentBase64: "aW1hZ2U=", contentId: "logo@signature" };

// Decode leaf bodies independently of the MIME encoder.
function leafBodies(mime: string): string[] {
  return [...mime.matchAll(/Content-Transfer-Encoding: base64\r\n(?:[^\r]+\r\n)*\r\n([A-Za-z0-9+/=\r\n]*)(?=--|$)/g)]
    .map((match) => Buffer.from(match[1].replace(/\s/g, ""), "base64").toString("utf8"));
}

test("MIME preserves Unicode HTML signature, fallback, inline image and regular file", () => {
  const mime = buildMime({ from: "sender@example.com", to: ["to@example.com"], subject: "Test", bodyText: text, bodyHtml: html,
    attachments: [logo, { filename: "brief.pdf", contentType: "application/pdf", contentBase64: "cGRm" }] });
  assert.match(mime, /MIME-Version: 1.0\r\nContent-Type: multipart\/mixed/);
  assert.match(mime, /multipart\/alternative/);
  assert.match(mime, /multipart\/related/);
  assert.match(mime, /Content-ID: <logo@signature>/);
  assert.match(mime, /Content-Disposition: inline; filename="logo.png"/);
  assert.match(mime, /Content-Disposition: attachment; filename="brief.pdf"/);
  assert.deepEqual(leafBodies(mime), [text, html, "image", "pdf"]);
});

test("plain text and HTML without attachments remain valid", () => {
  const input = { from: "sender@example.com", to: ["to@example.com"], subject: "Test", bodyText: text };
  const plain = buildMime(input);
  assert.doesNotMatch(plain, /multipart|text\/html/);
  assert.deepEqual(leafBodies(plain), [text]);
  assert.deepEqual(leafBodies(buildMime({ ...input, bodyHtml: html })), [text, html]);
  assert.throws(() => buildMime({ ...input, attachments: [logo] }), /require bodyHtml/);
});

test("inline IDs reject header injection and collisions and obey attachment limits", () => {
  const env = {} as Env;
  assert.throws(() => validateAttachments(env, [{ ...logo, contentId: "bad\r\nBcc: evil" }]), /bare ID/);
  assert.throws(() => validateAttachments(env, [logo, logo]), /unique/);
  assert.throws(() => validateAttachments({ MAX_ATTACHMENT_BYTES: "2" } as Env, [logo]), /limit/);
});

for (const provider of ["google", "microsoft"] as const) {
  for (const reply of [false, true]) {
    for (const rich of [false, true]) {
      test(`${provider} ${reply ? "reply" : "draft"} through MCP with ${rich ? "HTML signature" : "plain text"}`, async (t) => {
        const key = Buffer.alloc(32, 1).toString("base64");
        const account: StoredAccount = { id: "account", user_id: "user@example.com", provider, provider_account_id: "p", email: "sender@example.com", label: "Sender", encrypted_access_token: await encrypt("test-token", key), encrypted_refresh_token: null, token_expires_at: null, scopes: "", created_at: 0, updated_at: 0 };
        const env = { ALLOW_DEV_AUTH: "true", TOKEN_ENCRYPTION_KEY: key, DB: { prepare(query: string) { return { bind() { return this; }, async first() { return query.includes("mcp_oauth_tokens") ? { user_id: account.user_id, resource: "https://example.com/api/mcp", scope: "senderdeck" } : account; } }; } } } as unknown as Env;
        const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
        t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit = {}) => {
          const body = init.body ? JSON.parse(String(init.body)) : {};
          calls.push({ url, body });
          assert.doesNotMatch(url, /\/send$/);
          if (provider === "google") {
            if (url.includes("/messages/original")) return Response.json({ id: "original", threadId: "thread", payload: { headers: [{ name: "From", value: "to@example.com" }, { name: "Subject", value: "Test" }, { name: "Message-ID", value: "<original@example.com>" }] } });
            return Response.json({ id: "draft", message: { id: "message", payload: { headers: [], parts: rich ? [{ filename: "logo.png", mimeType: "image/png", headers: [{ name: "Content-ID", value: "<logo@signature>" }], body: { attachmentId: "image", size: 5 } }] : [] } } });
          }
          if (url.includes("/attachments")) return Response.json({ value: rich ? [{ id: "image", name: "logo.png", size: 5, isInline: true, contentId: "logo@signature" }] : [] });
          // Graph hasAttachments is false for inline-only messages.
          return Response.json({ id: "draft", isDraft: true, hasAttachments: false, subject: "Test" });
        });
        const response = await handleMcp(new Request("https://example.com/api/mcp", { method: "POST", headers: { "authorization": "Bearer test-mcp-token", "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: reply ? "draft_reply" : "draft_create", arguments: { accountId: "account", to: ["to@example.com"], subject: "Test", messageId: reply ? "original" : undefined, bodyText: text, ...(rich ? { bodyHtml: html, attachments: [logo] } : {}) } } }) }), env);
        const result = await response!.json() as { result: { isError?: boolean; content: Array<{ text: string }> } };
        assert.notEqual(result.result.isError, true, JSON.stringify(result));
        const detail = JSON.parse(result.result.content[0].text);
        if (rich) assert.equal(detail.attachments[0].contentId, logo.contentId);
        if (provider === "google") {
          const call = calls.find((call) => call.body.message)!;
          const message = call.body.message as { raw: string; threadId?: string };
          const mime = decodeBase64Url(message.raw);
          assert.deepEqual(leafBodies(mime), rich ? [text, html, "image"] : [text]);
          if (reply) { assert.equal(message.threadId, "thread"); assert.match(mime, /In-Reply-To: <original@example.com>/); }
        } else {
          const creation = calls[0].body;
          if (rich) {
            const message = reply ? creation.message as Record<string, unknown> : creation;
            assert.deepEqual(message.body, { contentType: "HTML", content: html });
            assert.equal(creation.comment, undefined);
            const upload = calls.find((call) => call.body.contentBytes)!;
            assert.equal(upload.body.isInline, true);
            assert.equal(upload.body.contentId, logo.contentId);
          } else if (reply) assert.equal(creation.comment, text);
          else assert.deepEqual(creation.body, { contentType: "Text", content: text });
        }
      });
    }
  }
}

test("MCP advertises HTML and content IDs on both drafting tools", async () => {
  const response = await handleMcp(new Request("https://example.com/api/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), {} as Env);
  const data = await response!.json();
  for (const name of ["draft_create", "draft_reply"]) {
    const tool = data.result.tools.find((item: { name: string }) => item.name === name);
    assert.equal(tool.inputSchema.properties.bodyHtml.type, "string");
    assert.equal(tool.inputSchema.properties.attachments.items.properties.contentId.type, "string");
  }
});
