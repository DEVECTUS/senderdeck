import { HttpError } from "../auth";
import type { Env } from "../env";
import { decrypt } from "../crypto";

export type SocialProvider = "facebook" | "instagram" | "linkedin" | "email" | "whatsapp";
export type Role = "owner" | "admin" | "editor" | "reviewer" | "viewer";
export const editors: Role[] = ["owner", "admin", "editor"];
export const reviewers: Role[] = ["owner", "admin", "reviewer"];
export const admins: Role[] = ["owner", "admin"];
export interface BrandProfile {
  language: string; tone: string; maxReplyLength: number; forbidDashes: boolean;
  verifiedFacts: Array<{ id: string; text: string; source: string }>;
  approvedReplies: string[]; verifiedUrls: string[]; escalationTerms: string[];
  identityResponse: string; avoidUnsolicitedAi: boolean; sendEnabled: boolean;
  retentionDays: number;
}
export interface Brand { id: string; customer_id: string; name: string; profile: string; revision: number; role?: Role }
export interface SocialAccount {
  id: string; brand_id: string; provider: SocialProvider; asset_id: string; parent_id: string | null;
  provider_user_id: string | null; name: string; token: string | null; user_token: string | null; expires_at: number | null;
  permissions: string; status: string; validation: string; validated_at: number | null;
  monitoring: string; last_reconciled_at: number | null; created_at: number;
}
export interface Thread {
  id: string; account_id: string; provider_id: string; kind: "message" | "comment" | "mention";
  target: string; source_url: string | null; status: string; assigned_to: string | null;
  next_action: string; last_inbound_at: number | null; last_digest?: string | null; updated_at: number;
}
export interface HistoryItem { id: string; text: string; from: string; at: number | null; attachments: boolean; senderName?: string; role?: "post_context"; parentId?: string }
export interface Coverage { complete: boolean; pages: number; gaps: string[]; sourceUrl: string | null }
export interface RootOwnership { state: "verified" | "different_asset" | "unverified"; ownerId: string | null; source: string }
export interface ReplyAuthority { state: "verified" | "denied" | "unverified"; reason: string }
export interface History { items: HistoryItem[]; coverage: Coverage; target: string; lastInboundAt: number | null; owned: boolean; nextCursor?: string | null; ownership?: RootOwnership; replyAuthority?: ReplyAuthority; ownedMeaning?: string }
export const id = () => crypto.randomUUID();
export function str(value: unknown, field: string, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new HttpError(400, `Invalid ${field}.`);
  return value.trim();
}
export function json<T>(value: string): T { return JSON.parse(value) as T; }
export async function member(env: Env, user: string, customerId: string, roles?: Role[]): Promise<Role> {
  const row = await env.DB.prepare("SELECT role FROM social_members WHERE customer_id = ? AND user_id = ?").bind(customerId, user).first<{ role: Role }>();
  if (!row) throw new HttpError(404, "Customer not found.");
  if (roles && !roles.includes(row.role)) throw new HttpError(403, "Your customer role does not permit this action.");
  return row.role;
}
export async function brandFor(env: Env, user: string, brandId: string, roles?: Role[]): Promise<Brand> {
  const brand = await env.DB.prepare("SELECT b.*, m.role FROM social_brands b JOIN social_members m ON m.customer_id = b.customer_id WHERE b.id = ? AND m.user_id = ?").bind(brandId, user).first<Brand>();
  if (!brand) throw new HttpError(404, "Brand not found.");
  if (roles && !roles.includes(brand.role!)) throw new HttpError(403, "Your customer role does not permit this action.");
  return brand;
}
export async function accountFor(env: Env, user: string, brandId: string, accountId: string, roles?: Role[]) {
  const brand = await brandFor(env, user, brandId, roles);
  const account = await env.DB.prepare("SELECT * FROM social_accounts WHERE id = ? AND brand_id = ?").bind(accountId, brandId).first<SocialAccount>();
  if (!account) throw new HttpError(404, "Account not found in the selected brand.");
  // Linking a mailbox does not delegate the original owner's email credentials.
  if (account.provider === "email") {
    const owned = await env.DB.prepare("SELECT id FROM email_accounts WHERE id = ? AND user_id = ?").bind(account.asset_id, user).first();
    if (!owned) throw new HttpError(403, "Only the mailbox owner may use the linked email account.");
  }
  return { brand, account };
}
export async function threadFor(env: Env, account: SocialAccount, threadId: string): Promise<Thread> {
  const thread = await env.DB.prepare("SELECT * FROM social_threads WHERE id = ? AND account_id = ?").bind(threadId, account.id).first<Thread>();
  if (!thread) throw new HttpError(404, "Thread not found in the selected account.");
  return thread;
}
export async function audit(env: Env, brandId: string, actor: string, action: string, objectId: string, detail = "") {
  await env.DB.prepare("INSERT INTO social_activity (id, brand_id, actor, action, object_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id(), brandId, actor, action, objectId, detail, Date.now()).run();
}
export async function notice(env: Env, accountId: string, reason: string, fingerprint: string) {
  await env.DB.prepare("INSERT OR IGNORE INTO social_notices (id, account_id, reason, fingerprint, created_at) VALUES (?, ?, ?, ?, ?)").bind(id(), accountId, reason, fingerprint, Date.now()).run();
}
export async function maintenanceStatus(env: Env) {
  const heartbeat = await env.DB.prepare("SELECT value FROM social_runtime WHERE key='maintenance'").first<{value:number}>();
  const scheduled = await env.DB.prepare("SELECT value FROM social_runtime WHERE key='maintenance_scheduled'").first<{value:number}>();
  const checkedAt=Date.now(), ageMs=heartbeat ? checkedAt-heartbeat.value : null;
  const schedulerConfigured=env.SOCIAL_SCHEDULER_ENABLED === "true";
  const schedulerRecent=ageMs !== null && ageMs>=0 && ageMs<=1200000;
  const scheduledRecent=!!scheduled && checkedAt-scheduled.value>=0 && checkedAt-scheduled.value<=1200000;
  return {schedulerConfigured,schedulerRecent,lastMaintenanceAt:heartbeat?.value||null,checkedAt,ageMs,freshUntil:heartbeat?heartbeat.value+1200000:null,lastScheduledMaintenanceAt:scheduled?.value||null,backgroundScheduling:!scheduled?"unverified":scheduledRecent?"recent":"stale"};
}
export function safeAccount(account: SocialAccount) {
  const { token: _token, user_token: _userToken, provider_user_id: _user, ...safe } = account;
  return { ...safe, permissions: json<string[]>(account.permissions), validation: json(account.validation), monitoring: json(account.monitoring) };
}
export async function deleteLocalAccount(env: Env, account: Pick<SocialAccount, "id" | "brand_id">) {
  const links = (await env.DB.prepare("SELECT id,encrypted FROM social_identity_links WHERE brand_id=?").bind(account.brand_id).all<{id:string;encrypted:string}>()).results;
  for (const link of links) {
    const identities = json<Array<{accountId:string}>>(await decrypt(link.encrypted, env.TOKEN_ENCRYPTION_KEY));
    if (identities.some(identity => identity.accountId === account.id)) await env.DB.prepare("DELETE FROM social_identity_links WHERE id=?").bind(link.id).run();
  }
  await env.DB.prepare("DELETE FROM social_accounts WHERE id=? AND brand_id=?").bind(account.id, account.brand_id).run();
}
