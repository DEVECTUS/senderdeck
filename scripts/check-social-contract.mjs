// Public, read-only metadata check. No credentials or mailbox/social content.
const origin = "https://senderdeck.devectus.com.au";
const health = await fetch(`${origin}/health`, { redirect: "error", signal: AbortSignal.timeout(10000) });
if (!health.ok) throw new Error(`Health returned HTTP ${health.status}`);
const { version } = await health.json();
const response = await fetch(`${origin}/api/mcp`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
  headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
if (!response.ok) throw new Error(`tools/list returned HTTP ${response.status}`);
const data = await response.json();
const tools = data.result?.tools;
if (!Array.isArray(tools)) throw new Error("The endpoint did not return tools/list.");
const expected = { social_inbox: ["brandId", "accountId", "kind", "cursor", "limit", "source"], social_thread_read: ["brandId", "accountId", "threadId", "cursor"] };
const advertised = {};
for (const [name, required] of Object.entries(expected)) {
  const schema = tools.find(tool => tool.name === name)?.inputSchema;
  const fields = Object.keys(schema?.properties || {});
  if (required.some(key => !fields.includes(key))) throw new Error(`${name} is missing current fields: ${required.filter(key => !fields.includes(key)).join(", ")}`);
  advertised[name] = fields;
}
console.log(JSON.stringify({ version, advertised, refresh: "If the connected client advertises fewer fields, reload its MCP connection or restart the client, then verify again. This public check does not refresh client state or validate authenticated calls." }, null, 2));
