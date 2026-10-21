import { HttpError } from "../auth";
import { decrypt } from "../crypto";
import type { Env } from "../env";
import { json, type SocialAccount, type History, type HistoryItem, type Coverage, type Thread } from "./model";

export const GRAPH_VERSION = "v26.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}/`;
type GraphObject = Record<string, unknown>;
export interface Candidate { provider: "facebook" | "instagram"; assetId: string; parentId: string; name: string; token: string; tasks: string[] }
export interface MetaGrant { candidates: Candidate[]; permissions: string[]; providerUserId: string; expiresAt: number | null; userToken: string }
export function platformStatus(env: Env) {
  const missing = [!env.META_APP_ID && "META_APP_ID", !env.META_APP_SECRET && "META_APP_SECRET", !env.META_LOGIN_CONFIG_ID && "META_LOGIN_CONFIG_ID", !env.SOCIAL_PUBLIC_ORIGIN && "SOCIAL_PUBLIC_ORIGIN"].filter(Boolean);
  const tier = env.META_ACCESS_TIER === "advanced" ? "advanced" : "development";
  return {
    meta: { configured: missing.length === 0, missing, accessTier: tier, customerAccess: tier === "advanced" ? "requires_per_account_validation" : "pending_app_review",
      webhookConfigured: Boolean(env.META_WEBHOOK_VERIFY_TOKEN && env.META_APP_SECRET), graphVersion: GRAPH_VERSION,
      blockers: [...(missing.length ? ["platform_app_not_configured"] : []), ...(tier !== "advanced" ? ["advanced_access_and_business_verification_required_for_external_customers"] : [])] },
    linkedin: { configured: Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET), community: "pending_authorisation", pageMessaging: "unavailable",
      blockers: ["community_management_standard_access", "assistant_data_use_review", "member_data_retention_and_export_restrictions", "page_messaging_requires_separate_partner_access"] },
    sending: env.SOCIAL_SEND_ENABLED === "true" ? "requires_brand_and_account_validation" : "disabled",
    scheduling: env.SOCIAL_SCHEDULER_ENABLED === "true" ? "configured_requires_recent_execution" : "pending_hosted_scheduler",
    monitoringActive: false,
  };
}
export function requireMeta(env: Env) {
  if (!platformStatus(env).meta.configured) throw new HttpError(409, "Meta platform OAuth is not configured. See provider setup requirements.");
}
export async function graph(token: string, path: string, params: Record<string, string> = {}, method = "GET"): Promise<GraphObject> {
  const url = new URL(path, GRAPH);
  if (url.origin !== "https://graph.facebook.com" || !url.pathname.startsWith(`/${GRAPH_VERSION}/`)) throw new HttpError(502, "Provider pagination URL was rejected.");
  url.searchParams.delete("access_token");
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  let body: URLSearchParams | undefined;
  if (method === "GET") for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  else { body = new URLSearchParams(params); headers.set("content-type", "application/x-www-form-urlencoded"); }
  let response: Response;
  try { response = await fetch(url, { method, headers, body, redirect: "manual", signal: AbortSignal.timeout(15000) }); }
  catch { throw new HttpError(502, method === "GET" ? "Meta could not be reached. No credential verdict was obtained." : "Meta could not be reached. Check the operation before retrying any message delivery."); }
  if (response.status >= 300 && response.status < 400) throw new HttpError(502, "Meta returned an unexpected redirect. The request was not followed.");
  const data = await response.json().catch(() => ({})) as GraphObject;
  if (!response.ok || data.error) {
    const error = data.error as { code?: number } | undefined;
    const status = error?.code === 190 ? 401 : response.status === 429 || [4, 17, 32, 613].includes(error?.code || 0) ? 429 : 502;
    throw new HttpError(status, status === 401 ? "Meta authorisation expired or was revoked. Reconnect the account." : status === 429 ? "Meta rate limit reached; coverage is incomplete." : "Meta denied the operation or returned an unavailable object. Check permissions and asset access.");
  }
  return data;
}
export async function graphPages(token: string, path: string, params: Record<string, string> = {}, pageLimit = 50) {
  const rows: GraphObject[] = []; const seen = new Set<string>(); let pages = 0; let next: string | null = path;
  const gaps: string[] = [];
  while (next && pages < pageLimit) {
    if (seen.has(next)) { gaps.push("provider_pagination_cycle"); break; }
    seen.add(next);
    const result = await graph(token, next, pages === 0 ? { ...params, limit: "100" } : {});
    if (!Array.isArray(result.data)) throw new HttpError(502, "Meta returned an unexpected collection.");
    rows.push(...result.data as GraphObject[]); pages++;
    const paging = result.paging as { next?: string } | undefined;
    next = paging?.next || null;
  }
  if (next && pages >= pageLimit) gaps.push("provider_page_limit_reached");
  return { rows, coverage: { complete: gaps.length === 0, pages, gaps, sourceUrl: null } as Coverage };
}
export async function inspectToken(env: Env, token: string) {
  const raw = await graph(`${env.META_APP_ID}|${env.META_APP_SECRET}`, "debug_token", { input_token: token });
  const data = raw.data as { app_id?: string; is_valid?: boolean; user_id?: string; scopes?: string[]; expires_at?: number; data_access_expires_at?: number } | undefined;
  if (!data?.is_valid || data.app_id !== env.META_APP_ID || !data.user_id) throw new HttpError(403, "Token does not belong to the configured platform app or is invalid.");
  const expiries = [data.expires_at, data.data_access_expires_at].filter((n): n is number => typeof n === "number" && n > 0);
  const expiresAt = expiries.length ? Math.min(...expiries) * 1000 : null;
  if (expiresAt && expiresAt <= Date.now()) throw new HttpError(403, "Meta authorisation has expired.");
  return { permissions: data.scopes || [], providerUserId: data.user_id, expiresAt };
}
export async function discover(env: Env, token: string): Promise<MetaGrant> {
  const details = await inspectToken(env, token);
  const result = await graphPages(token, "me/accounts", { fields: "id,name,access_token,tasks,instagram_business_account{id,username}" });
  if (!result.coverage.complete) throw new HttpError(409, "Asset discovery is incomplete. Retry before selecting an account.");
  const candidates: Candidate[] = [];
  for (const page of result.rows) {
    if (typeof page.id !== "string" || typeof page.access_token !== "string") continue;
    const base = { parentId: page.id, token: page.access_token, tasks: Array.isArray(page.tasks) ? page.tasks as string[] : [] };
    candidates.push({ ...base, provider: "facebook", assetId: page.id, name: String(page.name || page.id) });
    const ig = page.instagram_business_account as { id?: string; username?: string } | undefined;
    if (ig?.id) candidates.push({ ...base, provider: "instagram", assetId: ig.id, name: ig.username || ig.id });
  }
  return { ...details, candidates, userToken: token };
}
export function capabilities(env: Env, account: SocialAccount) {
  const scopes = json<string[]>(account.permissions);
  const v = json<{ reads?: Record<string, boolean>; tasks?: string[]; webhook?: boolean }>(account.validation);
  const live = account.status === "connected" && !!account.validated_at && Date.now() - account.validated_at < 3600000 && (!account.expires_at || account.expires_at > Date.now());
  const has = (...required: string[]) => required.every(s => scopes.includes(s));
  const fb = account.provider === "facebook";
  const meta = fb || account.provider === "instagram";
  const messagingTask = v.tasks?.some(t => ["MESSAGING", "MANAGE", ...(fb ? ["MODERATE"] : [])].includes(t)) || false;
  const commentTask = v.tasks?.some(t => ["MODERATE", "MANAGE", "CREATE_CONTENT"].includes(t)) || false;
  const messages = meta && live && !!v.reads?.messages && messagingTask && (fb ? has("pages_messaging", "pages_manage_metadata", "pages_read_engagement") : has("instagram_basic", "instagram_manage_messages", "pages_manage_metadata"));
  const comments = meta && live && !!v.reads?.comments && (fb ? has("pages_read_engagement", "pages_read_user_content", "pages_show_list") : has("instagram_basic", "instagram_manage_comments", "pages_read_engagement"));
  const sendGate = env.SOCIAL_SEND_ENABLED === "true" && env.META_ACCESS_TIER === "advanced";
  return { messages: messages ? "available" : "unavailable", comments: comments ? "available" : "unavailable",
    mentions: "pending_live_validation", sendMessages: sendGate && messages, replyComments: sendGate && comments && commentTask && (!fb || has("pages_manage_engagement")),
    webhook: !!v.webhook, generalCustomerAccess: env.META_ACCESS_TIER === "advanced", lastValidatedAt: account.validated_at,
    needsValidation: !live, pageMessaging: account.provider === "linkedin" ? "unavailable_requires_partner_access" : undefined };
}
export async function validateConnection(env: Env, account: SocialAccount) {
  if (!account.token || !["facebook", "instagram"].includes(account.provider)) throw new HttpError(409, "This provider is pending authorisation.");
  const token = await decrypt(account.token, env.TOKEN_ENCRYPTION_KEY);
  const details = await inspectToken(env, token);
  if (!account.user_token) throw new HttpError(409, "The granting identity needs to reconnect this asset.");
  const userToken = await decrypt(account.user_token, env.TOKEN_ENCRYPTION_KEY);
  const granting = await inspectToken(env, userToken);
  if (granting.providerUserId !== account.provider_user_id) throw new HttpError(403, "The granting identity no longer matches this account.");
  const pages = await graphPages(userToken, "me/accounts", {fields: "id,tasks,instagram_business_account{id}"});
  const page = pages.rows.find(row => row.id === (account.parent_id || account.asset_id));
  if (!pages.coverage.complete || !page || (account.provider === "instagram" && (page.instagram_business_account as {id?:string})?.id !== account.asset_id)) throw new HttpError(403, "This asset is no longer verified for the granting identity.");
  const tasks = Array.isArray(page.tasks) ? page.tasks as string[] : [];
  const asset = await graph(token, account.asset_id, { fields: account.provider === "facebook" ? "id,name" : "id,username" });
  if (asset.id !== account.asset_id) throw new HttpError(403, "The selected business asset was not verified.");
  const reads: Record<string, boolean> = {}; const errors: string[] = [];
  for (const kind of ["messages", "comments"]) {
    try {
      const path = kind === "messages" ? `${account.parent_id || account.asset_id}/conversations` : `${account.asset_id}/${account.provider === "facebook" ? "feed" : "media"}`;
      const readToken = kind === "comments" && account.provider === "instagram" && account.user_token ? await decrypt(account.user_token, env.TOKEN_ENCRYPTION_KEY) : token;
      await graph(readToken, path, kind === "messages" ? { platform: account.provider === "facebook" ? "messenger" : "instagram", limit: "1" } : { limit: "1" });
      reads[kind] = true;
    } catch { reads[kind] = false; errors.push(`${kind}_read_not_verified`); }
  }
  const previous = json<{ tasks?: string[]; webhook?: boolean }>(account.validation);
  let webhook = false;
  try {
    const subscriptions = await graphPages(token, `${account.parent_id || account.asset_id}/subscribed_apps`, {fields: "id,subscribed_fields"});
    const app = subscriptions.rows.find(row => row.id === env.META_APP_ID);
    const fields = Array.isArray(app?.subscribed_fields) ? app.subscribed_fields as string[] : [];
    webhook = subscriptions.coverage.complete && fields.includes("messages") && fields.includes(account.provider === "facebook" ? "feed" : "comments");
  } catch { errors.push("webhook_subscription_unverified"); }
  return { token, details: { ...details, permissions: details.permissions.filter(scope => granting.permissions.includes(scope)) }, validation: { ...previous, tasks, reads, errors, webhook }, status: Object.values(reads).some(Boolean) ? "connected" : "limited" };
}
export async function inbox(env: Env, account: SocialAccount, kind: "message" | "comment") {
  const caps = capabilities(env, account);
  if ((kind === "message" ? caps.messages : caps.comments) !== "available") throw new HttpError(409, "This account capability is unavailable or needs live validation.");
  const token = await decrypt(kind === "comment" && account.provider === "instagram" ? account.user_token! : account.token!, env.TOKEN_ENCRYPTION_KEY);
  const path = kind === "message" ? `${account.parent_id || account.asset_id}/conversations` : `${account.asset_id}/${account.provider === "facebook" ? "feed" : "media"}`;
  const result = await graphPages(token, path, kind === "message" ? { platform: account.provider === "facebook" ? "messenger" : "instagram", fields: "id,updated_time" } : { fields: account.provider === "facebook" ? "id,permalink_url" : "id,permalink" });
  if (account.provider === "instagram" && kind === "message") { result.coverage.gaps.push("instagram_requests_inactive_over_30_days_are_not_returned"); result.coverage.complete = false; }
  if (account.provider === "instagram" && kind === "comment") { result.coverage.gaps.push("instagram_media_excludes_stories_and_is_limited_to_10000_recent_items"); result.coverage.complete = false; }
  return { threads: result.rows.map(r => ({ providerId: String(r.id), sourceUrl: typeof (r.permalink_url || r.permalink) === "string" ? String(r.permalink_url || r.permalink) : null })), coverage: result.coverage };
}
function item(row: GraphObject): HistoryItem {
  const from = row.from as { id?: string } | undefined;
  const at = typeof row.created_time === "string" || typeof row.timestamp === "string" ? Date.parse(String(row.created_time || row.timestamp)) : NaN;
  return { id: String(row.id), text: String(row.message || row.text || ""), from: String(from?.id || "unknown"), at: Number.isFinite(at) ? at : null, attachments: Boolean(row.attachments || row.attachment) };
}
export async function readHistory(env: Env, account: SocialAccount, thread: Thread): Promise<History> {
  const token = await decrypt(account.token!, env.TOKEN_ENCRYPTION_KEY);
  const items: HistoryItem[] = []; const gaps: string[] = []; let pages = 0; let target = thread.target; let owned = true;
  if (thread.kind === "message") {
    const meta = await graph(token, thread.provider_id, { fields: "id,participants,is_owner" });
    owned = meta.is_owner === true;
    const participants = (meta.participants as { data?: Array<{ id?: string }> })?.data || [];
    const external = participants.map(p => p.id).filter((p): p is string => !!p && p !== account.asset_id && p !== account.parent_id);
    if (external.length !== 1) gaps.push("recipient_not_uniquely_verified"); else target = external[0];
    const list = await graphPages(token, `${thread.provider_id}/messages`, { fields: "id" });
    pages += list.coverage.pages; gaps.push(...list.coverage.gaps);
    for (const row of list.rows.slice(0, 20)) {
      try { items.push(item(await graph(token, String(row.id), { fields: "id,message,from,created_time,attachments" }))); }
      catch { gaps.push("message_detail_unavailable"); }
    }
    if (list.rows.length > 20) gaps.push("provider_only_exposes_20_recent_message_details");
    if (!owned) gaps.push("conversation_routing_ownership_unverified");
  } else {
    // Root context plus every available comment/reply page; never stop because a page is short.
    const rootToken = account.provider === "instagram" && account.user_token ? await decrypt(account.user_token, env.TOKEN_ENCRYPTION_KEY) : token;
    const root = await graph(rootToken, thread.provider_id, { fields: account.provider === "facebook" ? "id,message,created_time,can_comment" : "id,caption,timestamp" });
    if (account.provider === "facebook") owned = root.can_comment === true;
    items.push(item({ ...root, text: root.caption || root.message }));
    const work = [{ path: `${thread.provider_id}/comments`, depth: 0 }]; const seen = new Set<string>();
    while (work.length && pages < 100) {
      const current = work.shift()!;
      if (seen.has(current.path)) continue;
      seen.add(current.path);
      const list = await graphPages(token, current.path, { fields: account.provider === "facebook" ? "id,message,from,created_time,attachment,comment_count" : "id,text,from,timestamp" }, Math.max(1, 100 - pages));
      pages += list.coverage.pages; gaps.push(...list.coverage.gaps);
      for (const row of list.rows) {
        items.push(item(row));
        if (account.provider === "facebook" && Number(row.comment_count) > 0) work.push({ path: `${String(row.id)}/comments`, depth: current.depth + 1 });
        if (account.provider === "instagram" && current.depth === 0) work.push({ path: `${String(row.id)}/replies`, depth: 1 });
      }
    }
    if (work.length) gaps.push("reply_tree_page_limit_reached");
  }
  items.sort((a, b) => (a.at || 0) - (b.at || 0) || a.id.localeCompare(b.id));
  const inbound = items.filter(i => (thread.kind === "message" ? i.from === target : i.from !== account.asset_id && i.from !== account.parent_id) && i.at).map(i => i.at!);
  return { items, target, owned, lastInboundAt: inbound.length ? Math.max(...inbound) : null,
    coverage: { complete: gaps.length === 0, pages, gaps: [...new Set(gaps)], sourceUrl: thread.source_url } };
}
export async function sendReply(env: Env, account: SocialAccount, thread: Thread, text: string) {
  const token = await decrypt(account.token!, env.TOKEN_ENCRYPTION_KEY);
  if (thread.kind === "message") return graph(token, `${account.parent_id || account.asset_id}/messages`, { recipient: JSON.stringify({ id: thread.target }), messaging_type: "RESPONSE", message: JSON.stringify({ text }) }, "POST");
  return graph(token, `${thread.target}/${account.provider === "facebook" ? "comments" : "replies"}`, { message: text }, "POST");
}
