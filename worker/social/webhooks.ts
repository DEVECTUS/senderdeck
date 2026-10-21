import { HttpError } from "../auth";
import { decrypt, encrypt, sha256Base64Url } from "../crypto";
import type { Env } from "../env";
import { deleteLocalAccount, id, json, notice, type SocialAccount } from "./model";
import { reconcileAccount } from "./service";
import { recordDelivery } from "./monitoring";

const encoder = new TextEncoder();
export async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))), b => b.toString(16).padStart(2, "0")).join("");
}
export function equalSecret(a: string, b: string) {
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return mismatch === 0;
}
export async function limitedBody(request: Request, max = 262144) {
  if (Number(request.headers.get("content-length")) > max) throw new HttpError(413, "Request is too large.");
  const reader = request.body?.getReader(); if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.byteLength;
    if (size > max) { await reader.cancel(); throw new HttpError(413, "Request is too large."); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
export async function verifySignedRequest(secret: string, signed: string) {
  const parts = signed.split("."); if (parts.length !== 2) throw new HttpError(403, "Invalid provider signature.");
  const decode = (s: string) => atob(s.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  let signature: string; let value: { algorithm?: string; user_id?: string; issued_at?: number };
  try {
    signature = Array.from(decode(parts[0]), c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    value = JSON.parse(new TextDecoder().decode(Uint8Array.from(decode(parts[1]), c => c.charCodeAt(0))));
  } catch { throw new HttpError(403, "Invalid provider signature."); }
  if (!equalSecret(signature, await hmac(secret, parts[1])) || value.algorithm?.toUpperCase() !== "HMAC-SHA256" || !value.user_id || !value.issued_at || Math.abs(Date.now() / 1000 - value.issued_at) > 86400) throw new HttpError(403, "Invalid or expired provider signature.");
  return value.user_id;
}
type Event = { sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; message?: { mid?: string; is_echo?: boolean; text?: string }; field?: string; value?: Record<string, unknown> };
export async function receiveMeta(request: Request, env: Env, defer: (p: Promise<unknown>) => void) {
  if (!env.META_APP_SECRET) throw new HttpError(503, "Meta webhooks are not configured.");
  const url = new URL(request.url);
  if (request.method === "GET") {
    const verify = url.searchParams.get("hub.verify_token") || "";
    if (url.searchParams.get("hub.mode") !== "subscribe" || !env.META_WEBHOOK_VERIFY_TOKEN || !equalSecret(verify, env.META_WEBHOOK_VERIFY_TOKEN)) throw new HttpError(403, "Webhook verification failed.");
    return new Response(url.searchParams.get("hub.challenge") || "", { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
  }
  if (request.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const raw = await limitedBody(request);
  const signature = request.headers.get("x-hub-signature-256") || "";
  if (!equalSecret(signature, `sha256=${await hmac(env.META_APP_SECRET, raw)}`)) throw new HttpError(403, "Webhook signature failed.");
  let payload: { object?: string; entry?: Array<{ id?: string; messaging?: Event[]; changes?: Event[] }> };
  try { payload = JSON.parse(raw); } catch { throw new HttpError(400, "Invalid webhook payload."); }
  if (!Array.isArray(payload.entry) || payload.entry.length > 100) throw new HttpError(400, "Invalid webhook entries.");
  for (const entry of payload.entry) {
    if (!entry.id) continue;
    const provider = payload.object === "instagram" ? "instagram" : payload.object === "page" ? "facebook" : null;
    if (!provider) continue; // Unvalidated application integration event shapes never change customer state.
    const accounts = (await env.DB.prepare("SELECT * FROM social_accounts WHERE provider=? AND asset_id=? AND status!='revoked'").bind(provider, entry.id).all<SocialAccount>()).results;
    const events = [...(entry.messaging || []), ...(entry.changes || [])];
    if (events.length > 200) throw new HttpError(400, "Too many webhook events.");
    for (const account of accounts) for (const event of events) {
      if (event.message?.is_echo || event.sender?.id === account.asset_id) continue;
      if (!event.message && !["feed", "comments", "mentions"].includes(event.field || "")) continue;
      if (event.field === "feed" && event.value?.item !== "comment") continue;
      if (event.message || event.field === "comments" || event.field === "feed") await recordDelivery(env, account.id, event.message ? "messages" : "comments");
      const serialised = JSON.stringify(event);
      const eventId = await sha256Base64Url(`${account.id}:${serialised}`);
      await env.DB.prepare("INSERT OR IGNORE INTO social_queue (id,account_id,encrypted,state,created_at,expires_at) VALUES (?,?,?,'pending',?,?)").bind(eventId, account.id, await encrypt(serialised, env.TOKEN_ENCRYPTION_KEY), Date.now(), Date.now() + 86400000).run();
    }
  }
  defer(processQueue(env));
  return Response.json({ received: true });
}
export async function processQueue(env: Env) {
  // A stalled claim is visible and retried. Processing only creates deduplicated metadata/notices,
  // never provider sends, so a worker interruption cannot duplicate a reply.
  await env.DB.prepare("UPDATE social_queue SET state='pending' WHERE state='processing' AND claimed_at<? AND attempts<5").bind(Date.now() - 300000).run();
  const pending = (await env.DB.prepare("SELECT id FROM social_queue WHERE state='pending' AND expires_at>? ORDER BY created_at LIMIT 40").bind(Date.now()).all<{id: string}>()).results;
  for (const row of pending) {
    const event = await env.DB.prepare("UPDATE social_queue SET state='processing',attempts=attempts+1,claimed_at=? WHERE id=? AND state='pending' RETURNING *").bind(Date.now(), row.id).first<{id: string; account_id: string; encrypted: string; attempts: number}>();
    if (!event) continue;
    try {
      const payload = json<Event>(await decrypt(event.encrypted, env.TOKEN_ENCRYPTION_KEY));
      const text = String(payload.message?.text || payload.value?.message || payload.value?.text || "").toLowerCase();
      const account = await env.DB.prepare("SELECT a.*,b.profile FROM social_accounts a JOIN social_brands b ON b.id=a.brand_id WHERE a.id=?").bind(event.account_id).first<SocialAccount & {profile: string}>();
      if (account) {
        const profile = json<{escalationTerms: string[]}>(account.profile);
        const sensitive = profile.escalationTerms.some(term => text.includes(term.toLowerCase()));
        const reason = sensitive ? "sensitive_enquiry_requires_owner" : payload.message ? "new_inbound_message_requires_review" : payload.field === "mentions" ? "mention_requires_native_review" : "new_comment_requires_review";
        await notice(env, account.id, reason, `event:${event.id}`);
        // Keep minimal enquiry metadata, not a sender name or message body. The provider
        // conversation ID is discovered on reconciliation before any draft may be created.
        const providerId = String(payload.message?.mid || payload.value?.comment_id || payload.value?.id || event.id);
        const kind = payload.message ? "message" : payload.field === "mentions" ? "mention" : "comment";
        await env.DB.prepare("INSERT OR IGNORE INTO social_activity (id,brand_id,actor,action,object_id,detail,created_at) VALUES (?,?, 'webhook',?,?,?,?)").bind(event.id, account.brand_id, sensitive ? "enquiry_escalated" : "enquiry_observed", account.id, kind, Date.now()).run();
      }
      await env.DB.prepare("UPDATE social_queue SET state='done',encrypted='' WHERE id=?").bind(event.id).run();
    } catch {
      await env.DB.prepare("UPDATE social_queue SET state=?,error='processing_failed' WHERE id=?").bind(event.attempts >= 5 ? "failed" : "pending", event.id).run();
      await notice(env, event.account_id, "webhook_processing_failed", `processing:${event.id}`);
    }
  }
}
export async function maintenance(env: Env) {
  await processQueue(env);
  const at = Date.now();
  const stalled = (await env.DB.prepare("SELECT d.id,t.account_id FROM social_drafts d JOIN social_threads t ON t.id=d.thread_id WHERE d.state='sending' AND d.approval_expires_at<?").bind(at - 300000).all<{id:string;account_id:string}>()).results;
  for (const draft of stalled) {
    await env.DB.prepare("UPDATE social_drafts SET state='delivery_unknown' WHERE id=? AND state='sending'").bind(draft.id).run();
    await notice(env, draft.account_id, "delivery_unknown_check_native_provider_before_any_retry", `delivery:${draft.id}`);
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM social_oauth WHERE expires_at<?").bind(at),
    env.DB.prepare("DELETE FROM social_grants WHERE expires_at<?").bind(at),
    env.DB.prepare("DELETE FROM social_snapshots WHERE expires_at<?").bind(at),
    env.DB.prepare("DELETE FROM social_drafts WHERE expires_at<? AND state!='sending'").bind(at),
    env.DB.prepare("UPDATE social_queue SET encrypted='',state=CASE WHEN state='done' THEN 'done' ELSE 'expired' END WHERE expires_at<?").bind(at),
    env.DB.prepare("DELETE FROM social_queue WHERE expires_at<?").bind(at - 30 * 86400000),
  ]);
  const accounts = (await env.DB.prepare("SELECT * FROM social_accounts WHERE provider IN ('facebook','instagram') AND status!='revoked'").all<SocialAccount>()).results;
  let reconciled = 0;
  for (const account of accounts) {
    const settings = json<{ enabled?: boolean; intervalMinutes?: number }>(account.monitoring);
    const brand = await env.DB.prepare("SELECT profile FROM social_brands WHERE id=?").bind(account.brand_id).first<{profile: string}>();
    const days = brand ? json<{retentionDays: number}>(brand.profile).retentionDays : 30;
    const cutoff = at - days * 86400000;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM social_threads WHERE account_id=? AND updated_at<?").bind(account.id, cutoff),
      env.DB.prepare("DELETE FROM social_notices WHERE account_id=? AND created_at<?").bind(account.id, cutoff),
      env.DB.prepare("DELETE FROM social_activity WHERE brand_id=? AND created_at<?").bind(account.brand_id, cutoff),
      env.DB.prepare("DELETE FROM social_identity_links WHERE brand_id=? AND created_at<?").bind(account.brand_id, cutoff),
    ]);
    if (!settings.enabled || env.SOCIAL_SCHEDULER_ENABLED !== "true" || at - (account.last_reconciled_at || 0) < Math.max(10, settings.intervalMinutes || 10) * 60000) continue;
    try { await reconcileAccount(env, account); reconciled++; }
    catch { await notice(env, account.id, "scheduled_reconciliation_failed", "schedule:failed"); }
  }
  await env.DB.prepare("INSERT INTO social_runtime (key,value) VALUES ('maintenance',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(Date.now()).run();
  return { processed: true, reconciled, at: new Date(at).toISOString() };
}
export async function runHostedMaintenance(env: Env, source: "operator"|"github_schedule"|"github_dispatch"|"native_cron"|"external") {
  if (env.SOCIAL_SCHEDULER_ENABLED !== "true") throw new HttpError(409, "Hosted maintenance is not configured.");
  const lease=Date.now()+300000;
  const claim=await env.DB.prepare("INSERT INTO social_runtime (key,value) VALUES ('maintenance_lease',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE social_runtime.value<? RETURNING value").bind(lease,Date.now()).first();
  if (!claim) throw new HttpError(409, "Hosted maintenance is already running. Refresh readiness shortly.");
  try {
    const result=await maintenance(env);
    if (source === "github_schedule" || source === "native_cron") await env.DB.prepare("INSERT INTO social_runtime (key,value) VALUES ('maintenance_scheduled',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(Date.now()).run();
    return {...result,source};
  } finally {
    await env.DB.prepare("DELETE FROM social_runtime WHERE key='maintenance_lease' AND value=?").bind(lease).run();
  }
}
export async function metaDeletion(request: Request, env: Env) {
  if (!env.META_APP_SECRET) throw new HttpError(503, "Meta is not configured.");
  if (request.method !== "POST") throw new HttpError(405, "Method not allowed.");
  const form = new URLSearchParams(await limitedBody(request));
  const user = await verifySignedRequest(env.META_APP_SECRET, form.get("signed_request") || "");
  const accounts = (await env.DB.prepare("SELECT id,brand_id FROM social_accounts WHERE provider_user_id=? AND provider IN ('facebook','instagram')").bind(user).all<{id: string;brand_id:string}>()).results;
  for (const account of accounts) await deleteLocalAccount(env, account);
  // Temporary selection grants are encrypted; inspect only those for the affected provider user.
  const grants = (await env.DB.prepare("SELECT id,encrypted FROM social_grants").all<{id: string;encrypted: string}>()).results;
  for (const grant of grants) {
    const body = json<{providerUserId: string}>(await decrypt(grant.encrypted, env.TOKEN_ENCRYPTION_KEY));
    if (body.providerUserId === user) await env.DB.prepare("DELETE FROM social_grants WHERE id=?").bind(grant.id).run();
  }
  const code = id();
  return Response.json({ url: `${new URL(request.url).origin}/privacy#social-data-deletion`, confirmation_code: code });
}
