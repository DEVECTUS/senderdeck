import { HttpError, requireUserId } from "./auth";
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
import type { AttachmentInput, DraftDetail, DraftInput } from "./mail-types";
import {
  createGoogleDraft,
  createGoogleReplyDraft,
  downloadGoogleAttachment,
  getGoogleDraft,
  listGoogleAttachments,
  readGoogle,
  searchGoogle,
  sendGoogleDraft,
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
} from "./providers/microsoft";

const PROTOCOL_VERSION = "2025-03-26";

type JsonRpcId = string | number | null;
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
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
  },
  {
    name: "account_list",
    description: "List the current user's connected email accounts and sender identities.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
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
  },
  {
    name: "email_search",
    description:
      "Search email on demand across selected connected accounts. No mailbox content is indexed or retained.",
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
  },
  {
    name: "draft_create",
    description:
      "Create a provider-hosted email draft. This does not send. Optional attachment bytes are passed directly to the provider.",
    inputSchema: draftInputSchema(false),
  },
  {
    name: "draft_reply",
    description:
      "Create a provider-hosted reply draft for a message. This does not send.",
    inputSchema: draftInputSchema(true),
  },
  {
    name: "draft_inspect",
    description:
      "Re-read a provider-hosted draft and return the exact sender, recipients, subject, and attachments that must be confirmed before sending.",
    inputSchema: {
      type: "object",
      properties: { accountId: { type: "string" }, draftId: { type: "string" } },
      required: ["accountId", "draftId"],
      additionalProperties: false,
    },
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
          required: ["sender", "to", "cc", "bcc", "subject", "attachments"],
          additionalProperties: false,
        },
      },
      required: ["accountId", "draftId", "confirmed", "confirmation"],
      additionalProperties: false,
    },
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
  },
] as const;

export async function handleMcp(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/mcp") return null;
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
        serverInfo: { name: "multi-account-email", version: "0.1.0" },
        instructions:
          "Use account IDs explicitly. Drafts never send automatically. Before email_send, show the user and confirm sender, all recipients, subject, and attachments.",
      });
    }
    if (rpc.method === "ping") return rpcResult(rpc.id, {});
    if (rpc.method === "tools/list") return rpcResult(rpc.id, { tools });
    if (rpc.method === "tools/call") {
      const userId = requireUserId(request, env);
      const name = stringValue(rpc.params?.name, "tool name");
      const args = objectValue(rpc.params?.arguments ?? {}, "arguments");
      const data = await callTool(name, args, request, env, userId);
      return rpcResult(rpc.id, toolResult(data));
    }
    return rpcError(rpc.id, -32601, "Method not found");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected tool error.";
    return rpcResult(rpc.id, {
      content: [{ type: "text", text: message }],
      isError: true,
    });
  }
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
      attachments: attachmentInputs(args.attachments),
    };
    return account.provider === "google"
      ? createGoogleReplyDraft(env, account, messageId, input)
      : createMicrosoftReplyDraft(env, account, messageId, input);
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
    bodyText: { type: "string" },
    attachments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          filename: { type: "string" },
          contentType: { type: "string" },
          contentBase64: { type: "string", description: "Base64 bytes; passed directly to the provider." },
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
