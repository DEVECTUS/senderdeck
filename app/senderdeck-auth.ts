import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type SenderDeckUser = {
  userId: string;
  email: string;
};

const USER_ID_HEADER = "x-senderdeck-user-id";
const USER_EMAIL_HEADER = "x-senderdeck-user-email";
const SIGN_IN_PATH = "/signin";
const SIGN_OUT_PATH = "/auth/signout";

export async function getSenderDeckUser(): Promise<SenderDeckUser | null> {
  const requestHeaders = await headers();
  const userId = requestHeaders.get(USER_ID_HEADER)?.trim();
  const email = requestHeaders.get(USER_EMAIL_HEADER)?.trim();
  if (!userId || !email) return null;
  return { userId, email };
}

export async function requireSenderDeckUser(returnTo: string): Promise<SenderDeckUser> {
  const user = await getSenderDeckUser();
  if (user) return user;
  redirect(senderDeckSignInPath(returnTo));
}

export function senderDeckSignInPath(returnTo: string): string {
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export function senderDeckSignOutPath(returnTo = "/"): string {
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://senderdeck.local");
    if (url.origin !== "https://senderdeck.local") return "/";
    if (url.pathname === SIGN_IN_PATH || url.pathname.startsWith("/auth/")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
