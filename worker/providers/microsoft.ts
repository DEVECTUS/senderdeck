import { sha256Base64Url } from "../crypto";
import { HttpError } from "../auth";
import { getAccessToken } from "../accounts";
import { validateAttachments, validateDownloadedAttachment } from "../attachments";
import type { Env, StoredAccount } from "../env";
import type {
  AttachmentInfo,
  DraftDetail,
  DraftInput,
  DraftUpdateInput,
  MessageDetail,
  MessageSummary,
} from "../mail-types";
import { providerJson, assertDraftRevision } from "./shared";

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
  contentId?: string;
  contentBytes?: string;
  "@odata.type"?: string;
}

interface GraphMessage {
  changeKey?: string;
  "@odata.etag"?: string;
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
  const attachments = await listMicrosoftAttachments(env, account, messageId);
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
  if (input.attachments?.some((attachment) => attachment.contentId) && input.bodyHtml === undefined) {
    throw new HttpError(400, "Inline attachments require bodyHtml.");
  }
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
          ...(attachment.contentId ? { isInline: true, contentId: attachment.contentId } : {}),
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
  if (input.attachments?.some((attachment) => attachment.contentId) && input.bodyHtml === undefined) {
    throw new HttpError(400, "Inline attachments require bodyHtml.");
  }
  const token = await getAccessToken(env, account);
  const draft = await providerJson<GraphMessage>(
    `${GRAPH}/messages/${encodeURIComponent(messageId)}/createReply`,
    token,
    {
      method: "POST",
      body: JSON.stringify(input.bodyHtml !== undefined
        ? { message: { body: { contentType: "HTML", content: input.bodyHtml } } }
        : { comment: input.bodyText }),
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
          ...(attachment.contentId ? { isInline: true, contentId: attachment.contentId } : {}),
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
    `${GRAPH}/messages/${encodeURIComponent(draftId)}?$select=id,subject,from,toRecipients,ccRecipients,bccRecipients,isDraft,hasAttachments,body,conversationId,changeKey`,
    token,
  );
  if (!message.isDraft) throw new HttpError(409, "The selected Microsoft message is not a draft.");
  const attachments = await listMicrosoftAttachments(env, account, draftId);
  const latest = await providerJson<GraphMessage>(`${GRAPH}/messages/${encodeURIComponent(draftId)}?$select=id,isDraft,changeKey`, token);
  if (!latest.isDraft || latest.changeKey !== message.changeKey) throw new HttpError(409, "The draft changed during inspection. Inspect it again.");
  return {
    accountId: account.id,
    provider: "microsoft",
    draftId: message.id,
    sender: message.from?.emailAddress.address || account.email,
    to: recipients(message.toRecipients),
    cc: recipients(message.ccRecipients),
    bcc: recipients(message.bccRecipients),
    subject: message.subject || "",
    attachments,
    bodyText: message.body?.contentType.toLowerCase() === "html" ? stripHtml(message.body.content) : message.body?.content || "",
    bodyHtml: message.body?.contentType.toLowerCase() === "html" ? message.body.content : undefined,
    bodyFormat: message.body?.contentType.toLowerCase() === "html" ? "html" : "text",
    threadId: message.conversationId,
    messageId: message.id,
    providerEtag: message["@odata.etag"],
    revision: await sha256Base64Url(JSON.stringify({ accountId: account.id, message, attachments })),
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
  const attachments: GraphAttachment[] = [];
  let next: string | undefined = `${GRAPH}/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline,contentId`;
  while (next) {
    // Follow only provider-owned pagination links; never forward credentials elsewhere.
    if (!next.startsWith(`${GRAPH}/`)) throw new HttpError(502, "Unexpected attachment pagination URL.");
    const data: { value: GraphAttachment[]; "@odata.nextLink"?: string } = await providerJson(next, token);
    attachments.push(...data.value);
    next = data["@odata.nextLink"];
  }
  return attachments.map((attachment) => ({
    id: attachment.id,
    filename: attachment.name,
    contentType: attachment.contentType || "application/octet-stream",
    size: attachment.size,
    isInline: attachment.isInline,
    contentId: attachment.contentId,
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
    isInline: attachment.isInline,
    contentId: attachment.contentId,
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
    body: input.bodyHtml !== undefined
      ? { contentType: "HTML", content: input.bodyHtml }
      : { contentType: "Text", content: input.bodyText },
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

export async function updateMicrosoftDraft(
  env: Env, account: StoredAccount, draftId: string, input: DraftUpdateInput,
): Promise<DraftDetail> {
  const current = await getMicrosoftDraft(env, account, draftId);
  assertDraftRevision(current.revision, input.expectedRevision);
  validateAttachments(env, input.attachments);
  const patch: Record<string, unknown> = {};
  if (input.subject !== undefined) patch.subject = input.subject;
  for (const field of ["to", "cc", "bcc"] as const) {
    if (input[field] !== undefined) patch[`${field}Recipients`] = graphRecipients(input[field]);
  }
  // Graph stores one body, not independent MIME alternatives. Never silently
  // destroy an existing HTML signature on a text-only wording edit.
  if (input.bodyText !== undefined && current.bodyHtml !== undefined && input.bodyHtml !== "") {
    throw new HttpError(400, "Outlook stores one body. Edit bodyHtml to preserve formatting, or provide bodyHtml: \"\" with bodyText to explicitly switch to plain text.");
  }
  if (input.bodyText !== undefined && input.bodyHtml !== undefined && input.bodyHtml !== "") {
    throw new HttpError(400, "Outlook stores one body. Update bodyHtml or bodyText, not two independent alternatives.");
  }
  if (input.bodyHtml !== undefined) patch.body = { contentType: "HTML", content: input.bodyHtml };
  if (input.bodyText !== undefined) patch.body = { contentType: "Text", content: input.bodyText };
  const html = input.bodyText !== undefined ? undefined : input.bodyHtml ?? current.bodyHtml;
  if (input.attachments?.some((item) => item.contentId) && html === undefined) throw new HttpError(400, "Inline attachments require an HTML body.");
  // The simple Graph attachment endpoint only accepts files smaller than 3 MB.
  for (const item of input.attachments ?? []) {
    if (atob(item.contentBase64.replace(/\s/g, "")).length >= 3 * 1024 * 1024) {
      throw new HttpError(413, "Outlook draft updates support replacement files smaller than 3 MB each; upload sessions are not implemented.");
    }
  }
  const token = await getAccessToken(env, account);
  const url = `${GRAPH}/messages/${encodeURIComponent(draftId)}`;
  let revision = current.revision;
  let mutated = false;
  async function check(): Promise<DraftDetail> {
    const saved = await getMicrosoftDraft(env, account, draftId);
    assertDraftRevision(saved.revision, revision);
    return saved;
  }
  try {
    if (Object.keys(patch).length) {
      const saved = await check();
      await providerJson(url, token, { method: "PATCH", headers: saved.providerEtag ? { "If-Match": saved.providerEtag } : {}, body: JSON.stringify(patch) });
      mutated = true;
      revision = (await getMicrosoftDraft(env, account, draftId)).revision;
    }
    if (input.attachments !== undefined) {
      // Upload replacements first so a failed upload does not remove originals.
      // This is not a provider transaction; errors must require reinspection.
      for (const item of input.attachments) {
        await check();
        await providerJson(`${url}/attachments`, token, { method: "POST", body: JSON.stringify({
          "@odata.type": "#microsoft.graph.fileAttachment", name: item.filename,
          contentType: item.contentType, contentBytes: item.contentBase64.replace(/\s/g, ""),
          ...(item.contentId ? { isInline: true, contentId: item.contentId } : {}),
        }) });
        mutated = true;
        revision = (await getMicrosoftDraft(env, account, draftId)).revision;
      }
      for (const item of current.attachments) {
        await check();
        await providerJson(`${url}/attachments/${encodeURIComponent(item.id)}`, token, { method: "DELETE" });
        mutated = true;
        revision = (await getMicrosoftDraft(env, account, draftId)).revision;
      }
    }
    return await getMicrosoftDraft(env, account, draftId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Provider request failed.";
    throw new HttpError(error instanceof HttpError ? error.status : 502,
      `Draft update failed${mutated ? " after partial changes" : "; provider outcome may need verification"}. Inspect draft ${draftId} before retrying or requesting new send approval. ${detail}`);
  }
}
