import { getAccessToken } from "../accounts";
import { validateAttachments, validateDownloadedAttachment } from "../attachments";
import type { Env, StoredAccount } from "../env";
import type {
  AttachmentInfo,
  DraftDetail,
  DraftInput,
  MessageDetail,
  MessageSummary,
} from "../mail-types";
import { providerJson } from "./shared";

const GRAPH = "https://graph.microsoft.com/v1.0/me";

interface GraphRecipient {
  emailAddress: { address: string; name?: string };
}

interface GraphAttachment {
  id: string;
  name: string;
  contentType?: string;
  size: number;
  isInline?: boolean;
  contentBytes?: string;
  "@odata.type"?: string;
}

interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
  receivedDateTime?: string;
  hasAttachments?: boolean;
  isDraft?: boolean;
}

export async function searchMicrosoft(
  env: Env,
  account: StoredAccount,
  query: string,
  maxResults: number,
): Promise<MessageSummary[]> {
  const token = await getAccessToken(env, account);
  const params = new URLSearchParams({
    "$search": `"${query.replaceAll('"', '\\"')}"`,
    "$top": String(Math.min(Math.max(maxResults, 1), 50)),
    "$select":
      "id,conversationId,subject,from,toRecipients,receivedDateTime,bodyPreview,hasAttachments",
  });
  const data = await providerJson<{ value: GraphMessage[] }>(
    `${GRAPH}/messages?${params}`,
    token,
    { headers: { ConsistencyLevel: "eventual" } },
  );
  return data.value.map((message) => summary(account, message));
}

export async function readMicrosoft(
  env: Env,
  account: StoredAccount,
  messageId: string,
): Promise<MessageDetail> {
  const token = await getAccessToken(env, account);
  const message = await providerJson<GraphMessage>(
    `${GRAPH}/messages/${encodeURIComponent(messageId)}?$select=id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,body,bodyPreview,hasAttachments`,
    token,
  );
  const attachments = message.hasAttachments
    ? await listMicrosoftAttachments(env, account, messageId)
    : [];
  return {
    ...summary(account, message),
    cc: recipients(message.ccRecipients),
    bodyText:
      message.body?.contentType.toLowerCase() === "html"
        ? stripHtml(message.body.content)
        : message.body?.content || "",
    bodyHtml:
      message.body?.contentType.toLowerCase() === "html" ? message.body.content : undefined,
    attachments,
  };
}

export async function createMicrosoftDraft(
  env: Env,
  account: StoredAccount,
  input: DraftInput,
): Promise<DraftDetail> {
  validateAttachments(env, input.attachments);
  const token = await getAccessToken(env, account);
  const draft = await providerJson<GraphMessage>(`${GRAPH}/messages`, token, {
    method: "POST",
    body: JSON.stringify(messagePayload(input)),
  });
  if (input.attachments?.length) {
    for (const attachment of input.attachments) {
      await providerJson(`${GRAPH}/messages/${encodeURIComponent(draft.id)}/attachments`, token, {
        method: "POST",
        body: JSON.stringify({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: attachment.filename,
          contentType: attachment.contentType,
          contentBytes: attachment.contentBase64.replace(/\s/g, ""),
        }),
      });
    }
  }
  return getMicrosoftDraft(env, account, draft.id);
}

export async function createMicrosoftReplyDraft(
  env: Env,
  account: StoredAccount,
  messageId: string,
  input: Omit<DraftInput, "subject" | "to"> & { to?: string[]; subject?: string },
): Promise<DraftDetail> {
  validateAttachments(env, input.attachments);
  const token = await getAccessToken(env, account);
  const draft = await providerJson<GraphMessage>(
    `${GRAPH}/messages/${encodeURIComponent(messageId)}/createReply`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ comment: input.bodyText }),
    },
  );
  const patch: Record<string, unknown> = {};
  if (input.to?.length) patch.toRecipients = graphRecipients(input.to);
  if (input.cc) patch.ccRecipients = graphRecipients(input.cc);
  if (input.bcc) patch.bccRecipients = graphRecipients(input.bcc);
  if (input.subject) patch.subject = input.subject;
  if (Object.keys(patch).length) {
    await providerJson(`${GRAPH}/messages/${encodeURIComponent(draft.id)}`, token, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }
  if (input.attachments?.length) {
    for (const attachment of input.attachments) {
      await providerJson(`${GRAPH}/messages/${encodeURIComponent(draft.id)}/attachments`, token, {
        method: "POST",
        body: JSON.stringify({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: attachment.filename,
          contentType: attachment.contentType,
          contentBytes: attachment.contentBase64.replace(/\s/g, ""),
        }),
      });
    }
  }
  return getMicrosoftDraft(env, account, draft.id);
}

export async function getMicrosoftDraft(
  env: Env,
  account: StoredAccount,
  draftId: string,
): Promise<DraftDetail> {
  const token = await getAccessToken(env, account);
  const message = await providerJson<GraphMessage>(
    `${GRAPH}/messages/${encodeURIComponent(draftId)}?$select=id,subject,toRecipients,ccRecipients,bccRecipients,isDraft,hasAttachments`,
    token,
  );
  if (!message.isDraft) throw new Error("The selected Microsoft message is not a draft.");
  return {
    accountId: account.id,
    provider: "microsoft",
    draftId: message.id,
    sender: account.email,
    to: recipients(message.toRecipients),
    cc: recipients(message.ccRecipients),
    bcc: recipients(message.bccRecipients),
    subject: message.subject || "",
    attachments: message.hasAttachments
      ? await listMicrosoftAttachments(env, account, draftId)
      : [],
  };
}

export async function sendMicrosoftDraft(
  env: Env,
  account: StoredAccount,
  draftId: string,
): Promise<{ messageId: string }> {
  const token = await getAccessToken(env, account);
  await providerJson<void>(
    `${GRAPH}/messages/${encodeURIComponent(draftId)}/send`,
    token,
    { method: "POST" },
  );
  return { messageId: draftId };
}

export async function listMicrosoftAttachments(
  env: Env,
  account: StoredAccount,
  messageId: string,
): Promise<AttachmentInfo[]> {
  const token = await getAccessToken(env, account);
  const data = await providerJson<{ value: GraphAttachment[] }>(
    `${GRAPH}/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`,
    token,
  );
  return data.value
    .filter((attachment) => !attachment.isInline)
    .map((attachment) => ({
      id: attachment.id,
      filename: attachment.name,
      contentType: attachment.contentType || "application/octet-stream",
      size: attachment.size,
    }));
}

export async function downloadMicrosoftAttachment(
  env: Env,
  account: StoredAccount,
  messageId: string,
  attachmentId: string,
): Promise<AttachmentInfo & { contentBase64: string }> {
  const token = await getAccessToken(env, account);
  const attachment = await providerJson<GraphAttachment>(
    `${GRAPH}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    token,
  );
  if (attachment["@odata.type"] && attachment["@odata.type"] !== "#microsoft.graph.fileAttachment") {
    throw new Error("Only file attachments can be downloaded in v1.");
  }
  if (!attachment.contentBytes) throw new Error("Attachment content was unavailable.");
  const info = {
    id: attachment.id,
    filename: attachment.name,
    contentType: attachment.contentType || "application/octet-stream",
    size: attachment.size,
  };
  validateDownloadedAttachment(env, info.filename, info.contentType, info.size);
  return { ...info, contentBase64: attachment.contentBytes };
}

function summary(account: StoredAccount, message: GraphMessage): MessageSummary {
  return {
    accountId: account.id,
    provider: "microsoft",
    messageId: message.id,
    threadId: message.conversationId,
    subject: message.subject || "(no subject)",
    from: message.from?.emailAddress.address || "",
    to: recipients(message.toRecipients),
    receivedAt: message.receivedDateTime,
    snippet: message.bodyPreview || "",
    hasAttachments: Boolean(message.hasAttachments),
  };
}

function messagePayload(input: DraftInput): Record<string, unknown> {
  return {
    subject: input.subject,
    body: { contentType: "Text", content: input.bodyText },
    toRecipients: graphRecipients(input.to),
    ccRecipients: graphRecipients(input.cc),
    bccRecipients: graphRecipients(input.bcc),
  };
}

function graphRecipients(values: string[] = []): GraphRecipient[] {
  return values.map((address) => ({ emailAddress: { address } }));
}

function recipients(values: GraphRecipient[] = []): string[] {
  return values.map((recipient) => recipient.emailAddress.address);
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
