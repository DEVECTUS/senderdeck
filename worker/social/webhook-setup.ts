import { HttpError } from "../auth";
import { decrypt, encrypt, randomBase64Url } from "../crypto";
import type { Env } from "../env";
import { resolveMetaSecrets, verifyOperatorWrite } from "./config";
import { graph, graphPages, validateConnection } from "./meta";
import { audit, type SocialAccount } from "./model";
import { publicOrigin } from "./oauth";

export async function ensureWebhookToken(env: Env) {
  let resolved = await resolveMetaSecrets(env);
  if (!resolved.META_APP_SECRET || !resolved.META_APP_ID) throw new HttpError(409, "Configure the existing Meta app credentials first.");
  if (!resolved.META_WEBHOOK_VERIFY_TOKEN) {
    const key = "META_WEBHOOK_VERIFY_TOKEN";
    await env.DB.prepare("INSERT INTO social_platform_secrets (key,encrypted,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO NOTHING").bind(key, await encrypt(JSON.stringify({ key, value: randomBase64Url(32) }), env.TOKEN_ENCRYPTION_KEY), Date.now()).run();
    resolved = await resolveMetaSecrets(env);
  }
  return resolved;
}
async function appToken(env: Env) {
  const result = await graph("", "oauth/access_token", { client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET!, grant_type: "client_credentials" }, "POST");
  if (typeof result.access_token !== "string" || !result.access_token) throw new HttpError(502, "Meta did not verify the app credentials.");
  return result.access_token;
}
export async function configurePageWebhook(request: Request, env: Env) {
  const operator = await verifyOperatorWrite(request, env, "webhook-setup");
  const resolved = await ensureWebhookToken(env);
  const token = await appToken(resolved), path = `${resolved.META_APP_ID}/subscriptions`;
  const callback = `${publicOrigin(resolved)}/api/social/webhooks/meta`;
  const before = await graphPages(token, path);
  if (!before.coverage.complete) throw new HttpError(409, "App subscriptions could not be read completely.");
  const existing = before.rows.find(row => row.object === "page");
  if (existing?.callback_url && existing.callback_url !== callback) throw new HttpError(409, "The app already has a different Page callback. Review that integration before changing it.");
  const fields = new Set(["messages", "feed"]);
  if (Array.isArray(existing?.fields)) for (const field of existing.fields) {
    const name = typeof field === "string" ? field : field && typeof field === "object" ? (field as {name?:unknown}).name : null;
    if (typeof name === "string" && /^[a-z_]+$/.test(name)) fields.add(name);
  }
  const created = await graph(token, path, { object: "page", callback_url: callback, verify_token: resolved.META_WEBHOOK_VERIFY_TOKEN!, fields: [...fields].join(","), include_values: "true" }, "POST");
  if (created.success !== true) throw new HttpError(502, "Meta did not confirm Page callback registration.");
  const after = await graphPages(token, path);
  const saved = after.rows.find(row => row.object === "page");
  const savedFields = Array.isArray(saved?.fields) ? saved.fields.map(field => typeof field === "string" ? field : field && typeof field === "object" ? (field as {name?:unknown}).name : null) : [];
  if (!after.coverage.complete || saved?.callback_url !== callback || saved.active !== true || !["messages", "feed"].every(field => savedFields.includes(field))) throw new HttpError(409, "Page callback readback was not verified. Check Meta before retrying.");
  await env.DB.prepare("INSERT INTO social_platform_audit (id,user_id,action,keys,created_at) VALUES (?,?,'page_webhook_registered','[]',?)").bind(crypto.randomUUID(), operator.userId, Date.now()).run();
  return { pageCallbackRegistered: true, callback, requiredFields: ["messages", "feed"], instagram: "owner_must_configure_in_meta_dashboard", deliveryVerified: false, note: "Registration does not prove signed delivery for any account. Instagram app subscriptions cannot be created through this API." };
}
export async function copyWebhookToken(request: Request, env: Env) {
  const operator = await verifyOperatorWrite(request, env, "webhook-setup");
  const resolved = await ensureWebhookToken(env);
  // Only the operator's explicit clipboard action receives this value. Never log,
  // render, persist in browser storage, or return the Meta app/access tokens.
  await env.DB.prepare("INSERT INTO social_platform_audit (id,user_id,action,keys,created_at) VALUES (?, ?, 'webhook_verification_token_copied', '[\"META_WEBHOOK_VERIFY_TOKEN\"]', ?)").bind(crypto.randomUUID(), operator.userId, Date.now()).run();
  return { verificationToken: resolved.META_WEBHOOK_VERIFY_TOKEN! };
}
export async function subscribePageAccount(env: Env, account: SocialAccount, user: string) {
  if (account.provider !== "facebook") throw new HttpError(409, "Instagram subscriptions must be configured in the Meta dashboard. Do not use the Page subscription API for Instagram fields.");
  const live = await validateConnection(env, account);
  const permissions = live.details.permissions;
  if (!["pages_show_list", "pages_manage_metadata"].every(scope => permissions.includes(scope)) || !live.validation.tasks.some(task => ["CREATE_CONTENT", "MANAGE", "MODERATE"].includes(task))) throw new HttpError(403, "Verified Page tasks and the existing metadata permissions are required.");
  const token = await decrypt(account.token!, env.TOKEN_ENCRYPTION_KEY), path = `${account.asset_id}/subscribed_apps`;
  const before = await graphPages(token, path, { fields: "id,subscribed_fields" });
  if (!before.coverage.complete) throw new HttpError(409, "Page subscriptions could not be read completely.");
  const own = before.rows.find(row => row.id === env.META_APP_ID);
  const fields = new Set(["messages", "feed", ...(Array.isArray(own?.subscribed_fields) ? own.subscribed_fields.filter((s): s is string => typeof s === "string" && /^[a-z_]+$/.test(s)) : [])]);
  const saved = await graph(token, path, { subscribed_fields: [...fields].join(",") }, "POST");
  if (saved.success !== true) throw new HttpError(502, "Meta did not confirm the Page subscription.");
  const after = await graphPages(token, path, { fields: "id,subscribed_fields" });
  const row = after.rows.find(r => r.id === env.META_APP_ID);
  const verifiedFields = Array.isArray(row?.subscribed_fields) ? row.subscribed_fields : [];
  if (!after.coverage.complete || !["messages", "feed"].every(f => verifiedFields.includes(f))) throw new HttpError(409, "Page subscription readback was not verified.");
  await audit(env, account.brand_id, user, "page_webhook_subscribed", account.id);
  return { accountId: account.id, subscriptionVerified: true, deliveryVerified: false, fields: ["messages", "feed"], note: "Send a fresh incoming test message and comment from an authorised test identity; SenderDeck must observe their valid Meta signatures." };
}
