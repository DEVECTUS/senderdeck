import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticatedUser,
  SESSION_COOKIE,
  withAuthenticatedUserHeaders,
} from "../worker/auth";
import type { Env } from "../worker/env";
import { safeReturnPath } from "../worker/identity-auth";
import { handleMcpAuthentication } from "../worker/mcp-auth";

test("accepts only same-origin relative post-login destinations", () => {
  assert.equal(safeReturnPath("/settings?tab=accounts"), "/settings?tab=accounts");
  assert.equal(safeReturnPath("https://evil.example/steal"), "/");
  assert.equal(safeReturnPath("//evil.example/steal"), "/");
  assert.equal(safeReturnPath("/auth/google/start"), "/");
  assert.equal(safeReturnPath("/signin"), "/");
});

test("resolves an opaque SenderDeck session before platform identity", async () => {
  let boundTokenHash = "";
  const env = {
    DB: {
      prepare() {
        return {
          bind(tokenHash: unknown) {
            boundTokenHash = String(tokenHash);
            return this;
          },
          async first() {
            return { user_id: "usr_senderdeck", email: "person@example.com" };
          },
        };
      },
    },
  } as unknown as Env;
  const request = new Request("https://senderdeck.example/settings", {
    headers: {
      cookie: `${SESSION_COOKIE}=opaque-session-token`,
      "oai-authenticated-user-id": "openai-user",
      "oai-authenticated-user-email": "openai@example.com",
    },
  });

  assert.deepEqual(await authenticatedUser(request, env), {
    userId: "usr_senderdeck",
    email: "person@example.com",
    source: "senderdeck",
  });
  assert.notEqual(boundTokenHash, "opaque-session-token");
});

test("removes spoofed internal identity headers from anonymous requests", async () => {
  const request = new Request("https://senderdeck.example/", {
    headers: {
      "x-senderdeck-user-id": "attacker",
      "x-senderdeck-user-email": "attacker@example.com",
    },
  });
  const sanitized = await withAuthenticatedUserHeaders(request, {} as Env);
  assert.equal(sanitized.headers.get("x-senderdeck-user-id"), null);
  assert.equal(sanitized.headers.get("x-senderdeck-user-email"), null);
});

test("routes unauthenticated MCP authorization through SenderDeck sign-in", async () => {
  const response = await handleMcpAuthentication(
    new Request(
      "https://senderdeck.example/oauth/authorize?client_id=test&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback",
    ),
    {} as Env,
  );
  assert.ok(response);
  assert.equal(response.status, 302);
  const location = response.headers.get("location") || "";
  assert.match(location, /^https:\/\/senderdeck\.example\/signin\?return_to=/);
  assert.doesNotMatch(location, /signin-with-chatgpt/);
});
