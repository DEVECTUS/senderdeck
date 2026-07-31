import { HttpError } from "./auth";
import type { Env } from "./env";
import type { AttachmentInput } from "./mail-types";

const DEFAULT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const DEFAULT_BLOCKED_EXTENSIONS = [
  ".ade", ".adp", ".app", ".bat", ".chm", ".cmd", ".com", ".cpl", ".exe",
  ".hta", ".ins", ".isp", ".jar", ".js", ".jse", ".lib", ".lnk", ".mde",
  ".msc", ".msp", ".mst", ".pif", ".ps1", ".scr", ".sct", ".shb", ".sys",
  ".vb", ".vbe", ".vbs", ".vxd", ".wsc", ".wsf", ".wsh",
];
const DEFAULT_BLOCKED_MIME_TYPES = ["application/x-msdownload", "application/x-dosexec"];

export function attachmentLimits(env: Env): {
  maxAttachmentBytes: number;
  maxTotalBytes: number;
  blockedExtensions: string[];
  blockedMimeTypes: string[];
} {
  return {
    maxAttachmentBytes: positiveInt(env.MAX_ATTACHMENT_BYTES, DEFAULT_MAX_ATTACHMENT_BYTES),
    maxTotalBytes: positiveInt(env.MAX_TOTAL_ATTACHMENT_BYTES, DEFAULT_MAX_TOTAL_BYTES),
    blockedExtensions: parseList(env.BLOCKED_ATTACHMENT_EXTENSIONS, DEFAULT_BLOCKED_EXTENSIONS),
    blockedMimeTypes: parseList(env.BLOCKED_ATTACHMENT_MIME_TYPES, DEFAULT_BLOCKED_MIME_TYPES),
  };
}

export function validateAttachments(env: Env, attachments: AttachmentInput[] = []): void {
  const limits = attachmentLimits(env);
  let total = 0;
  for (const attachment of attachments) {
    const filename = attachment.filename.trim();
    const contentType = attachment.contentType.trim().toLowerCase();
    if (!filename || filename.length > 255) {
      throw new HttpError(400, "Attachment filename must be between 1 and 255 characters.");
    }
    if (limits.blockedExtensions.some((extension) => filename.toLowerCase().endsWith(extension))) {
      throw new HttpError(400, `Attachment type is blocked: ${filename}.`);
    }
    if (limits.blockedMimeTypes.includes(contentType)) {
      throw new HttpError(400, `Attachment MIME type is blocked: ${contentType}.`);
    }
    const size = base64DecodedSize(attachment.contentBase64);
    if (size > limits.maxAttachmentBytes) {
      throw new HttpError(
        413,
        `${filename} exceeds the ${limits.maxAttachmentBytes}-byte attachment limit.`,
      );
    }
    total += size;
  }
  if (total > limits.maxTotalBytes) {
    throw new HttpError(413, `Attachments exceed the ${limits.maxTotalBytes}-byte total limit.`);
  }
}

export function validateDownloadedAttachment(
  env: Env,
  filename: string,
  contentType: string,
  size: number,
): void {
  const limits = attachmentLimits(env);
  if (size > limits.maxAttachmentBytes) {
    throw new HttpError(413, `${filename} exceeds the configured download limit.`);
  }
  if (limits.blockedExtensions.some((extension) => filename.toLowerCase().endsWith(extension))) {
    throw new HttpError(400, `Attachment type is blocked: ${filename}.`);
  }
  if (limits.blockedMimeTypes.includes(contentType.toLowerCase())) {
    throw new HttpError(400, `Attachment MIME type is blocked: ${contentType}.`);
  }
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  return value
    ? value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)
    : fallback;
}

function base64DecodedSize(value: string): number {
  const clean = value.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new HttpError(400, "Invalid base64 attachment content.");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}
