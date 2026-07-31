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
  inReplyTo?: string;
  references?: string;
  attachments?: Array<{ filename: string; contentType: string; contentBase64: string }>;
}): string {
  const boundary = `=_multi_account_email_${crypto.randomUUID()}`;
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
  if (!attachments.length) {
    return `${headers.join("\r\n")}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${input.bodyText}`;
  }
  const parts = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.bodyText,
  ];
  for (const attachment of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${escapeHeader(attachment.contentType)}; name="${escapeHeader(attachment.filename)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${escapeHeader(attachment.filename)}"`,
      "",
      attachment.contentBase64.replace(/\s/g, "").match(/.{1,76}/g)?.join("\r\n") ?? "",
    );
  }
  parts.push(`--${boundary}--`, "");
  return parts.join("\r\n");
}
