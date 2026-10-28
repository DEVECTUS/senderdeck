import { whatsAppTestReplyAllowed, productionSocialSendingEnabled } from "./whatsapp-test-sending";
import { HttpError } from "../auth";
import { decrypt, encrypt } from "../crypto";
import type { Env } from "../env";
import { graph, graphPages, inspectToken } from "./meta";
import { id, json, type SocialAccount, type Thread, type History, type HistoryItem } from "./model";
import { recordDelivery } from "./monitoring";

export const historyGap = "whatsapp_history_limited_to_retained_signed_webhooks";
const numeric = (value: string) => { if (!/^\d{1,32}$/.test(value)) throw new HttpError(400, "Invalid WhatsApp asset ID."); return value; };
export async function whatsappAssets(env: Env, token: string, wabaId: string) {
  numeric(wabaId);
  const details = await inspectToken(env, token);
  if (!["whatsapp_business_management", "whatsapp_business_messaging"].every(s => details.permissions.includes(s))) throw new HttpError(403, "Reconnect with WhatsApp management and messaging permissions.");
  const phones = await graphPages(token, `${wabaId}/phone_numbers`, { fields: "id,display_phone_number,verified_name" });
  if (!phones.coverage.complete) throw new HttpError(409, "WhatsApp phone discovery is incomplete.");
  return { details, assets: phones.rows.map(p => ({ provider: "whatsapp" as const, assetId: numeric(String(p.id)), parentId: wabaId, name: String(p.verified_name || p.display_phone_number || p.id), displayPhoneNumber: String(p.display_phone_number || ""), token, tasks: [] as string[] })) };
}
export async function validateWhatsApp(env: Env, account: SocialAccount) {
  if (!account.token || !account.parent_id) throw new HttpError(409, "Reconnect this WhatsApp Business number.");
  const token = await decrypt(account.token, env.TOKEN_ENCRYPTION_KEY);
  const coexistence = await env.DB.prepare("SELECT status FROM social_whatsapp_coexistence WHERE account_id=?").bind(account.id).first<{status:string}>();
  if (coexistence?.status === "offboarded" && !json<{coexistenceReconnect?:boolean}>(account.validation).coexistenceReconnect) throw new HttpError(403,"The phone app disconnected this Coexistence connection. Reconnect through Embedded Signup.");
  const { details, assets } = await whatsappAssets(env, token, account.parent_id);
  if (details.providerUserId !== account.provider_user_id || !assets.some(a => a.assetId === account.asset_id)) throw new HttpError(403, "WhatsApp number ownership could not be verified.");
  if (coexistence) {
    const registration=await graph(token,account.asset_id,{fields:"id,is_on_biz_app,platform_type"});
    if(registration.id!==account.asset_id||registration.is_on_biz_app!==true||registration.platform_type!=="CLOUD_API")throw new HttpError(409,"Meta no longer verifies simultaneous Business app and Cloud API use.");
  }
  const subscriptions = await graphPages(token, `${numeric(account.parent_id)}/subscribed_apps`, {});
  const webhook = subscriptions.coverage.complete && subscriptions.rows.some(row => (row.whatsapp_business_api_data as {id?:string})?.id === env.META_APP_ID);
  return { status: "connected", details, validation: { historyProbeVersion: 2, reads: { messages: true, comments: false } as Record<string, boolean>, tasks: [] as string[], probes: {} as Record<string, {state:"verified"|"unverified"|"failed";stage:string;reason:string}>, taskDiscovery: {source:"whatsapp_phone_numbers",state:"returned",reason:"verified_phone_membership"}, webhook, errors: webhook ? [] : ["webhook_subscription_unverified"], historyScope: historyGap } };
}
export async function whatsappHistory(env: Env, account: SocialAccount, thread: Thread): Promise<History> {
  if (thread.kind !== "message" || !/^\d{1,32}$/.test(thread.provider_id)) throw new HttpError(409, "WhatsApp supports customer message threads only.");
  const rows = (await env.DB.prepare("SELECT encrypted FROM social_whatsapp_messages WHERE account_id=? AND peer=? AND expires_at>? ORDER BY sent_at DESC,provider_id DESC LIMIT 201").bind(account.id, thread.provider_id, Date.now()).all<{encrypted:string}>()).results;
  const items: HistoryItem[] = [];
  for (const row of rows.slice(0, 200)) items.push(json<HistoryItem>(await decrypt(row.encrypted, env.TOKEN_ENCRYPTION_KEY)));
  items.reverse();
  const incoming = items.filter(i => i.from === thread.provider_id && i.at !== null && i.responseWindowEligible !== false);
  const coex = await env.DB.prepare("SELECT contacts_state,history_state,created_at FROM social_whatsapp_coexistence WHERE account_id=?").bind(account.id).first<{contacts_state:string;history_state:string;created_at:number}>();
  const queued = await env.DB.prepare("SELECT COUNT(*) AS count FROM social_queue WHERE account_id=? AND state IN ('pending','processing','failed')").bind(account.id).first<{count:number}>();
  const unresolved = await env.DB.prepare("SELECT id FROM social_threads WHERE account_id=? AND provider_id LIKE 'native-review:%' AND status!='resolved' LIMIT 1").bind(account.id).first();
  const syncPending = coex && (coex.contacts_state !== "received" || !["received","declined"].includes(coex.history_state));
  return { items, target: thread.provider_id, lastInboundAt: incoming.filter(i=>!coex||i.at!>=coex.created_at).length ? Math.max(...incoming.filter(i=>!coex||i.at!>=coex.created_at).map(i => i.at!)) : null,
    owned: account.status === "connected", coverage: { complete: false, pages: 1, sourceUrl: null, gaps: [historyGap, ...(unresolved ? ["unsupported_whatsapp_identity_requires_native_review"] : []), ...(syncPending ? ["coexistence_initial_sync_incomplete"] : []), ...((queued?.count||0)>0 ? ["whatsapp_webhook_processing_pending"] : []), ...(rows.length > 200 ? ["history_budget_exceeded"] : []), ...(!items.length ? ["no_retained_messages"] : [])] } };
}
async function messageExpiry(env: Env, account: SocialAccount, at: number) {
  const brand = await env.DB.prepare("SELECT profile FROM social_brands WHERE id=?").bind(account.brand_id).first<{profile:string}>();
  const days = brand ? json<{retentionDays:number}>(brand.profile).retentionDays : 30;
  return at + Math.max(1, Math.min(90, days)) * 86400000;
}
export async function storeWhatsAppMessage(env: Env, account: SocialAccount, peer: string, item: HistoryItem) {
  numeric(peer);
  const expiry = await messageExpiry(env, account, item.at || Date.now());
  if (expiry <= Date.now()) return;
  await env.DB.prepare("INSERT OR IGNORE INTO social_whatsapp_messages (account_id,provider_id,peer,sent_at,encrypted,expires_at) VALUES (?,?,?,?,?,?)").bind(account.id, item.id, peer, item.at, await encrypt(JSON.stringify(item), env.TOKEN_ENCRYPTION_KEY), expiry).run();
}
export async function receiveWhatsApp(env: Env, entry: {id?:string;time?:number;changes?:Array<{field?:string;value?:Record<string,unknown>}>}) {
  return (await import("./whatsapp-events")).queueWhatsApp(env, entry);
}
export async function sendWhatsApp(env: Env, account: SocialAccount, thread: Thread, text: string) {
  const history = await whatsappHistory(env, account, thread);
  if (thread.target !== history.target || !history.lastInboundAt || history.lastInboundAt > Date.now() || Date.now() - history.lastInboundAt >= 86400000) throw new HttpError(409, "WhatsApp's 24-hour response window is closed. Template sending is not supported.");
  const token = await decrypt(account.token!, env.TOKEN_ENCRYPTION_KEY);
  // Recheck expiry and the exact recipient immediately before the provider write.
  if (!productionSocialSendingEnabled(env) && !whatsAppTestReplyAllowed(env, account, thread.target)) throw new HttpError(409, "WhatsApp sending is disabled for this account or recipient.");
  const result = await graph(token, `${numeric(account.asset_id)}/messages`, { messaging_product: "whatsapp", recipient_type: "individual", to: numeric(thread.target), type: "text", text: JSON.stringify({ body: text, preview_url: false }) }, "POST");
  const messageId = (result.messages as Array<{id?:string}>)?.[0]?.id;
  if (!messageId) throw new HttpError(502, "WhatsApp did not confirm a message ID.");
  await storeWhatsAppMessage(env, account, thread.target, { id: messageId, from: account.asset_id, at: Date.now(), text, attachments: false });
  return { message_id: messageId, id: messageId };
}
