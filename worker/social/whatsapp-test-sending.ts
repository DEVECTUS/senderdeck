import type { Env } from "../env";
import type { SocialAccount } from "./model";

// Hosting-only, short-lived authorisation. Never read this from tenant inputs or
// brand policy. It is not a claim of Meta Advanced Access or a sandbox detector.
export interface WhatsAppTestScope {
  appId: string; brandId: string; accountId: string; phoneNumberId: string;
  messagingAccountId: string; recipient: string; startsAt: number; expiresAt: number;
}
export function activeWhatsAppTestScope(env: Env, now = Date.now()): WhatsAppTestScope | null {
  try {
    const s: unknown = JSON.parse(env.WHATSAPP_TEST_SEND_SCOPE || "null");
    if (!s || typeof s !== "object" || Array.isArray(s)) return null;
    const v = s as Record<string, unknown>;
    const identity = (key: string) => typeof v[key] === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v[key] as string);
    const numeric = (key: string) => typeof v[key] === "string" && /^[1-9][0-9]{0,31}$/.test(v[key] as string);
    if (!["appId", "brandId", "accountId"].every(identity) || !["phoneNumberId", "messagingAccountId"].every(numeric)
      || typeof v.recipient !== "string" || !/^[1-9][0-9]{7,14}$/.test(v.recipient)
      || v.appId !== env.META_APP_ID || !Number.isSafeInteger(v.startsAt) || !Number.isSafeInteger(v.expiresAt)) return null;
    const start = v.startsAt as number, end = v.expiresAt as number;
    if (start > now || end <= now || end <= start || end - start > 2 * 3600000) return null;
    return v as unknown as WhatsAppTestScope;
  } catch { return null; }
}
export function whatsAppTestAccountAllowed(env: Env, account: SocialAccount): boolean {
  const scope = activeWhatsAppTestScope(env);
  return !!scope && account.provider === "whatsapp" && scope.brandId === account.brand_id && scope.accountId === account.id
    && scope.phoneNumberId === account.asset_id && scope.messagingAccountId === account.parent_id;
}
export function whatsAppTestReplyAllowed(env: Env, account: SocialAccount, recipient: string): boolean {
  const scope = activeWhatsAppTestScope(env);
  return !!scope && whatsAppTestAccountAllowed(env, account) && scope.recipient === recipient;
}
export function productionSocialSendingEnabled(env: Env): boolean {
  return env.SOCIAL_SEND_ENABLED === "true" && env.META_ACCESS_TIER === "advanced";
}
