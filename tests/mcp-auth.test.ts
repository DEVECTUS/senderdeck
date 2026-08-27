import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedRedirectUri } from "../worker/mcp-auth";
import { handleMcp } from "../worker/mcp";

test("accepts the hosted Claude callback and loopback callbacks", () => {
  assert.equal(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(isAllowedRedirectUri("http://localhost:3118/callback"), true);
  assert.equal(isAllowedRedirectUri("http://127.0.0.1:4789/callback"), true);
});

test("rejects lookalike or modified Claude callbacks", () => {
  assert.equal(isAllowedRedirectUri("https://evil.claude.ai/api/mcp/auth_callback"), false);
  assert.equal(isAllowedRedirectUri("https://claude.ai/api/mcp/other"), false);
  assert.equal(isAllowedRedirectUri("https://claude.ai:444/api/mcp/auth_callback"), false);
  assert.equal(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback?next=https://evil.example"), false);
  assert.equal(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback#fragment"), false);
});

test("unauthenticated tool calls return both transport and tool-level OAuth challenges", async () => {
  const request = new Request("https://senderdeck.devectus.com.au/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "account_list", arguments: {} },
    }),
  });

  const response = await handleMcp(request, {} as never);
  assert.ok(response);
  assert.equal(response.status, 401);
  const challenge = response.headers.get("www-authenticate");
  assert.match(challenge || "", /resource_metadata="https:\/\/senderdeck\.devectus\.com\.au\/\.well-known\/oauth-protected-resource"/);

  const body = await response.json() as {
    result: { isError: boolean; _meta: { "mcp/www_authenticate": string[] } };
  };
  assert.equal(body.result.isError, true);
  assert.deepEqual(body.result._meta["mcp/www_authenticate"], [challenge]);
});
