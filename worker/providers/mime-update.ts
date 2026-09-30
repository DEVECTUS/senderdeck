import { HttpError } from "../auth";
import type { DraftUpdateInput } from "../mail-types";
import { attachmentPart, multipart, textPart, encodeBase64Url } from "./shared";

// A structural MIME editor, not a renderer. Unchanged leaves retain their original
// transfer encoding and bytes. Work in binary strings so non-UTF8 attachments survive.
interface Part {
  headers: string[];
  body: string;
  children?: Part[];
  boundary?: string;
  preamble?: string;
  epilogue?: string;
}

function parse(raw: string, depth = 0): Part {
  if (depth > 30) throw new HttpError(400, "MIME nesting is too deep to edit safely.");
  const separator = /\r?\n\r?\n/.exec(raw);
  if (!separator) throw new HttpError(400, "Malformed MIME draft; no changes were made.");
  const head = raw.slice(0, separator.index);
  const part: Part = { headers: head.split(/\r?\n(?![ \t])/), body: raw.slice(separator.index + separator[0].length) };
  if (type(part).startsWith("multipart/")) {
    const boundary = /(?:^|;)\s*boundary\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;\s]+))/i.exec(header(part, "content-type"));
    part.boundary = boundary?.[1]?.replace(/\\(.)/g, "$1") ?? boundary?.[2];
    if (!part.boundary) throw new HttpError(400, "Multipart draft has no boundary.");
    const escaped = part.boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const markers = [...part.body.matchAll(new RegExp(`^--${escaped}(--)?[ \\t]*(?:\\r?\\n|$)`, "gm"))];
    const closing = markers.findIndex((match) => Boolean(match[1]));
    if (closing < 1 || closing !== markers.length - 1) throw new HttpError(400, "Malformed multipart boundaries; no changes were made.");
    part.preamble = part.body.slice(0, markers[0].index);
    part.epilogue = part.body.slice(markers[closing].index! + markers[closing][0].length);
    part.children = markers.slice(0, closing).map((match, index) => {
      const child = part.body.slice(match.index! + match[0].length, markers[index + 1].index).replace(/\r?\n$/, "");
      return parse(child, depth + 1);
    });
  }
  return part;
}

function header(part: Part, name: string): string {
  return part.headers.find((line) => line.slice(0, line.indexOf(":" )).toLowerCase() === name)?.split(":").slice(1).join(":").replace(/\r?\n[ \t]+/g, " ").trim() ?? "";
}
function type(part: Part): string { return (header(part, "content-type") || "text/plain").split(";")[0].trim().toLowerCase(); }
function setHeader(part: Part, name: string, value?: string): void {
  part.headers = part.headers.filter((line) => !line.toLowerCase().startsWith(`${name.toLowerCase()}:`));
  if (value !== undefined) part.headers.push(`${name}: ${value}`);
}
function serialize(part: Part): string {
  const body = part.children
    ? (part.preamble || "") + part.children.map((child) => `--${part.boundary}\r\n${serialize(child)}\r\n`).join("") + `--${part.boundary}--\r\n${part.epilogue || ""}`
    : part.body;
  return part.headers.join("\r\n") + "\r\n\r\n" + body;
}
function isAttachment(part: Part): boolean {
  return /^attachment\b/i.test(header(part, "content-disposition")) ||
    /(?:^|;)\s*(filename|name)(?:\*\d+\*?|\*)?\s*=/i.test(header(part, "content-disposition") + ";" + header(part, "content-type")) ||
    (!part.children && !["text/plain", "text/html"].includes(type(part)));
}
function content(part: Part): Part {
  return { ...part, headers: part.headers.filter((line) => /^content-/i.test(line)) };
}
function replaceContent(part: Part, replacement: Part): void {
  const outer = part.headers.filter((line) => !/^content-/i.test(line));
  delete part.children;
  delete part.boundary;
  delete part.preamble;
  delete part.epilogue;
  Object.assign(part, replacement, { headers: [...outer, ...replacement.headers] });
}
function ensureEditable(part: Part): void {
  if (["multipart/signed", "multipart/encrypted", "application/pkcs7-mime"].includes(type(part))) {
    throw new HttpError(400, "Signed/encrypted MIME content cannot be edited safely by SenderDeck.");
  }
  if (!isAttachment(part)) part.children?.forEach(ensureEditable);
}
function replaceBody(part: Part, mimeType: string, value: string): boolean {
  if (isAttachment(part)) return false;
  if (!part.children && type(part) === mimeType) {
    const replacement = parse(textPart(mimeType, value));
    replacement.headers.push(...part.headers.filter((line) => /^content-/i.test(line) && !/^content-(type|transfer-encoding):/i.test(line)));
    replaceContent(part, replacement);
    return true;
  }
  const matches = part.children?.map((child) => replaceBody(child, mimeType, value));
  return matches?.some(Boolean) ?? false;
}
function addBody(part: Part, mimeType: string, value: string): void {
  if (part.children) {
    if (type(part) === "multipart/alternative") { part.children.push(parse(textPart(mimeType, value))); return; }
    const body = part.children.find((child) => !isAttachment(child));
    if (!body) throw new HttpError(400, "Draft has no editable body.");
    addBody(body, mimeType, value);
  } else {
    if (isAttachment(part)) throw new HttpError(400, "Draft has no editable body.");
    const current = serialize(content(part));
    const added = textPart(mimeType, value);
    replaceContent(part, parse(multipart("alternative", mimeType === "text/plain" ? [added, current] : [current, added])));
  }
}
function removeAttachments(part: Part): void {
  if (!part.children) return;
  part.children = part.children.filter((child) => !isAttachment(child));
  part.children.forEach(removeAttachments);
  if (!part.children.length) replaceContent(part, parse(textPart("text/plain", "")));
}

export function updateRawMime(rawBase64Url: string, input: DraftUpdateInput): string {
  const binary = atob(rawBase64Url.replaceAll("-", "+").replaceAll("_", "/"));
  const root = parse(binary);
  const contentEdit = input.bodyText !== undefined || input.bodyHtml !== undefined || input.attachments !== undefined;
  if (contentEdit) {
    ensureEditable(root);
    if (isAttachment(root)) throw new HttpError(400, "Draft has no editable MIME body; no changes were made.");
  }
  for (const key of ["subject", "to", "cc", "bcc"] as const) {
    const value = input[key];
    if (value === undefined) continue;
    const clean = (Array.isArray(value) ? value.join(", ") : value).replace(/[\r\n]/g, " ");
    if (key !== "subject" && /[^\x20-\x7e]/.test(clean)) throw new HttpError(400, "Updated recipient headers must use ASCII email addresses.");
    const encoded = key === "subject" && /[^\x20-\x7e]/.test(clean)
      ? `=?UTF-8?B?${encodeBase64Url(clean).replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(encodeBase64Url(clean).length / 4) * 4, "=")}?=` : clean;
    setHeader(root, key, encoded);
  }
  for (const [key, mimeType] of [["bodyText", "text/plain"], ["bodyHtml", "text/html"]] as const) {
    const value = input[key];
    if (value !== undefined && !replaceBody(root, mimeType, value)) addBody(root, mimeType, value);
  }
  if (input.attachments !== undefined) {
    removeAttachments(root);
    const inline = input.attachments.filter((item) => item.contentId);
    const regular = input.attachments.filter((item) => !item.contentId);
    if (inline.length) replaceContent(root, parse(multipart("related", [serialize(content(root)), ...inline.map(attachmentPart)])));
    if (regular.length) replaceContent(root, parse(multipart("mixed", [serialize(content(root)), ...regular.map(attachmentPart)])));
  }
  // Metadata-only edits do not reserialize the MIME tree at all.
  const output = contentEdit ? serialize(root) : root.headers.join("\r\n") + "\r\n\r\n" + root.body;
  return btoa(output).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
