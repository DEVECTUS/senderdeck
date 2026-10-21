import { HttpError } from "../auth";
import { decrypt } from "../crypto";
import type { Env } from "../env";
import { json, type SocialAccount, type History, type HistoryItem, type Coverage, type Thread } from "./model";

export const GRAPH_VERSION = "v26.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}/`;
type GraphObject = Record<string, unknown>;
export class MetaProviderError extends HttpError {
  constructor(status:number,message:string,public providerStatus:number,public providerCode:number|null,public providerReason:string|null=null){super(status,message);}
}
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
    const error = data.error as { code?: number;message?:unknown } | undefined;
    const status = error?.code === 190 ? 401 : response.status === 429 || [4, 17, 32, 613].includes(error?.code || 0) ? 429 : 502;
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
export async function inspectToken(env: Env, token: string) {
  const raw = await graph(`${env.META_APP_ID}|${env.META_APP_SECRET}`, "debug_token", { input_token: token });
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
  const live = v.historyProbeVersion===1 && account.status === "connected" && !!account.validated_at && Date.now() - account.validated_at < 3600000 && (!account.expires_at || account.expires_at > Date.now());
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
  const current = await discover(env,userToken);
  const selected = current.candidates.find(asset=>asset.provider===account.provider&&asset.assetId===account.asset_id&&asset.parentId===(account.parent_id||account.asset_id));
  if (!selected) throw new HttpError(403, "This asset is no longer verified for the granting identity.");
  const tasks = selected.tasks;
  const asset = await graph(token, account.asset_id, { fields: account.provider === "facebook" ? "id,name" : "id,username" });
  if (asset.id !== account.asset_id) throw new HttpError(403, "The selected business asset was not verified.");
  const reads: Record<string, boolean> = {}; const errors: string[] = [];
  for (const kind of ["messages", "comments"]) {
    try {
      const path = kind === "messages" ? `${account.parent_id || account.asset_id}/conversations` : `${account.asset_id}/${account.provider === "facebook" ? "feed" : "media"}`;
      const readToken = kind === "comments" && account.provider === "instagram" && account.user_token ? await decrypt(account.user_token, env.TOKEN_ENCRYPTION_KEY) : token;
      const roots=await graph(readToken, path, kind === "messages" ? { platform: account.provider === "facebook" ? "messenger" : "instagram", limit: "1" } : { limit: "1",fields:"id" });
      if(!Array.isArray(roots.data))throw new HttpError(502,"Provider returned an unexpected root collection.");
      reads[kind==="messages"?"messageRoots":"commentRoots"]=true;
      const first=roots.data.find((row:unknown)=>row&&typeof row==="object"&&typeof (row as GraphObject).id==="string") as GraphObject|undefined;
      if(!first)throw new HttpError(409,"No sample root was returned to verify history access.");
      if(kind==="messages"){
        const context=await graph(token,String(first.id),{fields:"id,participants,is_owner"});
        if(context.id!==first.id)throw new HttpError(403,"The message root identity was not verified.");
        const messages=await graph(token,`${first.id}/messages`,{fields:"id",limit:"1"});
        if(!Array.isArray(messages.data))throw new HttpError(502,"Provider returned an unexpected message collection.");
        const message=messages.data[0] as GraphObject|undefined;
        if(typeof message?.id==="string")await graph(token,message.id,{fields:"id,message,from,created_time,attachments"});
      }else{
        const context=await commentContext(readToken,String(first.id),account.provider);
        if(!context.owned)errors.push("comment_write_authority_unverified");
        const comments=await graph(token,`${first.id}/comments`,{fields:commentFields(account.provider),limit:"1"});
        if(!Array.isArray(comments.data))throw new HttpError(502,"Provider returned an unexpected comment collection.");
        const comment=comments.data[0] as GraphObject|undefined;
        if(typeof comment?.id==="string"&&(account.provider==="instagram"||Number(comment.comment_count)>0)){
          const replies=await graph(token,`${comment.id}/${account.provider==="facebook"?"comments":"replies"}`,{fields:commentFields(account.provider),limit:"1"});
          if(!Array.isArray(replies.data))throw new HttpError(502,"Provider returned an unexpected reply collection.");
        }
      }
      reads[kind] = true;
    } catch(error) { reads[kind] = false; errors.push(`${kind}_history_probe_failed${error instanceof MetaProviderError?`:http_${error.providerStatus}:graph_${error.providerCode??"unknown"}:${error.providerReason||"provider_denied"}`:""}`); }
  }
  const previous = json<{ tasks?: string[]; webhook?: boolean }>(account.validation);
  let webhook = false;
  try {
    const subscriptions = await graphPages(token, `${account.parent_id || account.asset_id}/subscribed_apps`, {fields: "id,subscribed_fields"});
    const app = subscriptions.rows.find(row => row.id === env.META_APP_ID);
    const fields = Array.isArray(app?.subscribed_fields) ? app.subscribed_fields as string[] : [];
    webhook = subscriptions.coverage.complete && fields.includes("messages") && fields.includes(account.provider === "facebook" ? "feed" : "comments");
  } catch { errors.push("webhook_subscription_unverified"); }
  return { token, details: { ...details, permissions: details.permissions.filter(scope => granting.permissions.includes(scope)) }, validation: { ...previous, historyProbeVersion:1, historyProbeScope:"one_returned_root_not_complete_native_history", tasks, reads, errors, webhook }, status: reads.messages||reads.comments ? "connected" : "limited" };
}
export async function inbox(env: Env, account: SocialAccount, kind: "message" | "comment") {
  const caps = capabilities(env, account);
  if ((kind === "message" ? caps.messages : caps.comments) !== "available") throw new HttpError(409, "This account capability is unavailable or needs live validation.");
  const token = await decrypt(kind === "comment" && account.provider === "instagram" ? account.user_token! : account.token!, env.TOKEN_ENCRYPTION_KEY);
  const path = kind === "message" ? `${account.parent_id || account.asset_id}/conversations` : `${account.asset_id}/${account.provider === "facebook" ? "feed" : "media"}`;
  const result = await graphPages(token, path, kind === "message" ? { platform: account.provider === "facebook" ? "messenger" : "instagram", fields: "id,updated_time" } : { fields: account.provider === "facebook" ? "id,permalink_url" : "id,permalink" });
  if(kind==="comment"){result.coverage.gaps.push("root_list_only_comment_history_requires_separate_read");result.coverage.complete=false;}
  if (account.provider === "instagram" && kind === "message") { result.coverage.gaps.push("instagram_requests_inactive_over_30_days_are_not_returned"); result.coverage.complete = false; }
  if (account.provider === "instagram" && kind === "comment") { result.coverage.gaps.push("instagram_media_excludes_stories_and_is_limited_to_10000_recent_items"); result.coverage.complete = false; }
  return { threads: result.rows.map(r => ({ providerId: String(r.id), sourceUrl: typeof (r.permalink_url || r.permalink) === "string" ? String(r.permalink_url || r.permalink) : null })), coverage: result.coverage };
}
function item(row: GraphObject): HistoryItem {
  const from = row.from as { id?: string } | undefined;
  const at = typeof row.created_time === "string" || typeof row.timestamp === "string" ? Date.parse(String(row.created_time || row.timestamp)) : NaN;
  return { id: String(row.id), text: String(row.message || row.text || ""), from: String(from?.id || "unknown"), at: Number.isFinite(at) ? at : null, attachments: Boolean(row.attachments || row.attachment) };
}
function commentFields(provider:string){return provider==="facebook"?"id,message,from,created_time,attachment,comment_count":"id,text,from,timestamp";}
async function commentContext(token:string,rootId:string,provider:string){
  let root:GraphObject;
  try{root=await graph(token,rootId,{fields:provider==="facebook"?"id,message,created_time,can_comment":"id,caption,timestamp"});}
  catch(error){
    if(provider!=="facebook"||!(error instanceof MetaProviderError)||error.providerReason!=="unsupported_field:can_comment")throw error;
    root=await graph(token,rootId,{fields:"id,message,created_time"});
  }
  if(root.id!==rootId)throw new HttpError(403,"The comment root identity was not verified.");
  return {root,owned:provider==="facebook"?root.can_comment===true:true};
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
    const context = await commentContext(rootToken,thread.provider_id,account.provider);
    const root=context.root;owned=context.owned;
    items.push(item({ ...root, text: root.caption || root.message }));
    const work = [{ path: `${thread.provider_id}/comments`, depth: 0 }]; const seen = new Set<string>();
    while (work.length && pages < 100) {
      const current = work.shift()!;
      if (seen.has(current.path)) continue;
      seen.add(current.path);
      const list = await graphPages(token, current.path, { fields: commentFields(account.provider) }, Math.max(1, 100 - pages));
      pages += list.coverage.pages; gaps.push(...list.coverage.gaps);
      for (const row of list.rows) {
        items.push(item(row));
        if (account.provider === "facebook" && Number(row.comment_count) > 0) work.push({ path: `${String(row.id)}/comments`, depth: current.depth + 1 });
        if (account.provider === "instagram" && current.depth === 0) work.push({ path: `${String(row.id)}/replies`, depth: 1 });
      }
    }
    if (work.length) gaps.push("reply_tree_page_limit_reached");
    if(account.provider==="instagram")gaps.push("instagram_native_suite_history_coverage_not_established");
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
