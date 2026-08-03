import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const baseEnv = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

test("packages the private Sites MCP server with environment-backed authentication", async () => {
  const config = JSON.parse(
    await readFile(new URL("../senderdeck/.mcp.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(Object.keys(config), ["mcpServers"]);
  assert.equal(config.mcpServers.senderdeck.type, "http");
  assert.equal(
    config.mcpServers.senderdeck.url,
    "https://multi-account-email-devectus.barsham.chatgpt.site/api/mcp",
  );
  assert.deepEqual(config.mcpServers.senderdeck.env_http_headers, {
    "OAI-Sites-Authorization": "SENDERDECK_SITES_AUTHORIZATION",
    "x-dev-user-email": "SENDERDECK_USER_EMAIL",
  });
});

test("renders the SenderDeck product page", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    baseEnv,
    context,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>SenderDeck by DEVECTUS<\/title>/i);
  assert.match(html, /Every inbox/);
  assert.match(html, /Nothing sends until/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("publishes the legal, security, and support pages required for provider review", async () => {
  const worker = await loadWorker();
  const expected = [
    ["/privacy", /Privacy by design/],
    ["/terms", /Clear rules for deliberate email/],
    ["/security", /Small attack surface/],
    ["/support", /Help with SenderDeck/],
  ];

  for (const [path, pattern] of expected) {
    const response = await worker.fetch(
      new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
      baseEnv,
      context,
    );
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), pattern, path);
  }
});

test("exposes a healthy stateless MCP contract", async () => {
  const worker = await loadWorker();
  const health = await worker.fetch(
    new Request("http://localhost/health"),
    baseEnv,
    context,
  );
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");

  const initialize = await worker.fetch(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      }),
    }),
    baseEnv,
    context,
  );
  const initialized = await initialize.json();
  assert.equal(initialized.result.protocolVersion, "2025-03-26");
  assert.equal(initialized.result.serverInfo.name, "senderdeck");

  const list = await worker.fetch(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    }),
    baseEnv,
    context,
  );
  const listed = await list.json();
  const names = listed.result.tools.map((tool) => tool.name);
  assert.equal(names.length, 13);
  assert.ok(names.includes("email_send"));
  assert.ok(names.includes("attachment_download"));
  assert.ok(names.includes("account_list"));
  assert.ok(names.includes("route_account"));
});

test("requires authenticated identity for account tools", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "account_list", arguments: {} },
      }),
    }),
    baseEnv,
    context,
  );
  const result = await response.json();
  assert.equal(result.result.isError, true);
  assert.match(result.result.content[0].text, /Authentication required/);
});

test("requires authenticated identity for the account management API", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/accounts"),
    baseEnv,
    context,
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match((await response.json()).error, /Authentication required/);
});
