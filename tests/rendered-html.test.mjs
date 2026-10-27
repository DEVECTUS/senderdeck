import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const baseEnv = {
  DB: { prepare() { return { bind() { return this; }, async first() { return null; } }; } },
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

test("renders the gated social workspace and links the existing email experience", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/conversations", {headers:{accept:"text/html","oai-authenticated-user-email":"owner@example.com"}}), baseEnv, context);
  assert.equal(response.status,200);
  const html = await response.text();
  assert.match(html,/<h1[^>]*>Conversations<\/h1>/); assert.match(html,/Social activation pending/); assert.match(html,/No social account is connected automatically/); assert.match(html,/href="\/settings"/);
  assert.match(html,/placeholder="Your brand name"/); assert.doesNotMatch(html,/name="preset"/);
});
test("social setup reports provider gates and never claims LinkedIn coverage", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/social-setup",{headers:{accept:"text/html"}}),baseEnv,context);
  assert.equal(response.status,200); const html=await response.text();
  assert.match(html,/pages_manage_metadata/); assert.match(html,/pages_manage_engagement/); assert.match(html,/messaging separately restricted/); assert.match(html,/twenty|20 message details/);
  assert.match(html,/Configure your own brands/);
  assert.doesNotMatch(html,/<code>\d{10,}<\/code>/);
});
test("public social readiness contains no secrets and sending defaults off", async () => {
  const worker=await loadWorker();const response=await worker.fetch(new Request("http://localhost/api/social/status"),{...baseEnv,DB:{prepare:()=>({all:async()=>({results:[]})})},META_APP_SECRET:"test-secret"},context);
  const result=await response.json();assert.equal(result.sending,"disabled");assert.equal(result.meta.configured,false);assert.equal(result.linkedin.pageMessaging,"unavailable");assert.doesNotMatch(JSON.stringify(result),/test-secret/);
});

test("customer Meta wizard is protected and contains no credential inputs", async()=>{
  const worker=await loadWorker();const response=await worker.fetch(new Request("http://localhost/connect/meta",{headers:{accept:"text/html","oai-authenticated-user-email":"owner@example.com"}}),baseEnv,context);
  assert.equal(response.status,200);const html=await response.text();assert.match(html,/Choose brand/);assert.match(html,/Sign in to Meta/);assert.match(html,/Choose accounts/);assert.match(html,/Connect Facebook/);assert.doesNotMatch(html,/<input[^>]*type="password"|Hosted maintenance|Discovery evidence|Graph error|Install Page event subscription|Refresh readiness/);
});

test("comment visibility requires sign-in and renders exact single-comment approval controls", async()=>{
  const worker=await loadWorker();
  const anonymous=await worker.fetch(new Request("http://localhost/comments/moderate",{headers:{accept:"text/html"}}),baseEnv,context);
  assert.ok(anonymous.status===302||anonymous.status===307);assert.match(anonymous.headers.get("location")||"",/signin/);
  const response=await worker.fetch(new Request("http://localhost/comments/moderate",{headers:{accept:"text/html","oai-authenticated-user-email":"owner@example.com"}}),baseEnv,context);
  assert.equal(response.status,200);const html=await response.text();
  assert.match(html,/Comment visibility/);assert.match(html,/Comment ID/);assert.match(html,/Restore comment/);assert.match(html,/noindex/);assert.doesNotMatch(html,/access_token|type="password"/);
});
test("operator pages require the hosting allowlist rather than workspace ownership",async()=>{
  const worker=await loadWorker();const request=new Request("http://localhost/operator/social",{headers:{accept:"text/html","oai-authenticated-user-email":"owner@example.com","x-senderdeck-platform-operator":"true"}});
  assert.equal((await worker.fetch(request,baseEnv,context)).status,403);
  const allowed=await worker.fetch(request,{...baseEnv,SOCIAL_OPERATOR_USER_IDS:"owner@example.com"},context);assert.equal(allowed.status,200);assert.equal(allowed.headers.get("cache-control"),"no-store");assert.equal(allowed.headers.get("content-security-policy"),"frame-ancestors 'none'");assert.match(await allowed.text(),/Platform administrators|PLATFORM ADMINISTRATORS/);
});

test("health and MCP initialization report the packaged release version", async () => {
  const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const worker = await loadWorker();
  const health = await worker.fetch(new Request("https://example.com/health"), baseEnv, context);
  assert.equal((await health.json()).version, version);
  const initialized = await worker.fetch(new Request("https://example.com/api/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }) }), baseEnv, context);
  assert.equal((await initialized.json()).result.serverInfo.version, version);
});

test("packages the public Sites MCP server with per-user OAuth", async () => {
  const config = JSON.parse(
    await readFile(new URL("../plugins/senderdeck/.mcp.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(Object.keys(config), ["mcpServers"]);
  assert.equal(config.mcpServers.senderdeck.type, "http");
  assert.equal(
    config.mcpServers.senderdeck.url,
    "https://senderdeck.devectus.com.au/api/mcp",
  );
  assert.equal(config.mcpServers.senderdeck.auth, undefined);
  assert.equal(config.mcpServers.senderdeck.scopes, undefined);
  assert.equal(config.mcpServers.senderdeck.env_http_headers, undefined);
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

test("every sitemap entry renders an indexable page with its own production canonical", async () => {
  const worker = await loadWorker();
  const sitemap = await readFile(new URL("../dist/client/sitemap.xml", import.meta.url), "utf8");
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(urls.map(url => new URL(url).pathname).sort(),
    ["/", "/install", "/privacy", "/security", "/social-setup", "/support", "/terms"]);
  for (const url of urls) {
    const response = await worker.fetch(new Request(`http://localhost${new URL(url).pathname}`, {
      headers: { accept: "text/html", host: "preview.example.com" },
    }), baseEnv, context);
    assert.equal(response.status, 200, url);
    assert.doesNotMatch(response.headers.get("x-robots-tag") ?? "", /noindex/i);
    const html = await response.text();
    assert.ok(html.includes(`<link rel="canonical" href="${url}"`), url);
    assert.match(html, /<meta name="robots" content="index, follow"/);
    assert.doesNotMatch(html, /<meta name="robots" content="[^"]*noindex/);
  }
  const robots = await readFile(new URL("../dist/client/robots.txt", import.meta.url), "utf8");
  assert.match(robots, /Sitemap: https:\/\/senderdeck\.devectus\.com\.au\/sitemap\.xml/);
  assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/m);
});

test("sign-in and authenticated workspace pages are excluded from search indexing", async () => {
  const worker = await loadWorker();
  for (const path of ["/signin", "/accounts", "/settings", "/conversations", "/review-access"]) {
    const response = await worker.fetch(new Request(`http://localhost${path}`, {
      headers: { accept: "text/html", "oai-authenticated-user-email": "owner@example.com" },
    }), baseEnv, context);
    // Sign-in may redirect an already signed-in user; all rendered screens must be noindex.
    if ([302, 303, 307].includes(response.status)) continue;
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.match(html, /<meta name="robots" content="noindex(?:,|\")/, path);
    assert.doesNotMatch(html, /<link rel="canonical"/, path);
  }
});

test("signed-in Overview and Connections lead with a compact account table", async () => {
  const worker = await loadWorker();
  for (const path of ["/", "/accounts"]) {
    const response = await worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html", "oai-authenticated-user-email": "owner@example.com" } }), baseEnv, context);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /aria-label="Connected accounts"/);
    assert.match(html, /Search connected accounts/);
    assert.match(html, /<summary>Add connection<\/summary>/);
    assert.ok(html.indexOf('aria-label="Connected accounts"') < html.indexOf('<summary>Add connection</summary>'));
    assert.doesNotMatch(html, /channel-card|overview-stats|Your next step|CHOOSE YOUR CHANNEL/);
    assert.match(html, /aria-label="Main navigation"/);
    assert.match(html, /href="\/accounts"/);
    assert.match(html, /OpenAI sign-in/);
    const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    assert.ok(html.includes(`v${version}`));
    assert.doesNotMatch(html, /Every inbox|Your final say|Public code\. Human stakes/);
  }
  const anonymous = await worker.fetch(new Request("http://localhost/accounts", { headers: { accept: "text/html" } }), baseEnv, context);
  assert.ok([302, 303, 307].includes(anonymous.status));
  assert.match(anonymous.headers.get("location"), /signin\?return_to=%2Faccounts/);
});

test("a signed-in visitor can deliberately open the provider chooser without merging identities", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/signin/switch", { headers: { accept: "text/html", "oai-authenticated-user-email": "owner@example.com" } }), baseEnv, context);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Only an approved link shares access/);
  assert.match(html, /Continue with Google/);
  assert.match(html, /Continue with OpenAI/);
  assert.match(html, /href="\/auth\/openai\/start\?return_to=%2Faccounts"/);
  assert.match(html, /Continue with OpenAI/);
});

test("offers one vendor-neutral sign-in for Codex and Claude", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/signin?return_to=%2Fsettings", { headers: { accept: "text/html" } }),
    baseEnv,
    context,
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /id="signin-title">Sign in/);
  assert.match(html, /Use username and password/);
  assert.match(html, /Continue with Google/);
  assert.match(html, /Continue with Microsoft/);
  assert.match(html, /src="\/providers\/google.png"/);
  assert.match(html, /src="\/providers\/microsoft.svg"/);
  assert.match(html, /src="\/providers\/openai.svg"/);
  assert.doesNotMatch(html, /Sign in with ChatGPT/);
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

test("renders the protected SenderDeck configuration screen", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/settings", {
      headers: {
        accept: "text/html",
        "oai-authenticated-user-email": "owner@example.com",
      },
    }),
    baseEnv,
    context,
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Email accounts/);
  assert.match(html, /Open installation guide/);
  assert.match(html, /href="\/install"/);
  assert.doesNotMatch(html, /marketplacePath|codex:\/\/plugins/);
  assert.match(html, /Connected email accounts/);
  assert.ok(html.indexOf("Connected email accounts") < html.indexOf("AI client setup"));
  assert.match(html, /owner@example.com/);
});

test("publishes public installation paths for Codex and Claude", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/install", { headers: { accept: "text/html" } }),
    baseEnv,
    context,
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Install SenderDeck for Codex or Claude/);
  assert.match(html, /codex plugin marketplace add DEVECTUS\/senderdeck/);
  assert.match(html, /claude plugin install senderdeck@devectus-senderdeck/);
  assert.match(html, /https:\/\/senderdeck\.devectus\.com\.au\/api\/mcp/);
  assert.doesNotMatch(html, /marketplacePath|C%3A%5CUsers/);
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
  assert.equal(names.length, 40);
  assert.equal(names.filter(name => name.startsWith("social_")).length, 26);
  assert.ok(names.includes("social_comment_inspect"));
  assert.ok(names.includes("social_comment_moderate"));
  assert.ok(names.includes("social_reply_send"));
  assert.ok(names.includes("draft_update"));
  assert.ok(names.includes("email_send"));
  assert.ok(names.includes("attachment_download"));
  assert.ok(names.includes("account_list"));
  assert.ok(names.includes("route_account"));
  for (const tool of listed.result.tools) {
    assert.deepEqual(tool.securitySchemes, [{ type: "oauth2", scopes: ["senderdeck"] }]);
    assert.equal(typeof tool.annotations.readOnlyHint, "boolean");
    assert.equal(typeof tool.annotations.openWorldHint, "boolean");
    assert.equal(typeof tool.annotations.destructiveHint, "boolean");
  }
  const send = listed.result.tools.find((tool) => tool.name === "email_send");
  assert.equal(send.annotations.openWorldHint, true);
  assert.equal(send.annotations.destructiveHint, true);
  const inbox = listed.result.tools.find(tool => tool.name === "social_inbox").inputSchema;
  assert.ok(inbox.properties.cursor);
  assert.equal(inbox.properties.limit.maximum, 20);
  assert.deepEqual(inbox.properties.source.enum, ["feed", "ads", "ad_creatives"]);
  assert.ok(listed.result.tools.find(tool => tool.name === "social_thread_read").inputSchema.properties.cursor);
});

test("publishes OAuth discovery metadata for the MCP client", async () => {
  const worker = await loadWorker();
  const resourceResponse = await worker.fetch(
    new Request("http://localhost/.well-known/oauth-protected-resource"),
    baseEnv,
    context,
  );
  assert.equal(resourceResponse.status, 200);
  const resource = await resourceResponse.json();
  assert.equal(resource.resource, "http://localhost/api/mcp");
  assert.deepEqual(resource.authorization_servers, ["http://localhost"]);
  assert.deepEqual(resource.scopes_supported, ["senderdeck"]);

  const authorizationResponse = await worker.fetch(
    new Request("http://localhost/.well-known/oauth-authorization-server"),
    baseEnv,
    context,
  );
  assert.equal(authorizationResponse.status, 200);
  const authorization = await authorizationResponse.json();
  assert.equal(authorization.issuer, "http://localhost");
  assert.equal(authorization.authorization_endpoint, "http://localhost/oauth/authorize");
  assert.equal(authorization.token_endpoint, "http://localhost/oauth/token");
  assert.equal(authorization.registration_endpoint, "http://localhost/oauth/register");
  assert.ok(authorization.code_challenge_methods_supported.includes("S256"));
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
  assert.equal(response.status, 401);
  assert.match(response.headers.get("www-authenticate") ?? "", /oauth-protected-resource/);
  const result = await response.json();
  assert.equal(result.result.isError, true);
  assert.match(result.result.content[0].text, /Connect SenderDeck/);
  assert.match(
    result.result._meta["mcp/www_authenticate"][0],
    /oauth-protected-resource.*invalid_token.*Connect SenderDeck/,
  );
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

test("WhatsApp connection renders separate phone-app and existing Cloud API choices without credential inputs",async()=>{
  const worker=await loadWorker();const response=await worker.fetch(new Request("http://localhost/connect/meta?provider=whatsapp",{headers:{accept:"text/html","oai-authenticated-user-email":"owner@example.com"}}),baseEnv,context);
  assert.equal(response.status,200);const html=await response.text();assert.match(html,/Connect your business number/);assert.match(html,/Keep the existing WhatsApp Business phone app/);assert.match(html,/Number already registered with Cloud API/);assert.doesNotMatch(html,/<input[^>]*type="password"|client_secret|access_token/);
});


test("optional channel setup is a collapsed compact table with icons and individual links", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/accounts", {headers: {accept:"text/html", "oai-authenticated-user-email":"owner@example.com"}}), baseEnv, context);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<details class="connection-add"><summary>Add connection<\/summary>/);
  const options = html.match(/<table class="connections-table connection-options"[\s\S]*?<\/table>/)?.[0];
  assert.ok(options);
  for (const provider of ["facebook", "instagram", "whatsapp"]) {
    assert.ok(options.includes(`src="/providers/${provider}.svg"`));
    assert.ok(options.includes(`href="/connect/meta?provider=${provider}"`));
  }
  assert.doesNotMatch(html, /channel-card|Meta checks eligibility|Keep your Business phone app/);
  const icon = await readFile(new URL("../dist/client/providers/whatsapp.svg", import.meta.url), "utf8");
  assert.match(icon, /<svg/);
});

test("Meta setup keeps channel navigation, provider-specific headings and existing WhatsApp choices", async () => {
  const worker = await loadWorker();
  for (const [provider, heading] of [["facebook","Connect Facebook"],["instagram","Connect Instagram"],["whatsapp","Connect your business number"]]) {
    const path = `/connect/meta?provider=${provider}&brand=example-brand`;
    const response = await worker.fetch(new Request(`http://localhost${path}`, {headers: {accept:"text/html", "oai-authenticated-user-email":"owner@example.com"}}), baseEnv, context);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(`<h1>${heading}</h1>`));
    assert.match(html, /aria-label="Meta channel setup"/);
    for (const channel of ["facebook","instagram","whatsapp"]) assert.ok(html.includes(`href="/connect/meta?provider=${channel}&amp;brand=example-brand"`));
    assert.match(html, new RegExp(`provider=${provider}[^>]*aria-current="page"`));
    if (provider === "whatsapp") {
      assert.match(html, /Keep the existing WhatsApp Business phone app/);
      assert.match(html, /Number already registered with Cloud API/);
      assert.match(html, /src="\/providers\/whatsapp.svg"/);
    }
    const anonymous = await worker.fetch(new Request(`http://localhost${path}`, {headers:{accept:"text/html"}}), baseEnv, context);
    assert.ok([302,303,307].includes(anonymous.status));
    const destination = new URL(anonymous.headers.get("location"), "http://localhost").searchParams.get("return_to");
    const query = new URL(destination, "http://localhost").searchParams;
    assert.equal(query.get("provider"), provider);
    assert.equal(query.get("brand"), "example-brand");
  }
});

test("WhatsApp setup explains provider refusal without offering migration as recovery", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/connect/meta?provider=whatsapp", { headers: { accept: "text/html", "oai-authenticated-user-email": "owner@example.com" } }), baseEnv, context);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Connect your business number/);
  assert.match(html, /can’t onboard customers right now/);
  assert.match(html, /does not establish that your phone number is ineligible/);
  assert.match(html, /not a workaround|not the Business phone app|Regular WhatsApp is a different app/);
  assert.match(html, /href="\/social-setup#whatsapp"/);
  assert.doesNotMatch(html, /<input[^>]*type="password"/);
});
