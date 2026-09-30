import { HttpError } from "../auth";
import { sha256Base64Url } from "../crypto";
import { updateRawMime } from "./mime-update";
import type { Env, StoredAccount } from "../env";
import type {
  AttachmentInfo,
  DraftDetail,
  DraftInput,
  DraftUpdateInput,
  MessageDetail,
  MessageSummary,
} from "../mail-types";
import { getAccessToken } from "../accounts";
import { validateAttachments, validateDownloadedAttachment } from "../attachments";
import { buildMime, encodeBase64Url, providerJson, assertDraftRevision } from "./shared";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  threadId?: string;
  snippet?: string;
  raw?: string;
  internalDate?: string;
  payload?: GmailPart;
}

interface GmailDraft {
  id: string;
  message: GmailMessage;
}

export async function searchGoogle(
  env: Env,
  account: StoredAccount,
  query: string,
  maxResults: number,
): Promise<MessageSummary[]> {
  const token = await getAccessToken(env, account);
  const params = new URLSearchParams({
    q: query,
    maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
  });
  const list = await providerJson<{ messages?: Array<{ id: string }> }>(
    `${GMAIL}/messages?${params}`,
    token,
  );
  return Promise.all(
    (list.messages ?? []).map(async ({ id }) => {
      const message = await providerJson<GmailMessage>(
        `${GMAIL}/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        token,
      );
      return summary(account, message);
    }),
  );
}

export async function readGoogle(
  env: Env,
  account: StoredAccount,
  messageId: string,
): Promise<MessageDetail> {
  const token = await getAccessToken(env, account);
  const message = await providerJson<GmailMessage>(
    `${GMAIL}/messages/${encodeURIComponent(messageId)}?format=full`,
    token,
  );
  return detail(account, message);
}

export async function createGoogleDraft(
  env: Env,
  account: StoredAccount,
  input: DraftInput,
): Promise<DraftDetail> {
  validateAttachments(env, input.attachments);
  const token = await getAccessToken(env, account);
  const raw = encodeBase64Url(
    buildMime({
      from: account.email,
      ...input,
    }),
  );
  const draft = await providerJson<GmailDraft>(`${GMAIL}/drafts`, token, {
    method: "POST",
    body: JSON.stringify({ message: { raw } }),
  });
  return getGoogleDraft(env, account, draft.id);
}

export async function createGoogleReplyDraft(
  env: Env,
  account: StoredAccount,
  messageId: string,
  input: Omit<DraftInput, "subject" | "to"> & { to?: string[]; subject?: string },
): Promise<DraftDetail> {
  validateAttachments(env, input.attachments);
  const token = await getAccessToken(env, account);
  const original = await providerJson<GmailMessage>(
    `${GMAIL}/messages/${encodeURIComponent(messageId)}?format=full`,
    token,
  );
  const headers = headerMap(original.payload);
  const subject = input.subject || replySubject(headers.subject || "");
  const to = input.to?.length ? input.to : [headers["reply-to"] || headers.from].filter(Boolean);
  const messageIdHeader = headers["message-id"];
  const references = [headers.references, messageIdHeader].filter(Boolean).join(" ");
  const raw = encodeBase64Url(
    buildMime({
      from: account.email,
      to,
      cc: input.cc,
      bcc: input.bcc,
      subject,
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml,
      attachments: input.attachments,
      inReplyTo: messageIdHeader,
      references,
    }),
  );
  const draft = await providerJson<GmailDraft>(`${GMAIL}/drafts`, token, {
    method: "POST",
    body: JSON.stringify({ message: { raw, threadId: original.threadId } }),
  });
  return getGoogleDraft(env, account, draft.id);
}

export async function getGoogleDraft(
  env: Env,
  account: StoredAccount,
  draftId: string,
): Promise<DraftDetail> {
  const token = await getAccessToken(env, account);
  const draft = await providerJson<GmailDraft>(
    `${GMAIL}/drafts/${encodeURIComponent(draftId)}?format=full`,
    token,
  );
  const headers = headerMap(draft.message.payload);
  // Gmail can return large body parts via attachmentId instead of inline data.
  for (const part of bodyParts(draft.message.payload)) {
    if (!part.filename && ["text/plain", "text/html"].includes(part.mimeType || "") && part.body?.attachmentId && !part.body.data) {
      const body = await providerJson<{ data: string }>(`${GMAIL}/messages/${encodeURIComponent(draft.message.id)}/attachments/${encodeURIComponent(part.body.attachmentId)}`, token);
      part.body.data = body.data;
    }
  }
  const bodies = extractBodies(draft.message.payload);
  return {
    accountId: account.id,
    provider: "google",
    draftId: draft.id,
    sender: headers.from?.match(/<([^>]+)>/)?.[1] || headers.from || account.email,
    to: splitAddresses(headers.to),
    cc: splitAddresses(headers.cc),
    bcc: splitAddresses(headers.bcc),
    subject: headers.subject || "",
    attachments: attachmentInfos(draft.message.payload),
    bodyText: bodies.text ?? "",
    bodyHtml: bodies.html,
    bodyFormat: bodies.html !== undefined ? (bodies.text !== undefined ? "alternative" : "html") : "text",
    threadId: draft.message.threadId,
    messageId: draft.message.id,
    revision: await sha256Base64Url(JSON.stringify({ accountId: account.id, draft })),
  };
}

export async function sendGoogleDraft(
  env: Env,
  account: StoredAccount,
  draftId: string,
): Promise<{ messageId: string; threadId?: string }> {
  const token = await getAccessToken(env, account);
  const sent = await providerJson<GmailMessage>(`${GMAIL}/drafts/send`, token, {
    method: "POST",
    body: JSON.stringify({ id: draftId }),
  });
  return { messageId: sent.id, threadId: sent.threadId };
}

export async function listGoogleAttachments(
  env: Env,
  account: StoredAccount,
  messageId: string,
): Promise<AttachmentInfo[]> {
  return (await readGoogle(env, account, messageId)).attachments;
}

export async function downloadGoogleAttachment(
  env: Env,
  account: StoredAccount,
  messageId: string,
  attachmentId: string,
): Promise<AttachmentInfo & { contentBase64: string }> {
  const token = await getAccessToken(env, account);
  const message = await providerJson<GmailMessage>(
    `${GMAIL}/messages/${encodeURIComponent(messageId)}?format=full`,
    token,
  );
  const info = attachmentInfos(message.payload).find((item) => item.id === attachmentId);
  if (!info) throw new Error("Attachment was not found on the selected message.");
  validateDownloadedAttachment(env, info.filename, info.contentType, info.size);
  const embeddedPart = attachmentId.startsWith("part:")
    ? flattenParts(message.payload).find((part, index) => `part:${part.partId ?? index}` === attachmentId)
    : undefined;
  const payload = embeddedPart?.body?.data !== undefined
    ? { data: embeddedPart.body.data, size: embeddedPart.body.size ?? info.size }
    : await providerJson<{ data: string; size: number }>(
      `${GMAIL}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, token,
    );
  const contentBase64 = payload.data.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(payload.data.length / 4) * 4,
    "=",
  );
  return { ...info, size: payload.size, contentBase64 };
}

function summary(account: StoredAccount, message: GmailMessage): MessageSummary {
  const headers = headerMap(message.payload);
  return {
    accountId: account.id,
    provider: "google",
    messageId: message.id,
    threadId: message.threadId,
    subject: headers.subject || "(no subject)",
    from: headers.from || "",
    to: splitAddresses(headers.to),
    receivedAt: headers.date || (message.internalDate ? new Date(Number(message.internalDate)).toISOString() : undefined),
    snippet: message.snippet || "",
    hasAttachments: attachmentInfos(message.payload).length > 0,
  };
}

function detail(account: StoredAccount, message: GmailMessage): MessageDetail {
  const base = summary(account, message);
  const bodies = extractBodies(message.payload);
  return {
    ...base,
    cc: splitAddresses(headerMap(message.payload).cc),
    bodyText: bodies.text || stripHtml(bodies.html || ""),
    bodyHtml: bodies.html || undefined,
    attachments: attachmentInfos(message.payload),
  };
}

function headerMap(payload?: GmailPart): Record<string, string> {
  return Object.fromEntries(
    (payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]),
  );
}

function flattenParts(payload?: GmailPart): GmailPart[] {
  if (!payload) return [];
  return [payload, ...(payload.parts ?? []).flatMap(flattenParts)];
}

function attachmentInfos(payload?: GmailPart): AttachmentInfo[] {
  return flattenParts(payload)
    .flatMap((part, index) => {
      const headers = headerMap(part);
      if (!(part.filename || (headers["content-id"] && !["text/plain", "text/html"].includes(part.mimeType || "")) || /^attachment\b/i.test(headers["content-disposition"] || "")) ||
          (!part.body?.attachmentId && part.body?.data === undefined)) return [];
      return [{
        id: part.body?.attachmentId || `part:${part.partId ?? index}`,
        filename: part.filename || "inline-image",
        contentType: part.mimeType || "application/octet-stream",
        size: part.body?.size ?? 0,
        contentId: headers["content-id"]?.replace(/^<|>$/g, ""),
        isInline: /^inline\b/i.test(headers["content-disposition"] || "") || Boolean(headers["content-id"]),
      }];
    });
}

function bodyParts(payload?: GmailPart): GmailPart[] {
  if (!payload || payload.filename || payload.mimeType === "message/rfc822" || /^attachment\b/i.test(headerMap(payload)["content-disposition"] || "")) return [];
  if (payload.mimeType?.startsWith("multipart/" ) || payload.parts) return (payload.parts ?? []).flatMap(bodyParts);
  return [payload];
}

function extractBodies(payload?: GmailPart): { text?: string; html?: string } {
  const result: { text?: string; html?: string } = {};
  for (const part of bodyParts(payload)) {
    if (part.body?.data === undefined) continue;
    if (!["text/plain", "text/html"].includes(part.mimeType || "")) continue;
    const charset = /charset\s*=\s*"?([^";\s]+)/i.exec(headerMap(part)["content-type"] || "")?.[1] || "utf-8";
    const binary = atob(part.body.data.replaceAll("-", "+").replaceAll("_", "/"));
    const value = new TextDecoder(charset).decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
    if (part.mimeType === "text/plain" && result.text === undefined) result.text = value;
    if (part.mimeType === "text/html" && result.html === undefined) result.html = value;
  }
  return result;
}

function splitAddresses(value = ""): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function replySubject(subject: string): string {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function updateGoogleDraft(
  env: Env, account: StoredAccount, draftId: string, input: DraftUpdateInput,
): Promise<DraftDetail> {
  const current = await getGoogleDraft(env, account, draftId);
  assertDraftRevision(current.revision, input.expectedRevision);
  validateAttachments(env, input.attachments);
  if (input.attachments?.some((item) => item.contentId) && input.bodyHtml === undefined && current.bodyHtml === undefined) {
    throw new HttpError(400, "Inline attachments require an HTML body.");
  }
  const token = await getAccessToken(env, account);
  const draft = await providerJson<GmailDraft>(`${GMAIL}/drafts/${encodeURIComponent(draftId)}?format=raw`, token);
  if (draft.message.id !== current.messageId) throw new HttpError(409, "The draft changed while reading it. Inspect it again.");
  if (!draft.message.raw) throw new HttpError(502, "Gmail did not return the raw draft; no changes were made.");
  const raw = updateRawMime(draft.message.raw, input);
  // Gmail does not expose an atomic revision precondition for drafts.update.
  // Recheck immediately before PUT, while retaining the same provider draft ID.
  assertDraftRevision((await getGoogleDraft(env, account, draftId)).revision, input.expectedRevision);
  await providerJson(`${GMAIL}/drafts/${encodeURIComponent(draftId)}`, token, {
    method: "PUT",
    body: JSON.stringify({ id: draftId, message: { raw, threadId: current.threadId } }),
  });
  return getGoogleDraft(env, account, draftId);
}
