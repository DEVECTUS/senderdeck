import { HttpError } from "./auth";
import type { StoredAccount } from "./env";

/** An explicit sender is one bare mailbox, never an arbitrary MIME header. */
export function senderAddress(value: unknown): string {
  if (typeof value !== "string" || /[\r\n]/.test(value)) throw new HttpError(400, "from must be one bare email address.");
  const address = value.trim().toLowerCase();
  if (address.length > 254 || !/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(address)) {
    throw new HttpError(400, "from must be one bare email address.");
  }
  return address;
}

/** Fail closed for missing, repeated or multi-mailbox provider From headers. */
export function inspectedSender(headers: Array<{ name: string; value: string }> = []): { sender: string; fromHeader: string } {
  const from = headers.filter((header) => header.name.toLowerCase() === "from");
  if (from.length !== 1) throw new HttpError(400, "Draft must have exactly one unambiguous From header.");
  const value = from[0].value.replace(/\r?\n[ \t]+/g, " ").trim();
  const named = /^(?:"(?:[^"\\\r\n]|\\[^\r\n])*"|[^<>@,;:\r\n"]*)\s*<([^<>]+)>$/.exec(value);
  try {
    return { sender: senderAddress(named ? named[1] : value), fromHeader: from[0].value };
  } catch {
    throw new HttpError(400, "Draft must have exactly one unambiguous From address.");
  }
}

export function validateMicrosoftFrom(account: StoredAccount, from?: string): void {
  if (from !== undefined && senderAddress(from) !== account.email.toLowerCase()) {
    throw new HttpError(400, "Sender aliases are supported only for Google accounts. Microsoft drafts must use the connected primary address.");
  }
}
