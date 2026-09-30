import type { AttachmentInput } from "../mail-types";
import { HttpError } from "../auth";

export async function providerJson<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new HttpError(response.status, `Email provider request failed (${response.status}): ${detail}`);
  }
  if (response.status === 202 || response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeBase64Url(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function normalizeAddresses(values: string[] = []): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

export function escapeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function buildMime(input: {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: AttachmentInput[];
}): string {
  const headers = [
    `From: ${escapeHeader(input.from)}`,
    `To: ${normalizeAddresses(input.to).map(escapeHeader).join(", ")}`,
    input.cc?.length ? `Cc: ${normalizeAddresses(input.cc).map(escapeHeader).join(", ")}` : "",
    input.bcc?.length ? `Bcc: ${normalizeAddresses(input.bcc).map(escapeHeader).join(", ")}` : "",
    `Subject: ${escapeHeader(input.subject)}`,
    input.inReplyTo ? `In-Reply-To: ${escapeHeader(input.inReplyTo)}` : "",
    input.references ? `References: ${escapeHeader(input.references)}` : "",
    "MIME-Version: 1.0",
  ].filter(Boolean);
  const attachments = input.attachments ?? [];
  const inline = attachments.filter((attachment) => attachment.contentId);
  if (inline.length && input.bodyHtml === undefined) {
    throw new HttpError(400, "Inline attachments require bodyHtml.");
  }
  let body = textPart("text/plain", input.bodyText);
  if (input.bodyHtml !== undefined) {
    let html = textPart("text/html", input.bodyHtml);
    if (inline.length) html = multipart("related", [html, ...inline.map(attachmentPart)]);
    body = multipart("alternative", [body, html]);
  }
  const regular = attachments.filter((attachment) => !attachment.contentId);
  if (regular.length) body = multipart("mixed", [body, ...regular.map(attachmentPart)]);
  return `${headers.join("\r\n")}\r\n${body}`;
}

export function textPart(type: string, content: string): string {
  // Base64 preserves Unicode, long HTML lines, and boundary-like content safely.
  const encoded = encodeBase64Url(content).replaceAll("-", "+").replaceAll("_", "/");
  const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  return `Content-Type: ${type}; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrapBase64(padded)}`;
}

export function multipart(type: string, parts: string[]): string {
  const boundary = `=_senderdeck_${crypto.randomUUID()}`;
  return `Content-Type: multipart/${type}; boundary="${boundary}"\r\n\r\n` +
    parts.map((part) => `--${boundary}\r\n${part}\r\n`).join("") + `--${boundary}--\r\n`;
}

export function attachmentPart(attachment: AttachmentInput): string {
  const filename = escapeHeader(attachment.filename).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return [
    `Content-Type: ${escapeHeader(attachment.contentType)}; name="${filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: ${attachment.contentId ? "inline" : "attachment"}; filename="${filename}"`,
    ...(attachment.contentId ? [`Content-ID: <${escapeHeader(attachment.contentId)}>`] : []),
    "",
    wrapBase64(attachment.contentBase64),
  ].join("\r\n");
}

function wrapBase64(value: string): string {
  return value.replace(/\s/g, "").match(/.{1,76}/g)?.join("\r\n") ?? "";
}

export function assertDraftRevision(actual: string, expected: string): void {
  if (actual !== expected) throw new HttpError(409, "The draft changed. Inspect it again before editing or requesting fresh send confirmation.");
}
