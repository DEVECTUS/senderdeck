import { HttpError } from "../auth";
import { decrypt, encrypt, randomBase64Url, sha256Base64Url } from "../crypto";
import type { Env } from "../env";
import { accountFor, admins, audit, brandFor, id, str, type SocialAccount } from "./model";
import { graph, graphPages, GRAPH_VERSION } from "./meta";
import { whatsappAssets } from "./whatsapp";

export const coexistenceFields = ["messages", "account_update", "history", "smb_app_state_sync", "smb_message_echoes"];
export interface CoexistenceState {
  account_id: string; phone: string; status: string; contacts_state: string; history_state: string;
  contacts_request_id: string | null; history_request_id: string | null; history_progress: number;
  created_at: number; sync_deadline: number; updated_at: number;
}
export function coexistenceSetup(env: Env) {
  return { configured: !!(env.META_APP_ID && env.META_APP_SECRET && env.WHATSAPP_COEXISTENCE_CONFIG_ID),
    appId: env.META_APP_ID || null, configId: env.WHATSAPP_COEXISTENCE_CONFIG_ID || null, graphVersion: GRAPH_VERSION,
    embeddedSignupVersion: "v4", providerEligibility: "must_be_verified_in_meta", requiredWebhookFields: coexistenceFields,
    note: "Use a separate WhatsApp Embedded Signup configuration. A configuration ID does not establish Tech Provider approval or phone eligibility." };
}
export function businessPhone(value: unknown) {
  const phone = str(value, "business phone number", 40).replace(/[ +().-]/g, "");
  if (!/^[1-9]\d{6,14}$/.test(phone)) throw new HttpError(400, "Enter the business phone number with its country code.");
  return phone;
}
export async function startCoexistence(env: Env, user: string, brandId: string, phone: unknown, confirmed: unknown) {
  await brandFor(env, user, brandId, admins);
  if (confirmed !== true) throw new HttpError(400, "Confirm connecting the existing Business app and requesting the permitted initial synchronization.");
  const setup = coexistenceSetup(env);
  if (!setup.configured) throw new HttpError(409, "Coexistence needs approved Meta Tech Provider access and a separate Embedded Signup configuration. The existing phone app has not been changed.");
  await verifyCoexistenceWebhooks(env);
  const expected = businessPhone(phone), state = randomBase64Url();
  await env.DB.prepare("INSERT INTO social_oauth (hash,brand_id,user_id,redirect_uri,expires_at) VALUES (?,?,?,?,?)")
    .bind(await sha256Base64Url(state), brandId, user, `coexistence:${expected}`, Date.now() + 600000).run();
  return { ...setup, state, expectedPhone: expected, expiresInSeconds: 600 };
}
export async function completeCoexistence(env: Env, user: string, args: Record<string, unknown>) {
  if (!coexistenceSetup(env).configured) throw new HttpError(409,"Coexistence is not configured.");
  const brandId = str(args.brandId, "brandId");
  await brandFor(env, user, brandId, admins);
  if (args.event !== "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") throw new HttpError(400, "Only the Business app Coexistence completion event is accepted. No migration or phone registration is performed.");
  const wabaId = str(args.wabaId, "WhatsApp Business Account ID");
  if (!/^\d{1,32}$/.test(wabaId)) throw new HttpError(400, "Invalid WhatsApp Business Account ID.");
  await verifyCoexistenceWebhooks(env);
  const code = str(args.code, "authorization code", 4096);
  const state = str(args.state, "onboarding state", 1000);
  // Atomic one-use claim before code exchange; a failed/uncertain exchange needs
  // a fresh user flow, never reuse of an authorization code.
  const row = await env.DB.prepare("DELETE FROM social_oauth WHERE hash=? AND user_id=? AND brand_id=? AND redirect_uri LIKE 'coexistence:%' AND expires_at>? RETURNING redirect_uri")
    .bind(await sha256Base64Url(state), user, brandId, Date.now()).first<{redirect_uri:string}>();
  if (!row) throw new HttpError(409, "This onboarding session expired, was consumed or belongs to another user/brand. Restart Coexistence.");
  const expected = row.redirect_uri.slice("coexistence:".length);
  const exchange = await graph("", "oauth/access_token", {client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET!, code}, "POST");
  if (typeof exchange.access_token !== "string") throw new HttpError(502, "Meta did not return a connection token.");
  const token = exchange.access_token;
  const discovery = await whatsappAssets(env, token, wabaId);
  const matches = discovery.assets.filter(a => a.displayPhoneNumber.replace(/\D/g, "") === expected);
  if (matches.length !== 1) throw new HttpError(403, "The selected WhatsApp account does not contain the exact phone number you chose. No other number was connected.");
  const phoneId = matches[0].assetId;
  const live = await graph(token, phoneId, {fields:"id,is_on_biz_app,platform_type"});
  if (live.id !== phoneId || live.is_on_biz_app !== true || live.platform_type !== "CLOUD_API") throw new HttpError(409, "Meta has not verified simultaneous Business app and Cloud API use. No register, deregister or migration operation was attempted.");
  const existing = await env.DB.prepare("SELECT c.account_id,c.status FROM social_whatsapp_coexistence c JOIN social_accounts a ON a.id=c.account_id WHERE a.provider='whatsapp' AND a.asset_id=? AND a.brand_id=?").bind(phoneId, brandId).first<{account_id:string;status:string}>();
  if (existing && existing.status !== "offboarded") throw new HttpError(409, "This number already has a Coexistence setup record. Review its sync status instead of repeating one-time sync requests.");
  const grantId = id();
  await env.DB.prepare("INSERT INTO social_grants (id,brand_id,user_id,encrypted,expires_at) VALUES (?,?,?,?,?)")
    .bind(grantId, brandId, user, await encrypt(JSON.stringify({...discovery.details, userToken: token, candidates:[]}), env.TOKEN_ENCRYPTION_KEY), Date.now()+600000).run();
  const {selectAsset} = await import("./oauth");
  const selected = await selectAsset(env, user, brandId, grantId, "whatsapp", phoneId, wabaId, true);
  const at = Date.now();
  await env.DB.prepare("INSERT INTO social_whatsapp_coexistence (account_id,phone,status,contacts_state,history_state,history_progress,created_at,sync_deadline,updated_at) VALUES (?,?,'onboarding','not_requested','not_requested',0,?,?,?) ON CONFLICT(account_id) DO UPDATE SET phone=excluded.phone,status='onboarding',contacts_state='not_requested',history_state='not_requested',contacts_request_id=NULL,history_request_id=NULL,history_progress=0,created_at=excluded.created_at,sync_deadline=excluded.sync_deadline,updated_at=excluded.updated_at WHERE social_whatsapp_coexistence.status='offboarded'")
    .bind(selected.accountId, expected, at, at+86400000, at).run();
  await audit(env, brandId, user, "whatsapp_coexistence_connected", selected.accountId);
  const {account} = await accountFor(env, user, brandId, selected.accountId, admins);
  try {
    await subscribeWhatsApp(env, account, user);
    await requestInitialSync(env, account);
  } catch {
    await env.DB.prepare("UPDATE social_whatsapp_coexistence SET status='needs_review',updated_at=? WHERE account_id=? AND status!='offboarded'").bind(Date.now(), account.id).run();
  }
  return {accountId: account.id, ...await coexistenceStatus(env, user, brandId, account.id), phoneAppPreserved:true, sentMessages:false};
}
export async function subscribeWhatsApp(env: Env, account: SocialAccount, user: string) {
  if (account.provider !== "whatsapp" || !account.token || !account.parent_id) throw new HttpError(409, "Select a connected WhatsApp number.");
  const token = await decrypt(account.token, env.TOKEN_ENCRYPTION_KEY);
  const discovery = await whatsappAssets(env, token, account.parent_id);
  if (discovery.details.providerUserId !== account.provider_user_id || !discovery.assets.some(a=>a.assetId===account.asset_id)) throw new HttpError(403, "The current grant no longer verifies this selected number.");
  const result = await graph(token, `${account.parent_id}/subscribed_apps`, {}, "POST");
  if (result.success !== true) throw new HttpError(502, "Meta did not confirm the WhatsApp account subscription.");
  const {validateWhatsApp} = await import("./whatsapp");
  const current = await validateWhatsApp(env, account);
  if (!current.validation.webhook) throw new HttpError(409, "WhatsApp subscription readback was not verified.");
  await env.DB.prepare("UPDATE social_accounts SET validation=?,validated_at=?,permissions=?,expires_at=?,status=? WHERE id=?")
    .bind(JSON.stringify(current.validation), Date.now(), JSON.stringify(current.details.permissions), current.details.expiresAt, current.status, account.id).run();
  await audit(env, account.brand_id, user, "whatsapp_webhook_subscribed", account.id);
  return {accountId:account.id,subscriptionVerified:true,deliveryVerified:false};
}
export async function requestInitialSync(env: Env, account: SocialAccount) {
  const token = await decrypt(account.token!, env.TOKEN_ENCRYPTION_KEY);
  for (const type of ["contacts", "history"] as const) {
    const column = `${type}_state`, requestColumn = `${type}_request_id`;
    const claimed = await env.DB.prepare(`UPDATE social_whatsapp_coexistence SET ${column}='requesting',updated_at=? WHERE account_id=? AND ${column}='not_requested' AND status!='offboarded' AND sync_deadline>? RETURNING account_id`).bind(Date.now(),account.id,Date.now()).first();
    if (!claimed) continue;
    try {
      const result = await graph(token, `${account.asset_id}/smb_app_data`, {messaging_product:"whatsapp",sync_type:type === "contacts" ? "smb_app_state_sync" : "history"}, "POST");
      if (typeof result.request_id !== "string") throw new Error("Sync was not acknowledged.");
      await env.DB.prepare(`UPDATE social_whatsapp_coexistence SET ${column}=CASE WHEN ${column}='requesting' THEN 'requested' ELSE ${column} END,${requestColumn}=?,updated_at=? WHERE account_id=?`).bind(result.request_id,Date.now(),account.id).run();
    } catch {
      await env.DB.prepare(`UPDATE social_whatsapp_coexistence SET ${column}='delivery_unknown',status='needs_review',updated_at=? WHERE account_id=? AND ${column}='requesting'`).bind(Date.now(),account.id).run();
      // SMB synchronization is one-time. A lost response is never retried.
    }
  }
  await env.DB.prepare("UPDATE social_whatsapp_coexistence SET status='syncing',updated_at=? WHERE account_id=? AND status='onboarding'").bind(Date.now(),account.id).run();
}
export async function coexistenceStatus(env: Env, user: string, brandId: string, accountId: string) {
  await accountFor(env, user, brandId, accountId);
  const state = await env.DB.prepare("SELECT * FROM social_whatsapp_coexistence WHERE account_id=?").bind(accountId).first<CoexistenceState>();
  const queued = await env.DB.prepare("SELECT COUNT(*) AS count FROM social_queue WHERE account_id=? AND state IN ('pending','processing','failed')").bind(accountId).first<{count:number}>();
  return {coexistence:state,queuedEvents:queued?.count||0,completeNativeHistory:false,
    note:"Sync request acceptance is not completion. Keep WhatsApp Business open. A declined history share is respected; retained history and unsupported messages remain explicit review limits."};
}

export async function verifyCoexistenceWebhooks(env:Env) {
  const subscriptions=await graphPages(`${env.META_APP_ID}|${env.META_APP_SECRET}`,`${env.META_APP_ID}/subscriptions`);
  const app=subscriptions.rows.find(row=>row.object==="whatsapp_business_account");
  const fields=Array.isArray(app?.fields)?app.fields.map(f=>typeof f==="string"?f:(f as {name?:string})?.name):[];
  const callback=`${(env.SOCIAL_PUBLIC_ORIGIN||"https://senderdeck.devectus.com.au").replace(/\/$/,"")}/api/social/webhooks/meta`;
  if(!subscriptions.coverage.complete||app?.active!==true||app.callback_url!==callback||!coexistenceFields.every(f=>fields.includes(f)))throw new HttpError(409,"Configure and verify all five Coexistence webhook fields on the SenderDeck callback before onboarding. No phone registration was changed.");
}

export async function resumeCoexistence(env:Env,user:string,brandId:string,accountId:string,confirmed:unknown) {
  const {account}=await accountFor(env,user,brandId,accountId,admins);
  if(confirmed!==true)throw new HttpError(400,"Confirm repairing this subscription and starting only sync steps that have never been requested.");
  const state=await env.DB.prepare("SELECT * FROM social_whatsapp_coexistence WHERE account_id=?").bind(account.id).first<CoexistenceState>();
  if(!state||state.status==="offboarded"||state.sync_deadline<=Date.now())throw new HttpError(409,"This Coexistence sync window is unavailable or expired. Review Meta's state; SenderDeck will not offboard or re-register the phone.");
  await verifyCoexistenceWebhooks(env);
  await subscribeWhatsApp(env,account,user);
  await requestInitialSync(env,account);
  await audit(env,brandId,user,"whatsapp_coexistence_sync_resumed",account.id);
  return {accountId:account.id,...await coexistenceStatus(env,user,brandId,account.id)};
}
