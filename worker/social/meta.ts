import { activeWhatsAppTestScope, whatsAppTestAccountAllowed, productionSocialSendingEnabled } from "./whatsapp-test-sending";
import { validateWhatsApp, whatsappHistory, sendWhatsApp } from "./whatsapp";
import { HttpError } from "../auth";
import { decrypt, encrypt } from "../crypto";
import type { Env } from "../env";
import { json, type SocialAccount, type History, type HistoryItem, type Coverage, type Thread, type RootOwnership, type ReplyAuthority } from "./model";
import { monitoringEvidence } from "./monitoring";

export const GRAPH_VERSION = "v26.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}/`;
type GraphObject = Record<string, unknown>;
export interface ReadBudget { deadline: number; remaining: number }
class ReadLimit extends Error {}
const readBudget = (): ReadBudget => ({ deadline: Date.now() + 20000, remaining: 20 });
export interface ReadOptions { cursor?: string; limit?: number; source?: "feed" | "ads" | "ad_creatives" }
interface Continuation { account: string; scope: string; expires: number; paths: Array<{ path: string; depth: number }> }
async function resume(env: Env, account: SocialAccount, scope: string, cursor?: string) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(await decrypt(cursor, env.TOKEN_ENCRYPTION_KEY)) as Continuation;
    if (value.account !== account.id || value.scope !== scope || value.expires <= Date.now() || !Array.isArray(value.paths) || value.paths.length > 250) throw new Error();
    for (const entry of value.paths) {
      const url = new URL(entry.path, GRAPH);
      if (url.origin !== "https://graph.facebook.com" || !url.pathname.startsWith(`/${GRAPH_VERSION}/`) || !Number.isInteger(entry.depth)) throw new Error();
    }
    return value.paths;
  } catch { throw new HttpError(400, "Invalid, expired or differently scoped social cursor. Restart this read."); }
}
async function continuation(env: Env, account: SocialAccount, scope: string, paths: Continuation["paths"], lifetimeMs = 900000) {
  if (!paths.length) return null;
  // Provider tokens must never leave the server, including inside an encrypted cursor.
  const clean = paths.map(entry => { const url = new URL(entry.path, GRAPH); url.searchParams.delete("access_token"); return { ...entry, path: url.href }; });
  return encrypt(JSON.stringify({ account: account.id, scope, expires: Date.now() + lifetimeMs, paths: clean }), env.TOKEN_ENCRYPTION_KEY);
}
export class MetaProviderError extends HttpError {
  constructor(status:number,message:string,public providerStatus:number,public providerCode:number|null,public providerReason:string|null=null){super(status,message);}
}
class HistoryProbeError extends HttpError {
  constructor(public reason: string, public unverified = false) { super(unverified ? 409 : 502, "History access was not verified."); }
}
type HistoryProbe = { state: "verified" | "unverified" | "failed"; stage: string; reason: string; httpStatus?: number; providerCode?: number | null };
export interface Candidate { provider: "facebook" | "instagram"; assetId: string; parentId: string; name: string; token: string; tasks: string[]; discoverySource?:"accounts"|"granular_target" }
export interface DiscoveryDiagnostics { returnedPages:number; eligibleAssets:number; pagesWithoutCredentials:number; grantedScopes:string[]; granularTargets:Array<{scope:string;ids:string[]}>; businessManagementGranted:boolean; directResolved:number; directUnresolved:number; directFailures:Array<{id:string;status:number|null;providerCode:number|null;reason:string}>; findings:string[] }
export interface MetaGrant { candidates: Candidate[]; permissions: string[]; providerUserId: string; expiresAt: number | null; userToken: string; diagnostics?:DiscoveryDiagnostics }
export function platformStatus(env: Env) {
  const missing = [!env.META_APP_ID && "META_APP_ID", !env.META_APP_SECRET && "META_APP_SECRET", !env.META_LOGIN_CONFIG_ID && "META_LOGIN_CONFIG_ID", !env.SOCIAL_PUBLIC_ORIGIN && "SOCIAL_PUBLIC_ORIGIN"].filter(Boolean);
  const tier = env.META_ACCESS_TIER === "advanced" ? "advanced" : "development";
  return {
    meta: { configured: missing.length === 0, missing, accessTier: tier, customerAccess: tier === "advanced" ? "requires_per_account_validation" : "pending_app_review",
      webhookConfigured: Boolean(env.META_WEBHOOK_VERIFY_TOKEN && env.META_APP_SECRET), graphVersion: GRAPH_VERSION,
      blockers: [...(missing.length ? ["platform_app_not_configured"] : []), ...(tier !== "advanced" ? ["advanced_access_and_business_verification_required_for_external_customers"] : [])] },
    whatsapp: { configured: Boolean(env.META_APP_ID && env.META_APP_SECRET && env.WHATSAPP_LOGIN_CONFIG_ID), history: "retained_signed_webhooks_only", templates: "unavailable", mediaSending: "unavailable", testSending: { active: !!activeWhatsAppTestScope(env), productionAccessUnchanged: true }, coexistence: {configured:!!env.WHATSAPP_COEXISTENCE_CONFIG_ID,eligibility:"must_be_verified_in_meta",onboarding:"embedded_signup_v4",phoneRegistration:"never_performed_by_senderdeck"} },
    linkedin: { configured: Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET), community: "pending_authorisation", pageMessaging: "unavailable",
      blockers: ["community_management_standard_access", "assistant_data_use_review", "member_data_retention_and_export_restrictions", "page_messaging_requires_separate_partner_access"] },
    sending: env.SOCIAL_SEND_ENABLED === "true" ? "requires_brand_and_account_validation" : activeWhatsAppTestScope(env) ? "test_only_requires_brand_account_recipient_and_approval" : "disabled",
    scheduling: env.SOCIAL_SCHEDULER_ENABLED === "true" ? "configured_requires_recent_execution" : "pending_hosted_scheduler",
    monitoringActive: false,
  };
}
export function requireMeta(env: Env) {
  if (!platformStatus(env).meta.configured) throw new HttpError(409, "Meta platform OAuth is not configured. See provider setup requirements.");
}
export async function graph(token: string, path: string, params: Record<string, string> = {}, method = "GET", budget?: ReadBudget): Promise<GraphObject> {
  if (budget && (budget.remaining-- <= 0 || budget.deadline <= Date.now())) throw new ReadLimit();
  const url = new URL(path, GRAPH);
  if (url.origin !== "https://graph.facebook.com" || !url.pathname.startsWith(`/${GRAPH_VERSION}/`)) throw new HttpError(502, "Provider pagination URL was rejected.");
  url.searchParams.delete("access_token");
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  let body: URLSearchParams | undefined;
  if (method === "GET") for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  else { body = new URLSearchParams(params); headers.set("content-type", "application/x-www-form-urlencoded"); }
  let response: Response;
  try { response = await fetch(url, { method, headers, body, redirect: "manual", signal: AbortSignal.timeout(budget ? Math.max(1, Math.min(10000, budget.deadline - Date.now())) : 15000) }); }
  catch { if (budget && budget.deadline <= Date.now()) throw new ReadLimit(); throw new HttpError(502, method === "GET" ? "Meta could not be reached. No credential verdict was obtained." : "Meta could not be reached. Check the operation before retrying any message delivery."); }
  if (response.status >= 300 && response.status < 400) throw new HttpError(502, "Meta returned an unexpected redirect. The request was not followed.");
  const data = await response.json().catch(() => ({})) as GraphObject;
  if (!response.ok || data.error) {
    const error = data.error as { code?: number;message?:unknown } | undefined;
    const status = error?.code === 190 ? 401 : response.status === 429 || [4, 17, 32, 613, 80000, 80003, 80004, 80014].includes(error?.code || 0) ? 429 : 502;
    const missing=typeof error?.message==="string"?error.message.match(/nonexisting field \(([a-z_]{1,40})\)/i)?.[1]:undefined;
    const field=missing&&params.fields?.split(/[^a-z_]+/).includes(missing)?missing:null;
    const reason=field?`unsupported_field:${field}`:null;
    const summary=status===401?"Meta authorisation expired or was revoked. Reconnect the account.":status===429?"Meta rate limit reached; coverage is incomplete.":field?`Meta rejected requested field ${field}.`:"Meta denied the operation or returned an unavailable object. Check permissions and asset access.";
    throw new MetaProviderError(status,`${summary} HTTP ${response.status}; Graph error ${typeof error?.code==="number"?error.code:"not supplied"}.`,response.status,typeof error?.code==="number"?error.code:null,reason);
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
export async function inspectToken(env: Env, token: string, budget?: ReadBudget) {
  const raw = await graph(`${env.META_APP_ID}|${env.META_APP_SECRET}`, "debug_token", { input_token: token }, "GET", budget);
  const data = raw.data as { app_id?: string; is_valid?: boolean; user_id?: string; scopes?: string[]; granular_scopes?:Array<{scope?:unknown;target_ids?:unknown}>; expires_at?: number; data_access_expires_at?: number } | undefined;
  if (!data?.is_valid || data.app_id !== env.META_APP_ID || !data.user_id) throw new HttpError(403, "Token does not belong to the configured platform app or is invalid.");
  const expiries = [data.expires_at, data.data_access_expires_at].filter((n): n is number => typeof n === "number" && n > 0);
  const expiresAt = expiries.length ? Math.min(...expiries) * 1000 : null;
  if (expiresAt && expiresAt <= Date.now()) throw new HttpError(403, "Meta authorisation has expired.");
  const granularTargets=(data.granular_scopes||[]).filter(item=>typeof item.scope === "string"&&/^[a-z_]{1,80}$/.test(item.scope)).slice(0,30).map(item=>({scope:String(item.scope),ids:Array.isArray(item.target_ids)?item.target_ids.filter((id):id is string=>typeof id==="string"&&/^\d{1,32}$/.test(id)).slice(0,200):[]}));
  return { permissions: data.scopes || [], providerUserId: data.user_id, expiresAt, granularTargets };
}
export async function discover(env: Env, token: string): Promise<MetaGrant> {
  const details = await inspectToken(env, token);
  const result = await graphPages(token, "me/accounts", { fields: "id,name,access_token,tasks,instagram_business_account{id,username}" });
  if (!result.coverage.complete) throw new HttpError(409, "Asset discovery is incomplete. Retry before selecting an account.");
  const pageTargets=[...new Set(details.granularTargets.filter(item=>item.scope==="pages_show_list").flatMap(item=>item.ids))];
  // Only Meta's introspected Page targets may seed direct lookups. No caller-
  // supplied IDs, business IDs, Instagram IDs or assumed Page tasks are used.
  const pages=result.rows.filter(page=>!pageTargets.length||pageTargets.includes(String(page.id)));
  const missingTargets=pageTargets.filter(id=>!pages.some(page=>page.id===id&&typeof page.access_token==="string"));
  if (missingTargets.length>20) throw new HttpError(409,"Asset discovery exceeded the verified target lookup budget. Select fewer assets and authorise again.");
  let directResolved=0,directUnresolved=0;
  const directFailures:DiscoveryDiagnostics["directFailures"]=[];
  for (const target of missingTargets) {
    try {
      const page=await graph(token,target,{fields:"id,name,access_token,instagram_business_account{id,username}"});
      if (page.id!==target||typeof page.access_token!=="string"||!page.access_token) {directUnresolved++;directFailures.push({id:target,status:200,providerCode:null,reason:page.id!==target?"object_identity_mismatch":"connection_credential_not_returned"});continue;}
      const credential=await inspectToken(env,page.access_token);
      if (credential.providerUserId!==details.providerUserId) {directUnresolved++;directFailures.push({id:target,status:403,providerCode:null,reason:"credential_owner_not_verified"});continue;}
      // Direct Page reads do not establish Page tasks. Keep those unknown;
      // capability/send gates must never manufacture MANAGE or MESSAGING.
      const previous=pages.findIndex(item=>item.id===target);
      if(previous>=0)pages.splice(previous,1);
      pages.push({...page,tasks:[],_direct:true});directResolved++;
    } catch(error) {directUnresolved++;directFailures.push({id:target,status:error instanceof MetaProviderError?error.providerStatus:error instanceof HttpError?error.status:null,providerCode:error instanceof MetaProviderError?error.providerCode:null,reason:"direct_verification_failed"});}
  }
  const candidates: Candidate[] = [];
  for (const page of pages) {
    if (typeof page.id !== "string" || typeof page.access_token !== "string") continue;
    const base = { parentId: page.id, token: page.access_token, tasks: Array.isArray(page.tasks) ? page.tasks as string[] : [],discoverySource:page._direct?"granular_target" as const:"accounts" as const };
    candidates.push({ ...base, provider: "facebook", assetId: page.id, name: String(page.name || page.id) });
    const ig = page.instagram_business_account as { id?: string; username?: string } | undefined;
    if (ig?.id) candidates.push({ ...base, provider: "instagram", assetId: ig.id, name: ig.username || ig.id });
  }
  const findings:string[]=[];
  const pagesWithoutCredentials=result.rows.filter(page=>typeof page.access_token!=="string").length;
  if (!result.rows.length) findings.push("no_pages_returned_by_accounts");
  if (!details.permissions.includes("business_management")) findings.push("business_management_not_granted_check_business_portfolio_requirements");
  if (pagesWithoutCredentials) findings.push("some_pages_returned_without_connection_credentials");
  if (!candidates.some(asset=>asset.provider==="instagram")) findings.push("no_linked_instagram_identity_returned");
  if (pageTargets.some(id=>!result.rows.some(page=>page.id===id))) findings.push("some_granted_page_targets_not_returned_by_accounts");
  if(directResolved)findings.push("verified_granular_targets_resolved_directly_page_tasks_not_returned");
  if(directUnresolved)findings.push("some_granular_targets_could_not_be_verified_directly");
  const diagnostics:DiscoveryDiagnostics={returnedPages:result.rows.length,eligibleAssets:candidates.length,pagesWithoutCredentials,grantedScopes:details.permissions,granularTargets:details.granularTargets,businessManagementGranted:details.permissions.includes("business_management"),directResolved,directUnresolved,directFailures,findings};
  return { ...details, candidates, userToken: token, diagnostics };
}
export function capabilities(env: Env, account: SocialAccount) {
  const scopes = json<string[]>(account.permissions);
  const v = json<{ reads?: Record<string, boolean>; tasks?: string[]; webhook?: boolean;historyProbeVersion?:number }>(account.validation);
  const live = v.historyProbeVersion===2 && account.status === "connected" && !!account.validated_at && Date.now() - account.validated_at < 3600000 && (!account.expires_at || account.expires_at > Date.now());
  const has = (...required: string[]) => required.every(s => scopes.includes(s));
  if (account.provider === "whatsapp") {
    const messages = live && !!v.reads?.messages && has("whatsapp_business_messaging", "whatsapp_business_management");
    const testOnly = !productionSocialSendingEnabled(env) && whatsAppTestAccountAllowed(env, account);
    return { messages: messages ? "available" : "unavailable", comments: "unavailable", mentions: "unavailable", messageBlockers: messages ? [] : ["whatsapp_validation_required"], sendMessages: messages && !!v.webhook && (productionSocialSendingEnabled(env) || testOnly), sendRestriction: testOnly ? "configured_test_recipient_only" : null, replyComments: false, webhook: !!v.webhook, generalCustomerAccess: env.META_ACCESS_TIER === "advanced", lastValidatedAt: account.validated_at, needsValidation: !live, pageMessaging: undefined };
  }
  const fb = account.provider === "facebook";
  const meta = fb || account.provider === "instagram";
  const messagingTask = v.tasks?.some(t => ["MESSAGING", "MANAGE", ...(fb ? ["MODERATE"] : [])].includes(t)) || false;
  const commentTask = v.tasks?.some(t => ["MODERATE", "MANAGE", "CREATE_CONTENT"].includes(t)) || false;
  const messages = meta && live && !!v.reads?.messages && messagingTask && (fb ? has("pages_messaging", "pages_manage_metadata", "pages_read_engagement") : has("instagram_basic", "instagram_manage_messages", "pages_manage_metadata"));
  const comments = meta && live && !!v.reads?.comments && (fb ? has("pages_read_engagement", "pages_read_user_content", "pages_show_list") : has("instagram_basic", "instagram_manage_comments", "pages_read_engagement"));
  const sendGate = env.SOCIAL_SEND_ENABLED === "true" && env.META_ACCESS_TIER === "advanced";
  const requiredMessageScopes = fb ? ["pages_messaging", "pages_manage_metadata", "pages_read_engagement"] : ["instagram_basic", "instagram_manage_messages", "pages_manage_metadata"];
  const messageBlockers = [...(!meta ? ["provider_messaging_not_supported"] : []), ...(!live ? ["live_history_validation_required"] : []), ...(!v.reads?.messages ? ["message_history_unverified"] : []), ...(!messagingTask ? ["page_messaging_task_unverified"] : []), ...requiredMessageScopes.filter(scope => !has(scope)).map(scope => `missing_scope:${scope}`)];
  return { messages: messages ? "available" : "unavailable", comments: comments ? "available" : "unavailable",
    messageBlockers,
    mentions: "pending_live_validation", sendMessages: sendGate && messages, replyComments: sendGate && comments && commentTask && (!fb || has("pages_manage_engagement")),
    webhook: !!v.webhook, generalCustomerAccess: env.META_ACCESS_TIER === "advanced", lastValidatedAt: account.validated_at,
    needsValidation: !live, pageMessaging: account.provider === "linkedin" ? "unavailable_requires_partner_access" : undefined };
}
export async function validateConnection(env: Env, account: SocialAccount) {
  if (account.provider === "whatsapp") return validateWhatsApp(env, account);
  if (!account.token || !["facebook", "instagram"].includes(account.provider)) throw new HttpError(409, "This provider is pending authorisation.");
  const token = await decrypt(account.token, env.TOKEN_ENCRYPTION_KEY);
  const details = await inspectToken(env, token);
  if (!account.user_token) throw new HttpError(409, "The granting identity needs to reconnect this asset.");
  const userToken = await decrypt(account.user_token, env.TOKEN_ENCRYPTION_KEY);
  const granting = await inspectToken(env, userToken);
  if (granting.providerUserId !== account.provider_user_id) throw new HttpError(403, "The granting identity no longer matches this account.");
  const current = await discover(env,userToken);
  const selected = current.candidates.find(asset=>asset.provider===account.provider&&asset.assetId===account.asset_id&&asset.parentId===(account.parent_id||account.asset_id));
  if (!selected) throw new HttpError(403, "This asset is no longer verified for the granting identity.");
  const tasks = selected.tasks;
  const asset = await graph(token, account.asset_id, { fields: account.provider === "facebook" ? "id,name" : "id,username" });
  if (asset.id !== account.asset_id) throw new HttpError(403, "The selected business asset was not verified.");
  const reads: Record<string, boolean> = {}; const errors: string[] = [];
  const probes: Record<string, HistoryProbe> = {};
  for (const kind of ["messages", "comments"]) {
    let stage = "roots";
    try {
      const path = kind === "messages" ? `${account.parent_id || account.asset_id}/conversations` : `${account.asset_id}/${account.provider === "facebook" ? "feed" : "media"}`;
      const readToken = kind === "comments" && account.provider === "instagram" && account.user_token ? await decrypt(account.user_token, env.TOKEN_ENCRYPTION_KEY) : token;
      const roots=await graph(readToken, path, kind === "messages" ? { platform: account.provider === "facebook" ? "messenger" : "instagram", limit: "1" } : { limit: "1",fields:"id" });
      if(!Array.isArray(roots.data))throw new HistoryProbeError("unexpected_root_collection");
      reads[kind==="messages"?"messageRoots":"commentRoots"]=true;
      const first=roots.data.find((row:unknown)=>row&&typeof row==="object"&&typeof (row as GraphObject).id==="string") as GraphObject|undefined;
      if(!first)throw new HistoryProbeError(roots.data.length ? "invalid_root_identity" : "no_sample_root", !roots.data.length);
      stage = "context";
      if(kind==="messages"){
        const context=await graph(token,String(first.id),{fields:"id,participants,is_owner"});
        if(context.id!==first.id)throw new HistoryProbeError("root_identity_mismatch");
        stage = "history";
        const messages=await graph(token,`${first.id}/messages`,{fields:"id",limit:"1"});
        if(!Array.isArray(messages.data))throw new HistoryProbeError("unexpected_message_collection");
        const message=messages.data[0] as GraphObject|undefined;
        if(typeof message?.id!=="string")throw new HistoryProbeError(messages.data.length ? "invalid_message_identity" : "no_sample_message", !messages.data.length);
        stage = "item";
        const detail = await graph(token,message.id,{fields:"id,message,from,created_time,attachments"});
        if(detail.id!==message.id)throw new HistoryProbeError("message_identity_mismatch");
      }else{
        const context=await commentContext(readToken,String(first.id),account.provider);
        if(!context.owned)errors.push("comment_write_authority_unverified");
        stage = "history";
        const comments=await graph(token,`${first.id}/comments`,{fields:commentFields(account.provider),limit:"1"});
        if(!Array.isArray(comments.data))throw new HttpError(502,"Provider returned an unexpected comment collection.");
        const comment=comments.data[0] as GraphObject|undefined;
        if(typeof comment?.id==="string"&&(account.provider==="instagram"||Number(comment.comment_count)>0)){
          stage = "replies";
          const replies=await graph(token,`${comment.id}/${account.provider==="facebook"?"comments":"replies"}`,{fields:commentFields(account.provider),limit:"1"});
          if(!Array.isArray(replies.data))throw new HttpError(502,"Provider returned an unexpected reply collection.");
        }
      }
      reads[kind] = true;
      probes[kind] = { state: "verified", stage, reason: "sample_history_verified" };
    } catch(error) {
      reads[kind] = false;
      const reason = error instanceof HistoryProbeError ? error.reason : error instanceof MetaProviderError ? error.providerReason || "provider_error" : error instanceof HttpError ? "transport_or_response_failure" : "unexpected_probe_failure";
      probes[kind] = { state: error instanceof HistoryProbeError && error.unverified ? "unverified" : "failed", stage, reason, ...(error instanceof MetaProviderError ? { httpStatus: error.providerStatus, providerCode: error.providerCode } : {}) };
      errors.push(`${kind}_history_probe_failed${error instanceof MetaProviderError?`:http_${error.providerStatus}:graph_${error.providerCode??"unknown"}:${error.providerReason||"provider_denied"}`:`:${reason}`}`);
    }
  }
  const previous = json<{ tasks?: string[]; webhook?: boolean }>(account.validation);
  let webhook = false;
  try {
    if (account.provider === "facebook") {
      const subscriptions = await graphPages(token, `${account.asset_id}/subscribed_apps`, {fields: "id,subscribed_fields"});
      const app = subscriptions.rows.find(row => row.id === env.META_APP_ID);
      const fields = Array.isArray(app?.subscribed_fields) ? app.subscribed_fields as string[] : [];
      webhook = subscriptions.coverage.complete && fields.includes("messages") && fields.includes("feed");
    } else {
      // Meta explicitly excludes Instagram fields from the Page subscription API.
      // Dashboard settings alone are not readable proof; require actual signed
      // delivery of both supported Instagram event types for this exact asset.
      const evidence = await monitoringEvidence(env, account.id);
      webhook = !!evidence?.messages_at && !!evidence?.comments_at;
      if (!webhook) errors.push("instagram_dashboard_setup_and_signed_delivery_required");
    }
  } catch { errors.push("webhook_subscription_unverified"); }
  const advertisingScopes = json<{advertisingAccount?:unknown}>(account.validation).advertisingAccount ? granting.permissions.filter(scope => scope === "ads_read" || scope === "ads_management") : [];
  return { token, details: { ...details, permissions: [...new Set([...details.permissions.filter(scope => granting.permissions.includes(scope)), ...advertisingScopes])] }, validation: { ...previous, historyProbeVersion:2, historyProbeScope:"one_returned_root_not_complete_native_history", taskDiscovery: { source: selected.discoverySource || "accounts", state: tasks.length ? "returned" : "unverified", reason: tasks.length ? "provider_returned_page_tasks" : "provider_did_not_return_page_tasks" }, tasks, reads, probes, errors, webhook }, status: reads.messages||reads.comments ? "connected" : "limited" };
}
export async function inbox(env: Env, account: SocialAccount, kind: "message" | "comment", options: ReadOptions = {}) {
  const caps = capabilities(env, account);
  if ((kind === "message" ? caps.messages : caps.comments) !== "available") throw new HttpError(409, "This account capability is unavailable or needs live validation.");
  const token = await decrypt(kind === "comment" && account.provider === "instagram" ? account.user_token! : account.token!, env.TOKEN_ENCRYPTION_KEY);
  const source = options.source || "feed";
  if (!["feed", "ads", "ad_creatives"].includes(source) || (source !== "feed" && kind !== "comment") || (source === "ads" && account.provider !== "facebook")) throw new HttpError(400, "source ads is only for Facebook comments. For Instagram or Facebook creative mapping use source ad_creatives after explicit advertising-account selection with an existing ads_read grant.");
  const path = kind === "message" ? `${account.parent_id || account.asset_id}/conversations` : `${account.asset_id}/${account.provider === "facebook" ? source === "ads" ? "ads_posts" : "feed" : "media"}`;
  const selected = json<{advertisingAccount?:{id:string;selectedAt:number}}>(account.validation).advertisingAccount;
  const scope = `inbox:${kind}:${source}${source === "ad_creatives" ? `:${selected?.id || "none"}:${selected?.selectedAt || 0}` : ""}`; const resumed = await resume(env, account, scope, options.cursor);
  const budget = readBudget(); const limit = options.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new HttpError(400, "limit must be an integer from 1 to 20.");
  let page: GraphObject;
  let creativeGaps: string[] = []; let creativeNext: {path:string;depth:number} | null = null;
  try {
    if (source === "ad_creatives") {
      const mapped = await (await import("./advertising")).adCreativeRoots(env, account, limit, budget, resumed?.[0]);
      page = { data: mapped.roots }; creativeGaps = mapped.gaps; creativeNext = mapped.next;
    } else page = await graph(token, resumed?.[0]?.path || path, resumed ? options.limit === undefined ? {} : { limit: String(limit) } : kind === "message" ? { platform: account.provider === "facebook" ? "messenger" : "instagram", fields: "id,updated_time", limit: String(limit) } : { fields: account.provider === "facebook" ? "id,message,created_time,permalink_url" : "id,caption,timestamp,permalink", limit: String(limit) }, "GET", budget);
  }
  catch (error) {
    if (source === "ad_creatives" && selected && error instanceof MetaProviderError && error.status === 429) {
      const paths = resumed || [{path:`/${GRAPH_VERSION}/${selected.id}/adcreatives`,depth:0}];
      return {threads:[],coverage:{complete:false,pages:0,gaps:["provider_ad_account_rate_limit_retry_saved_cursor_after_cooldown"],sourceUrl:null},nextCursor:await continuation(env,account,scope,paths,86400000),source:"selected_ad_account_creatives",ordering:"Discovery is paused by the provider rate limit; no empty-inbox verdict was obtained.",coverageDiagnostics:commentCoverageDiagnostics(account,source)};
    }
    if (source !== "ads" || !(error instanceof MetaProviderError)) throw error;
    throw new HttpError(error.status, `The selected Page's ads_posts read failed: HTTP ${error.providerStatus}, Graph ${error.providerCode ?? "unknown"}. No ad coverage was obtained. Check this granting person's Page advertising tasks and app access to ads_posts in Meta's Graph API Explorer. A feed result does not substitute for an ad-post result. ${error.status === 401 ? "Reconnect the expired Meta grant." : "Keep native Business Suite review until access is verified."}`);
  }
  if (!Array.isArray(page.data)) throw new HttpError(502, "Meta returned an unexpected collection.");
  const result = { rows: page.data as GraphObject[], coverage: { complete: true, pages: 1, gaps: [] as string[], sourceUrl: null } as Coverage };
  if (result.rows.length > 20) throw new HttpError(502, "Meta exceeded the requested root page size. Coverage is incomplete.");
  const next = (page.paging as {next?:string})?.next;
  const nextCursor = await continuation(env, account, scope, creativeNext ? [creativeNext] : next ? [{ path: next, depth: 0 }] : [], source === "ad_creatives" ? 86400000 : 900000);
  result.coverage.gaps.push(...creativeGaps);
  if (nextCursor) { result.coverage.gaps.push("more_root_pages_available_use_nextCursor"); result.coverage.complete = false; }
  if(kind==="comment"){result.coverage.gaps.push("root_list_only_comment_history_requires_separate_read");result.coverage.complete=false;}
  if (account.provider === "instagram" && kind === "message") { result.coverage.gaps.push("instagram_requests_inactive_over_30_days_are_not_returned"); result.coverage.complete = false; }
  if (account.provider === "instagram" && kind === "comment") { result.coverage.gaps.push("instagram_media_excludes_stories_and_is_limited_to_10000_recent_items"); result.coverage.complete = false; }
  if (kind === "comment") {
    result.coverage.gaps.push("promoted_and_unpublished_ad_comments_not_verified_use_meta_business_suite", "provider_root_order_is_not_a_complete_recent_comment_search");
  }
  const threads = [];
  for (const row of result.rows) {
    const preview: HistoryItem[] = []; let previewComplete = false; let previewError: string | null = null;
    if (kind === "comment") {
      try {
        const comments = await graph(token, `${String(row.id)}/${account.provider === "instagram" ? "ordered_comments" : "comments"}`, { fields: commentFields(account.provider), limit: "5", ...(account.provider === "facebook" ? { order: "reverse_chronological" } : {}) }, "GET", budget);
        if (!Array.isArray(comments.data)) throw new HttpError(502, "Meta returned an unexpected comment collection.");
        preview.push(...(comments.data as GraphObject[]).slice(0, 5).map(item));
        previewComplete = !(comments.paging as {next?:string})?.next;
      } catch (error) { previewError = error instanceof ReadLimit ? "read_budget_reached" : "comment_preview_unavailable"; result.coverage.gaps.push(previewError); }
    }
    const inbound = preview.filter(i => i.from !== "unknown" && i.from !== account.asset_id && i.from !== account.parent_id && i.at !== null);
    threads.push({ providerId: String(row.id), sourceUrl: typeof (row.permalink_url || row.permalink) === "string" ? String(row.permalink_url || row.permalink) : null,
      context: { text: String(row.caption || row.message || "").slice(0, 2000), at: item(row).at }, preview, previewComplete, previewError,
      lastInboundAt: inbound.length ? Math.max(...inbound.map(i => i.at!)) : null });
  }
  threads.sort((a, b) => (b.lastInboundAt || 0) - (a.lastInboundAt || 0));
  result.coverage.gaps = [...new Set(result.coverage.gaps)];
  return { threads, coverage: result.coverage, nextCursor, source: source === "ad_creatives" ? "selected_ad_account_creatives" : kind === "comment" ? account.provider === "facebook" ? source === "ads" ? "page_ads_posts" : "page_feed" : "instagram_media" : "conversations", ordering: "Observed incoming comments within this root page only; paginate and read each full thread. Instagram ordered_comments follows Instagram display order, not a complete recent-comment sort.", coverageDiagnostics: commentCoverageDiagnostics(account, source) };
}
export function commentCoverageDiagnostics(account: SocialAccount, source = "feed") {
  const scopes = json<string[]>(account.permissions);
  const selected = json<{advertisingAccount?:{id:string}}>(account.validation).advertisingAccount;
  return { rootSource: source === "ad_creatives" ? "selected_ad_account_creatives" : account.provider === "facebook" ? source === "ads" ? "page_ads_posts" : "page_feed" : "instagram_media",
    nativeSuiteParity: "not_established", missingCommentCause: "not_determined_do_not_infer_deleted_hidden_or_ad_only",
    commentCollection: account.provider === "instagram" ? "ordered_comments_may_include_multiple_ad_media" : "comments",
    adCreativeDiscovery: { configured: true, hasReadScope: scopes.includes("ads_read") || scopes.includes("ads_management"), verifiedAdAccount: !!selected, selectedAdAccountId: selected?.id || null,
      blockers: [...(!scopes.includes("ads_read") && !scopes.includes("ads_management") ? ["ads_read_or_ads_management_not_granted"] : []), ...(!selected ? ["no_verified_ad_account_selection"] : [])],
      ownerAction: selected && (scopes.includes("ads_read") || scopes.includes("ads_management")) ? "Advertising selection is configured. Continue source ad_creatives with its nextCursor and read each relevant full thread. Instagram ordered_comments can include multiple ad media; compare exact comment IDs and placement with Business Suite before claiming parity. No further consent or selection is currently requested." : "Identify the missing comment's exact placement and post/media permalink in Business Suite. With owner-authorised ads_read in the platform login configuration, obtain fresh consent through social_account_connect. Use social_asset_list with kind advertising on that owner-bound grant, then explicitly confirm social_asset_select provider advertising for the exact returned act_ ID and target accountId. Read source ad_creatives; runtime rechecks scope, grant identity, account access and each root's actual owner. Do not add scopes or select an account without owner approval." },
    incomingEvents: { instagram: account.provider === "instagram" ? "dashboard_comments_subscription_and_signed_delivery_not_verified_by_page_subscription" : "not_applicable", ownerAction: "For future Instagram comments, configure the platform app's Instagram comments webhook field and verify a signed delivery for this exact account. A subscription does not backfill historical comments." } };
}
function item(row: GraphObject): HistoryItem {
  const from = row.from as { id?: string; username?: string; name?: string } | undefined;
  const at = typeof row.created_time === "string" || typeof row.timestamp === "string" ? Date.parse(String(row.created_time || row.timestamp)) : NaN;
  return { id: String(row.id), text: String(row.message || row.text || ""), from: String(from?.id || "unknown"), ...(from?.username || from?.name || row.username ? { senderName: String(from?.username || from?.name || row.username) } : {}), at: Number.isFinite(at) ? at : null, attachments: Boolean(row.attachments || row.attachment) };
}
function commentFields(provider:string){return provider==="facebook"?"id,message,from,created_time,attachment,comment_count":"id,text,from,timestamp";}
async function commentContext(token:string,rootId:string,provider:string,budget?:ReadBudget){
  let root:GraphObject;
  try{root=await graph(token,rootId,{fields:provider==="facebook"?"id,message,from,created_time,can_comment":"id,caption,owner,timestamp"},"GET",budget);}
  catch(error){
    if(!(error instanceof MetaProviderError))throw error;
    if(provider==="facebook"&&error.providerReason==="unsupported_field:can_comment")root=await graph(token,rootId,{fields:"id,message,from,created_time"},"GET",budget);
    else if(provider==="instagram"&&error.providerReason==="unsupported_field:owner")root=await graph(token,rootId,{fields:"id,caption,timestamp"},"GET",budget);
    else throw error;
  }
  if(root.id!==rootId)throw new HttpError(403,"The comment root identity was not verified.");
  return {root,owned:provider==="facebook"?root.can_comment===true:true};
}
export async function readHistory(env: Env, account: SocialAccount, thread: Thread, options: ReadOptions = {}): Promise<History> {
  if (account.provider === "whatsapp") { if (options.cursor) throw new HttpError(400, "WhatsApp history cursors are unsupported."); return whatsappHistory(env, account, thread); }
  const token = await decrypt(account.token!, env.TOKEN_ENCRYPTION_KEY);
  const items: HistoryItem[] = []; const gaps: string[] = []; let pages = 0; let target = thread.target; let owned = true;
  let nextCursor: string | null = null;
  let ownership: RootOwnership | undefined; let replyAuthority: ReplyAuthority | undefined;
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
    const budget = readBudget(); const scope = `thread:${thread.id}:${account.provider === "instagram" ? "ordered_comments_user_token" : "comments"}`;
    const resumed = await resume(env, account, scope, options.cursor);
    const context = await commentContext(rootToken,thread.provider_id,account.provider,budget);
    const root=context.root;owned=context.owned;
    const owner = (account.provider === "facebook" ? root.from : root.owner) as {id?:string} | undefined;
    const ownerId = typeof owner?.id === "string" ? owner.id : null;
    ownership = { state: ownerId ? ownerId === account.asset_id ? "verified" : "different_asset" : "unverified", ownerId, source: account.provider === "facebook" ? "provider_post_from" : "provider_media_owner" };
    replyAuthority = account.provider === "facebook" ? { state: root.can_comment === true ? "verified" : root.can_comment === false ? "denied" : "unverified", reason: typeof root.can_comment === "boolean" ? "provider_can_comment" : "provider_can_comment_unavailable_no_write_verdict" } : { state: ownership.state === "verified" ? "verified" : "unverified", reason: ownership.state === "verified" ? "provider_media_owner_matches_selected_account" : "provider_media_owner_not_verified" };
    if (account.provider === "instagram" && ownership.state !== "verified") owned = false;
    if (ownership.state === "different_asset") owned = false;
    if (replyAuthority.state !== "verified") gaps.push("comment_reply_authority_unverified_or_denied");
    if (ownership.state === "different_asset") gaps.push("comment_root_belongs_to_different_asset");
    items.push({ ...item({ ...root, text: root.caption || root.message }), from: ownerId || "unknown", role: "post_context" });
    const work = resumed || [{ path: `${thread.provider_id}/${account.provider === "instagram" ? "ordered_comments" : "comments"}`, depth: 0 }]; const seen = new Set<string>();
    if (account.provider === "instagram") gaps.push("ordered_comments_parent_root_is_requested_context_not_verified_media_placement");
    if (resumed) gaps.push("continued_history_segment_not_a_complete_snapshot");
    while (work.length && pages < 12 && work.length <= 250) {
      const current = work.shift()!;
      if (seen.has(current.path)) { gaps.push("provider_pagination_cycle"); continue; }
      seen.add(current.path);
      let list: GraphObject;
      try { list = await graph(rootToken, current.path, { fields: commentFields(account.provider), limit: "20" }, "GET", budget); }
      catch (error) {
        if (!(error instanceof ReadLimit) && !pages) throw error;
        work.unshift(current); gaps.push(error instanceof ReadLimit ? "read_budget_reached" : "comment_page_unavailable_retry_cursor"); break;
      }
      if (!Array.isArray(list.data)) throw new HttpError(502, "Meta returned an unexpected comment collection.");
      pages++;
      const next = (list.paging as {next?:string})?.next;
      if (next) work.push({ path: next, depth: current.depth });
      for (const row of list.data as GraphObject[]) {
        const path = new URL(current.path, GRAPH).pathname;
        items.push({ ...item(row), parentId: path.split("/").at(-2) });
        if (account.provider === "facebook" && Number(row.comment_count) > 0) work.push({ path: `${String(row.id)}/comments`, depth: current.depth + 1 });
        if (account.provider === "instagram" && current.depth === 0) work.push({ path: `${String(row.id)}/replies`, depth: 1 });
      }
    }
    if (work.length) {
      gaps.push("reply_tree_page_limit_reached");
      if (work.length <= 250) nextCursor = await continuation(env, account, scope, work);
      else gaps.push("reply_tree_too_large_restart_in_native_provider");
    }
    if(account.provider==="instagram")gaps.push("instagram_native_suite_history_coverage_not_established");
  }
  items.sort((a, b) => (a.at || 0) - (b.at || 0) || a.id.localeCompare(b.id));
  const inbound = items.filter(i => i.role !== "post_context" && i.from !== "unknown" && (thread.kind === "message" ? i.from === target : i.from !== account.asset_id && i.from !== account.parent_id) && i.at).map(i => i.at!);
  return { items, target, owned, lastInboundAt: inbound.length ? Math.max(...inbound) : null,
    ...(thread.kind !== "message" ? { nextCursor, ownership, replyAuthority, ownedMeaning: "Legacy reply-authority gate, not proof of post authorship. See ownership and replyAuthority; account/global send gates still apply." } : {}), coverage: { complete: gaps.length === 0, pages, gaps: [...new Set(gaps)], sourceUrl: thread.source_url } };
}
export async function sendReply(env: Env, account: SocialAccount, thread: Thread, text: string) {
  if (account.provider === "whatsapp") return sendWhatsApp(env, account, thread, text);
  const token = await decrypt(account.token!, env.TOKEN_ENCRYPTION_KEY);
  if (thread.kind === "message") return graph(token, `${account.parent_id || account.asset_id}/messages`, { recipient: JSON.stringify({ id: thread.target }), messaging_type: "RESPONSE", message: JSON.stringify({ text }) }, "POST");
  return graph(token, `${thread.target}/${account.provider === "facebook" ? "comments" : "replies"}`, { message: text }, "POST");
}
