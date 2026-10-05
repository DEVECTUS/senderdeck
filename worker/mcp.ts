import { HttpError } from "./auth";
import { McpAuthenticationError, requireMcpUserId } from "./mcp-auth";
import {
  disconnectAccount,
  getAccount,
  listAccounts,
  resolveAccounts,
  routeAccount,
  updateAccountLabel,
} from "./accounts";
import { attachmentLimits } from "./attachments";
import type { Env, Provider, StoredAccount } from "./env";
import type { AttachmentInput, DraftDetail, DraftInput, DraftUpdateInput } from "./mail-types";
import {
  createGoogleDraft,
  createGoogleReplyDraft,
  downloadGoogleAttachment,
  getGoogleDraft,
  listGoogleAttachments,
  readGoogle,
  searchGoogle,
  sendGoogleDraft,
  updateGoogleDraft,
} from "./providers/google";
import {
  createMicrosoftDraft,
  createMicrosoftReplyDraft,
  downloadMicrosoftAttachment,
  getMicrosoftDraft,
  listMicrosoftAttachments,
  readMicrosoft,
  searchMicrosoft,
  sendMicrosoftDraft,
  updateMicrosoftDraft,
} from "./providers/microsoft";

const PROTOCOL_VERSION = "2025-03-26";
const MCP_PATHS = new Set(["/api/mcp", "/mcp"]);

type JsonRpcId = string | number | null;
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

interface SearchResult {
  results: unknown[];
  errors: Array<{ accountId: string; error: string }>;
  successfulAccountIds: string[];
}

const tools = [
  {
    name: "account_connect",
    description:
      "Start a user-driven OAuth connection for a Google/Gmail or Microsoft/Outlook account. Returns a URL the user must open.",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", enum: ["google", "microsoft"] },
        label: { type: "string", description: "A short user-facing label such as Work or Personal." },
      },
      required: ["provider", "label"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity(),
    annotations: toolAnnotations("Connect an email account", true, false, false),
  },
  {
    name: "account_list",
    description: "List the current user's connected email accounts and sender identities.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    securitySchemes: oauthSecurity(),
    annotations: toolAnnotations("List connected accounts", true, false, false),
  },
  {
    name: "account_label",
    description: "Change the local routing label for a connected account.",
    inputSchema: {
      type: "object",
      properties: { accountId: { type: "string" }, label: { type: "string" } },
      required: ["accountId", "label"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity(),
    annotations: toolAnnotations("Rename an account", false, false, false),
  },
  {
    name: "account_disconnect",
    description:
      "Disconnect an account and delete its encrypted tokens. Requires explicit confirmation.",
    inputSchema: {
      type: "object",
      properties: { accountId: { type: "string" }, confirmed: { type: "boolean" } },
      required: ["accountId", "confirmed"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity(),
    annotations: toolAnnotations("Disconnect an account", false, false, true),
  },
  {
    name: "route_account",
    description:
      "Resolve a sender/account hint such as a label or email to one unambiguous account. Never guesses when multiple accounts match.",
    inputSchema: {
      type: "object",
      properties: {
        hint: { type: "string" },
        provider: { type: "string", enum: ["google", "microsoft"] },
      },
      required: ["hint"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity(),
    annotations: toolAnnotations("Choose a sender account", true, false, false),
  },
  {
    name: "email_search",
    description:
      "Search email on demand across selected connected accounts. Report per-account errors; failed searches do not mean there are no matching messages. No mailbox content is indexed or retained.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Provider-supported email search terms." },
        accountIds: { type: "array", items: { type: "string" } },
        maxResultsPerAccount: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity(),
    annotations: toolAnnotations("Search email", true, true, false),
  },
  {
    name: "email_read",
    description: "Read one message from one explicitly selected account on demand.",
    inputSchema: {
      type: "object",
      properties: { accountId: { type: "string" }, messageId: { type: "string" } },
      required: ["accountId", "messageId"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity(),
    annotations: toolAnnotations("Read an email", true, true, false),
  },
  {
    name: "draft_create",
    description:
      "Create a provider-hosted email draft. This does not send. Optional attachment bytes are passed directly to the provider.",
    inputSchema: draftInputSchema(false),
    securitySchemes: oauthSecurity(),
    annotations: toolAnnotations("Create an email draft", false, true, false),
  },
  {
    name: "draft_reply",
    description:
      "Create a provider-hosted reply draft for a message. This does not send.",
    inputSchema: draftInputSchema(true),
    securitySchemes: oauthSecurity(),
    annotations: toolAnnotations("Create a reply draft", false, true, false),
  },
  {
    name: "draft_update",
    description: "Edit an existing draft in place; never sends or creates another draft. Inspect first and pass expectedRevision. Omitted fields are preserved; empty strings/arrays clear requested values. attachments replaces ALL files, including inline images. Outlook has one body: use bodyHtml for HTML drafts, or bodyHtml: empty string plus bodyText to explicitly switch to text.",
    inputSchema: draftUpdateSchema(),
    securitySchemes: oauthSecurity(),
    annotations: toolAnnotations("Update an email draft", false, true, true),
  },
  {
    name: "draft_inspect",
    description:
      "Re-read saved body, formatting, thread metadata, sender, recipients, subject, attachments and revision. Inspect immediately before reviewing edits or requesting fresh send confirmation.",
    inputSchema: {
      type: "object",
      properties: { accountId: { type: "string" }, draftId: { type: "string" } },
      required: ["accountId", "draftId"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity(),
    annotations: toolAnnotations("Inspect an email draft", true, true, false),
  },
  {
    name: "email_send",
    description:
      "Send an existing provider-hosted draft only after explicit confirmation of the exact sender, recipients, subject, and attachment list.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string" },
        draftId: { type: "string" },
        confirmed: { type: "boolean", const: true },
        confirmation: {
          type: "object",
          properties: {
            revision: { type: "string", description: "Copy revision from the immediately preceding draft_inspect. Any edit invalidates earlier approval." },
            sender: { type: "string" },
            to: { type: "array", items: { type: "string" } },
            cc: { type: "array", items: { type: "string" } },
            bcc: { type: "array", items: { type: "string" } },
            subject: { type: "string" },
            attachments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  filename: { type: "string" },
                  size: { type: "integer", minimum: 0 },
                },
                required: ["filename", "size"],
                additionalProperties: false,
              },
            },
          },
          required: ["revision", "sender", "to", "cc", "bcc", "subject", "attachments"],
          additionalProperties: false,
        },
      },
      required: ["accountId", "draftId", "confirmed", "confirmation"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity(),
    annotations: toolAnnotations("Send a confirmed email", false, true, true),
  },
  {
    name: "attachment_list",
    description: "List attachment metadata for one message without downloading bytes.",
    inputSchema: {
      type: "object",
      properties: { accountId: { type: "string" }, messageId: { type: "string" } },
      required: ["accountId", "messageId"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity(),
    annotations: toolAnnotations("List email attachments", true, true, false),
  },
  {
    name: "attachment_download",
    description:
      "Download one attachment on demand as base64 after configured size and security checks. The service does not retain it.",
    inputSchema: {
      type: "object",
      properties: {
        accountId: { type: "string" },
        messageId: { type: "string" },
        attachmentId: { type: "string" },
      },
      required: ["accountId", "messageId", "attachmentId"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity(),
    annotations: toolAnnotations("Download an email attachment", true, true, false),
  },
] as const;

export async function handleMcp(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  // Sites reserves /mcp at its edge. /api/mcp reaches this worker in production;
  // retain /mcp for local clients and backwards-compatible development tests.
  if (!MCP_PATHS.has(url.pathname)) return null;
  if (request.method === "GET") {
    return new Response("This stateless MCP endpoint accepts POST requests.", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  let rpc: JsonRpcRequest;
  try {
    const parsed = await request.json();
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return rpcError(null, -32600, "Invalid Request");
    }
    rpc = parsed as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }
  if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
    return rpcError(rpc.id ?? null, -32600, "Invalid Request");
  }

  if (rpc.id === undefined) {
    return new Response(null, { status: 202 });
  }

  try {
    if (rpc.method === "initialize") {
      return rpcResult(rpc.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "senderdeck", version: "0.3.3" },
        instructions:
          "List connected accounts and use their actual account and message/draft IDs. Never invent labels or IDs or infer a sender. Ask the user to select a connected sender if the requested account is absent or ambiguous. Report provider failures and reconnection instructions; do not treat a failed search as no matches. Never harvest recipients or perform bulk, automatic or scheduled sending. Drafts never send automatically. Before email_send, inspect the current draft and show sender, To, Cc, Bcc, subject, attachment filenames/sizes and whether it will send now. Wait for a separate explicit send confirmation of these unchanged details; any edit invalidates previous approval.",
      });
    }
    if (rpc.method === "ping") return rpcResult(rpc.id, {});
    if (rpc.method === "tools/list") return rpcResult(rpc.id, { tools });
    if (rpc.method === "tools/call") {
      const userId = await requireMcpUserId(request, env);
      const name = stringValue(rpc.params?.name, "tool name");
      const args = objectValue(rpc.params?.arguments ?? {}, "arguments");
      const data = await callTool(name, args, request, env, userId);
      const search = name === "email_search" ? data as SearchResult : null;
      const allSearchesFailed = Boolean(search && search.errors.length > 0 && search.successfulAccountIds.length === 0);
      return rpcResult(rpc.id, { ...toolResult(data), ...(allSearchesFailed ? { isError: true } : {}) });
    }
    return rpcError(rpc.id, -32601, "Method not found");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected tool error.";
    if (error instanceof McpAuthenticationError) {
      return Response.json({
        jsonrpc: "2.0",
        id: rpc.id,
        result: {
          content: [{ type: "text", text: message }],
          isError: true,
          _meta: { "mcp/www_authenticate": [error.challenge] },
        },
      }, {
        status: 401,
        headers: {
          ...mcpHeaders(),
          "www-authenticate": error.challenge,
        },
      });
    }
    return rpcResult(rpc.id, {
      content: [{ type: "text", text: message }],
      isError: true,
    });
  }
}

function oauthSecurity(): readonly Record<string, unknown>[] {
  return [{ type: "oauth2", scopes: ["senderdeck"] }];
}

function toolAnnotations(
  title: string,
  readOnlyHint: boolean,
  openWorldHint: boolean,
  destructiveHint: boolean,
): Record<string, unknown> {
  return { title, readOnlyHint, openWorldHint, destructiveHint };
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  request: Request,
  env: Env,
  userId: string,
): Promise<unknown> {
  if (name === "account_connect") {
    const provider = providerValue(args.provider);
    const label = stringValue(args.label, "label");
    const url = new URL(`/oauth/${provider}/start`, request.url);
    url.searchParams.set("label", label);
    return { provider, label, authorizationUrl: url.toString(), action: "Open this URL to authorize the account." };
  }
  if (name === "account_list") return { accounts: await listAccounts(env, userId), limit: 10 };
  if (name === "account_label") {
    return updateAccountLabel(
      env,
      userId,
      stringValue(args.accountId, "accountId"),
      stringValue(args.label, "label"),
    );
  }
  if (name === "account_disconnect") {
    if (args.confirmed !== true) throw new HttpError(400, "Explicit disconnect confirmation is required.");
    const accountId = stringValue(args.accountId, "accountId");
    await disconnectAccount(env, userId, accountId);
    return { disconnected: true, accountId };
  }
  if (name === "route_account") {
    return routeAccount(
      env,
      userId,
      stringValue(args.hint, "hint"),
      args.provider === undefined ? undefined : providerValue(args.provider),
    );
  }
  if (name === "email_search") {
    const accounts = await resolveAccounts(env, userId, optionalStringArray(args.accountIds));
    const query = stringValue(args.query, "query");
    const max = optionalInteger(args.maxResultsPerAccount, 10, 1, 50);
    const settled = await Promise.allSettled(
      accounts.map((account) =>
        account.provider === "google"
          ? searchGoogle(env, account, query, max)
          : searchMicrosoft(env, account, query, max),
      ),
    );
    return {
      results: settled.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
      successfulAccountIds: settled.flatMap((result, index) => result.status === "fulfilled" ? [accounts[index].id] : []),
      errors: settled.flatMap((result, index) =>
        result.status === "rejected"
          ? [{ accountId: accounts[index].id, error: errorMessage(result.reason) }]
          : [],
      ),
    };
  }
  if (name === "email_read") {
    const account = await selectedAccount(env, userId, args);
    const messageId = stringValue(args.messageId, "messageId");
    return account.provider === "google"
      ? readGoogle(env, account, messageId)
      : readMicrosoft(env, account, messageId);
  }
  if (name === "draft_create") {
    const account = await selectedAccount(env, userId, args);
    const input = draftInput(args);
    return account.provider === "google"
      ? createGoogleDraft(env, account, input)
      : createMicrosoftDraft(env, account, input);
  }
  if (name === "draft_reply") {
    const account = await selectedAccount(env, userId, args);
    const messageId = stringValue(args.messageId, "messageId");
    const input = {
      to: optionalStringArray(args.to),
      cc: optionalStringArray(args.cc),
      bcc: optionalStringArray(args.bcc),
      subject: optionalString(args.subject),
      bodyText: stringValue(args.bodyText, "bodyText"),
      bodyHtml: optionalString(args.bodyHtml),
      attachments: attachmentInputs(args.attachments),
    };
    return account.provider === "google"
      ? createGoogleReplyDraft(env, account, messageId, input)
      : createMicrosoftReplyDraft(env, account, messageId, input);
  }
  if (name === "draft_update") {
    const account = await selectedAccount(env, userId, args);
    const draftId = stringValue(args.draftId, "draftId");
    const allowed = ["accountId", "draftId", "expectedRevision", "subject", "to", "cc", "bcc", "bodyText", "bodyHtml", "attachments"];
    if (Object.keys(args).some((key) => !allowed.includes(key))) throw new HttpError(400, "Unknown draft update field.");
    const input: DraftUpdateInput = { expectedRevision: stringValue(args.expectedRevision, "expectedRevision") };
    for (const key of ["subject", "bodyText", "bodyHtml"] as const) {
      if (args[key] !== undefined) input[key] = stringValue(args[key], key, true);
    }
    for (const key of ["to", "cc", "bcc"] as const) {
      if (args[key] !== undefined) input[key] = stringArray(args[key], key);
    }
    if (args.attachments !== undefined) input.attachments = attachmentInputs(args.attachments);
    if (Object.keys(input).length === 1) throw new HttpError(400, "Specify at least one field to update.");
    return account.provider === "google"
      ? updateGoogleDraft(env, account, draftId, input)
      : updateMicrosoftDraft(env, account, draftId, input);
  }
  if (name === "draft_inspect") {
    const account = await selectedAccount(env, userId, args);
    return inspectDraft(env, account, stringValue(args.draftId, "draftId"));
  }
  if (name === "email_send") {
    if (args.confirmed !== true) throw new HttpError(400, "Explicit send confirmation is required.");
    const account = await selectedAccount(env, userId, args);
    const draftId = stringValue(args.draftId, "draftId");
    const draft = await inspectDraft(env, account, draftId);
    assertConfirmation(draft, objectValue(args.confirmation, "confirmation"));
    const sent =
      account.provider === "google"
        ? await sendGoogleDraft(env, account, draftId)
        : await sendMicrosoftDraft(env, account, draftId);
    return { sent: true, accountId: account.id, sender: account.email, ...sent };
  }
  if (name === "attachment_list") {
    const account = await selectedAccount(env, userId, args);
    const messageId = stringValue(args.messageId, "messageId");
    const attachments =
      account.provider === "google"
        ? await listGoogleAttachments(env, account, messageId)
        : await listMicrosoftAttachments(env, account, messageId);
    return { accountId: account.id, messageId, attachments, limits: attachmentLimits(env) };
  }
  if (name === "attachment_download") {
    const account = await selectedAccount(env, userId, args);
    const messageId = stringValue(args.messageId, "messageId");
    const attachmentId = stringValue(args.attachmentId, "attachmentId");
    return account.provider === "google"
      ? downloadGoogleAttachment(env, account, messageId, attachmentId)
      : downloadMicrosoftAttachment(env, account, messageId, attachmentId);
  }
  throw new HttpError(404, `Unknown tool: ${name}.`);
}

async function selectedAccount(
  env: Env,
  userId: string,
  args: Record<string, unknown>,
): Promise<StoredAccount> {
  return getAccount(env, userId, stringValue(args.accountId, "accountId"));
}

async function inspectDraft(
  env: Env,
  account: StoredAccount,
  draftId: string,
): Promise<DraftDetail> {
  return account.provider === "google"
    ? getGoogleDraft(env, account, draftId)
    : getMicrosoftDraft(env, account, draftId);
}

function assertConfirmation(draft: DraftDetail, confirmation: Record<string, unknown>): void {
  const actual = {
    revision: draft.revision,
    sender: normalizeEmail(draft.sender),
    to: normalizedRecipients(draft.to),
    cc: normalizedRecipients(draft.cc),
    bcc: normalizedRecipients(draft.bcc),
    subject: draft.subject,
    attachments: draft.attachments
      .map((item) => `${item.filename}\u0000${item.size}`)
      .sort(),
  };
  const confirmed = {
    revision: stringValue(confirmation.revision, "confirmation.revision"),
    sender: normalizeEmail(stringValue(confirmation.sender, "confirmation.sender")),
    to: normalizedRecipients(stringArray(confirmation.to, "confirmation.to")),
    cc: normalizedRecipients(stringArray(confirmation.cc, "confirmation.cc")),
    bcc: normalizedRecipients(stringArray(confirmation.bcc, "confirmation.bcc")),
    subject: stringValue(confirmation.subject, "confirmation.subject", true),
    attachments: arrayValue(confirmation.attachments, "confirmation.attachments")
      .map((item, index) => {
        const value = objectValue(item, `confirmation.attachments[${index}]`);
        return `${stringValue(value.filename, "filename")}\u0000${integerValue(value.size, "size")}`;
      })
      .sort(),
  };
  if (JSON.stringify(actual) !== JSON.stringify(confirmed)) {
    throw new HttpError(
      409,
      "Send confirmation does not exactly match the current draft. Inspect the draft and ask the user to confirm again.",
    );
  }
}

function draftInput(args: Record<string, unknown>): DraftInput {
  return {
    to: stringArray(args.to, "to"),
    cc: optionalStringArray(args.cc),
    bcc: optionalStringArray(args.bcc),
    subject: stringValue(args.subject, "subject", true),
    bodyText: stringValue(args.bodyText, "bodyText", true),
    bodyHtml: optionalString(args.bodyHtml),
    attachments: attachmentInputs(args.attachments),
  };
}

function attachmentInputs(value: unknown): AttachmentInput[] {
  return optionalArray(value).map((item, index) => {
    const attachment = objectValue(item, `attachments[${index}]`);
    return {
      filename: stringValue(attachment.filename, "filename"),
      contentType: stringValue(attachment.contentType, "contentType"),
      contentBase64: stringValue(attachment.contentBase64, "contentBase64"),
      contentId: optionalString(attachment.contentId),
    };
  });
}

function draftInputSchema(reply: boolean): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    accountId: { type: "string" },
    to: { type: "array", items: { type: "string" } },
    cc: { type: "array", items: { type: "string" } },
    bcc: { type: "array", items: { type: "string" } },
    subject: { type: "string" },
    bodyText: { type: "string", description: "Plain-text body or fallback matching bodyHtml, including signature text." },
    bodyHtml: { type: "string", description: "Optional complete HTML body with formatting and sender signature. Prefer for rich email. Signatures are not automatically inserted. Use cid: references for embedded images." },
    attachments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          filename: { type: "string" },
          contentType: { type: "string" },
          contentBase64: { type: "string", description: "Base64 bytes; passed directly to the provider." },
          contentId: { type: "string", description: "For inline images: unique bare content ID, e.g. logo@signature, referenced as src=\"cid:logo@signature\" in bodyHtml. Omit for regular attachments." },
        },
        required: ["filename", "contentType", "contentBase64"],
        additionalProperties: false,
      },
    },
  };
  if (reply) properties.messageId = { type: "string" };
  return {
    type: "object",
    properties,
    required: reply
      ? ["accountId", "messageId", "bodyText"]
      : ["accountId", "to", "subject", "bodyText"],
    additionalProperties: false,
  };
}

function draftUpdateSchema(): Record<string, unknown> {
  const base = draftInputSchema(false);
  return {
    ...base,
    properties: {
      ...(base.properties as Record<string, unknown>),
      bodyText: { type: "string", description: "Selective plain-text update. Gmail preserves omitted HTML. Outlook HTML drafts require bodyHtml edits, or bodyHtml: empty string plus bodyText to explicitly switch to text." },
      bodyHtml: { type: "string", description: "Selective HTML update including signature. Empty string clears HTML content; omission preserves it. Outlook stores only one body format." },
      attachments: { ...((base.properties as Record<string, Record<string, unknown>>).attachments), description: "Replaces ALL saved attachments, including inline images. Omit to preserve them; [] removes all." },
      draftId: { type: "string" },
      expectedRevision: { type: "string", description: "Revision returned by draft_inspect; stale updates fail." },
    },
    required: ["accountId", "draftId", "expectedRevision"],
  };
}

function rpcResult(id: JsonRpcId, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result }, { headers: mcpHeaders() });
}

function rpcError(id: JsonRpcId, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { headers: mcpHeaders() });
}

function mcpHeaders(): HeadersInit {
  return { "content-type": "application/json", "cache-control": "no-store" };
}

function toolResult(data: unknown): Record<string, unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: { result: data },
  };
}

function providerValue(value: unknown): Provider {
  if (value !== "google" && value !== "microsoft") throw new HttpError(400, "provider must be google or microsoft.");
  return value;
}

function objectValue(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, `${name} must be an object.`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, name: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new HttpError(400, `${name} must be a string.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : stringValue(value, "value", true);
}

function arrayValue(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new HttpError(400, `${name} must be an array.`);
  return value;
}

function optionalArray(value: unknown): unknown[] {
  return value === undefined ? [] : arrayValue(value, "value");
}

function stringArray(value: unknown, name: string): string[] {
  return arrayValue(value, name).map((item, index) => stringValue(item, `${name}[${index}]`));
}

function optionalStringArray(value: unknown): string[] | undefined {
  return value === undefined ? undefined : stringArray(value, "value");
}

function integerValue(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new HttpError(400, `${name} must be a non-negative integer.`);
  return value as number;
}

function optionalInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  const parsed = integerValue(value, "integer");
  if (parsed < min || parsed > max) throw new HttpError(400, `integer must be between ${min} and ${max}.`);
  return parsed;
}

function normalizedRecipients(values: string[]): string[] {
  return values.map(normalizeEmail).sort();
}

function normalizeEmail(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown provider error.";
}
