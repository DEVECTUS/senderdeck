import type { Env, StoredAccount } from "../env";
import type {
  AttachmentInfo,
  DraftDetail,
  DraftInput,
  MessageDetail,
  MessageSummary,
} from "../mail-types";
import { getAccessToken } from "../accounts";
import { validateAttachments, validateDownloadedAttachment } from "../attachments";
import { buildMime, decodeBase64Url, encodeBase64Url, providerJson } from "./shared";

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
  return {
    accountId: account.id,
    provider: "google",
    draftId: draft.id,
    sender: account.email,
    to: splitAddresses(headers.to),
    cc: splitAddresses(headers.cc),
    bcc: splitAddresses(headers.bcc),
    subject: headers.subject || "",
    attachments: attachmentInfos(draft.message.payload),
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
  const payload = await providerJson<{ data: string; size: number }>(
    `${GMAIL}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    token,
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
    .filter((part) => Boolean(part.filename && part.body?.attachmentId))
    .map((part) => ({
      id: part.body!.attachmentId!,
      filename: part.filename!,
      contentType: part.mimeType || "application/octet-stream",
      size: part.body?.size ?? 0,
    }));
}

function extractBodies(payload?: GmailPart): { text?: string; html?: string } {
  const result: { text?: string; html?: string } = {};
  for (const part of flattenParts(payload)) {
    if (!part.body?.data || part.filename) continue;
    if (part.mimeType === "text/plain" && !result.text) result.text = decodeBase64Url(part.body.data);
    if (part.mimeType === "text/html" && !result.html) result.html = decodeBase64Url(part.body.data);
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
