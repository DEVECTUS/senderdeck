import { HttpError, requireUserId } from "../auth";
import { encrypt, decrypt, randomBase64Url, sha256Base64Url } from "../crypto";
import type { Env } from "../env";
import { admins, brandFor, id, json, audit, notice, type SocialAccount } from "./model";
import { subscribePageAccount } from "./webhook-setup";
import { discover, inspectToken, graph, GRAPH_VERSION, requireMeta, validateConnection, type MetaGrant } from "./meta";

export function publicOrigin(env: Env) {
  const url = new URL(env.SOCIAL_PUBLIC_ORIGIN || "https://senderdeck.devectus.com.au");
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/") throw new HttpError(503, "Social callback origin is not configured correctly.");
  return url.origin;
}
export function socialRedirect(env: Env, path: string) {
  return new Response(null,{status:303,headers:{location:`${publicOrigin(env)}${path}`,"cache-control":"no-store","referrer-policy":"no-referrer"}});
}
export async function startOAuth(env: Env, user: string, brandId: string) {
  await brandFor(env, user, brandId, admins); requireMeta(env);
  // Expiry is checked in the queries themselves. Cleanup cadence must not
  // prevent a customer from authorising an account.
  const state = randomBase64Url(); const redirect = `${publicOrigin(env)}/oauth/social/meta/callback`;
  await env.DB.prepare("INSERT INTO social_oauth (hash, brand_id, user_id, redirect_uri, expires_at) VALUES (?, ?, ?, ?, ?)").bind(await sha256Base64Url(state), brandId, user, redirect, Date.now() + 600000).run();
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  for (const [key, value] of Object.entries({ client_id: env.META_APP_ID!, config_id: env.META_LOGIN_CONFIG_ID!, response_type: "code", redirect_uri: redirect, state })) url.searchParams.set(key, value);
  return { authorizationUrl: url.toString(), brandId, provider: "meta", action: "Open the hosted authorisation flow, then select and verify each business asset." };
}
export async function oauthCallback(request: Request, env: Env) {
  const url = new URL(request.url);
  if (url.pathname !== "/oauth/social/meta/callback") return null;
  if (request.method !== "GET") throw new HttpError(405, "Method not allowed.");
  const user = await requireUserId(request, env); requireMeta(env);
  const state = url.searchParams.get("state");
  if (!state || state.length > 1000) throw new HttpError(400, "Invalid OAuth state.");
  const row = await env.DB.prepare("DELETE FROM social_oauth WHERE hash = ? AND user_id = ? AND expires_at > ? RETURNING *").bind(await sha256Base64Url(state), user, Date.now()).first<{ brand_id: string; redirect_uri: string }>();
  if (!row) return socialRedirect(env,"/connect/meta?connection=restart_required");
  await brandFor(env, user, row.brand_id, admins);
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.has("error")) return socialRedirect(env,`/connect/meta?brand=${encodeURIComponent(row.brand_id)}&connection=cancelled`);
  const exchange = await graph(`${env.META_APP_ID}|${env.META_APP_SECRET}`, "oauth/access_token", { client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET!, redirect_uri: row.redirect_uri, code });
  if (typeof exchange.access_token !== "string") throw new HttpError(502, "Meta did not return an authorisation token.");
  const grant = await discover(env, exchange.access_token);
  const grantId = id();
  await env.DB.prepare("INSERT INTO social_grants (id, brand_id, user_id, encrypted, expires_at) VALUES (?, ?, ?, ?, ?)").bind(grantId, row.brand_id, user, await encrypt(JSON.stringify(grant), env.TOKEN_ENCRYPTION_KEY), Date.now() + 600000).run();
  return socialRedirect(env,`/connect/meta?brand=${encodeURIComponent(row.brand_id)}&grant=${encodeURIComponent(grantId)}`);
}
async function getGrant(env: Env, user: string, brandId: string, grantId: string) {
  await brandFor(env, user, brandId, admins);
  const row = await env.DB.prepare("SELECT encrypted FROM social_grants WHERE id = ? AND brand_id = ? AND user_id = ? AND expires_at > ?").bind(grantId, brandId, user, Date.now()).first<{ encrypted: string }>();
  if (!row) throw new HttpError(404, "Asset selection expired or was not found.");
  return json<MetaGrant>(await decrypt(row.encrypted, env.TOKEN_ENCRYPTION_KEY));
}
export async function grantAssets(env: Env, user: string, brandId: string, grantId: string) {
  const grant = await getGrant(env, user, brandId, grantId);
  const current = await discover(env,grant.userToken);
  const assets = [];
  for (const { token: _token, ...asset } of current.candidates) {
    const assignment = await assetAssignment(env, user, brandId, asset.provider, asset.assetId);
    assets.push({ ...asset, assignment });
  }
  return { assets, permissions: current.permissions, diagnostics:current.diagnostics||null, expiresIn: "up to ten minutes" };
}
async function assetAssignment(env: Env, user: string, brandId: string, provider: string, assetId: string) {
  const existing = await env.DB.prepare("SELECT id,brand_id FROM social_accounts WHERE provider=? AND asset_id=?").bind(provider,assetId).first<{id:string;brand_id:string}>();
  if (!existing) return { state: "available" as const };
  if (existing.brand_id === brandId) return { state: "this_brand" as const };
  // A provider grant does not confer membership of another SenderDeck tenant.
  // Disclose its name/ID only after independently checking current membership.
  const visible = await env.DB.prepare("SELECT b.id,b.name FROM social_brands b JOIN social_members m ON m.customer_id=b.customer_id WHERE b.id=? AND m.user_id=?").bind(existing.brand_id,user).first<{id:string;name:string}>();
  return visible ? { state: "other_brand" as const, brandId:visible.id, brandName:visible.name } : { state: "other_workspace" as const };
}
export async function selectAsset(env: Env, user: string, brandId: string, grantId: string, provider: string, assetId: string) {
  const saved = await getGrant(env, user, brandId, grantId);
  // Re-discover the grant rather than trusting a caller-supplied Page, task or token.
  const grant = await discover(env, saved.userToken);
  const asset = grant.candidates.find(a => a.provider === provider && a.assetId === assetId);
  if (!asset) throw new HttpError(403, "The selected asset is not present in the current authorisation.");
  const existing = await env.DB.prepare("SELECT id, brand_id FROM social_accounts WHERE provider = ? AND asset_id = ?").bind(provider, assetId).first<{id: string; brand_id: string}>();
  if (existing && existing.brand_id !== brandId) throw new HttpError(409, "This account is already connected to another SenderDeck brand. Use its original workspace or sign-in to manage it. The existing connection has been preserved.");
  const tokenInfo = await inspectToken(env, asset.token);
  const account: SocialAccount = { id: existing?.id || id(), brand_id: brandId, provider: asset.provider, asset_id: assetId, parent_id: asset.parentId,
    provider_user_id: grant.providerUserId, name: asset.name, token: await encrypt(asset.token, env.TOKEN_ENCRYPTION_KEY), user_token: await encrypt(grant.userToken, env.TOKEN_ENCRYPTION_KEY),
    expires_at: tokenInfo.expiresAt || grant.expiresAt, permissions: JSON.stringify(grant.permissions), status: "pending_validation", validation: JSON.stringify({ tasks: asset.tasks }),
    validated_at: null, monitoring: JSON.stringify({ enabled: false, intervalMinutes: 10 }), last_reconciled_at: null, created_at: Date.now() };
  const live = await validateConnection(env, account);
  account.validation = JSON.stringify(live.validation); account.status = live.status; account.validated_at = Date.now();
  await env.DB.prepare(`INSERT INTO social_accounts (id, brand_id, provider, asset_id, parent_id, provider_user_id, name, token, user_token, expires_at, permissions, status, validation, validated_at, monitoring, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, asset_id) DO UPDATE SET provider_user_id=excluded.provider_user_id, name=excluded.name, token=excluded.token, user_token=excluded.user_token, expires_at=excluded.expires_at, permissions=excluded.permissions, status=excluded.status, validation=excluded.validation, validated_at=excluded.validated_at WHERE social_accounts.brand_id=excluded.brand_id`)
    .bind(account.id, brandId, provider, assetId, account.parent_id, account.provider_user_id, account.name, account.token, account.user_token, account.expires_at, account.permissions, account.status, account.validation, account.validated_at, account.monitoring, account.created_at).run();
  const persisted = await env.DB.prepare("SELECT id,brand_id FROM social_accounts WHERE provider=? AND asset_id=?").bind(provider, assetId).first<{id:string;brand_id:string}>();
  if (!persisted || persisted.brand_id !== brandId || persisted.id !== account.id) throw new HttpError(409, "The asset was assigned elsewhere during connection. Reload before continuing.");
  await audit(env, brandId, user, "account_connected", account.id);
  // Connecting a Page includes its event subscription. Infrastructure failures
  // retain the valid connection and are surfaced to the operator for repair.
  let eventSubscription: "verified" | "pending" | "operator_setup" = "operator_setup";
  if (account.provider === "facebook") {
    try {
      await subscribePageAccount(env, account, user);
      eventSubscription = "verified";
      live.validation.webhook = true;
      live.validation.errors = live.validation.errors.filter(reason => reason !== "webhook_subscription_unverified");
      await env.DB.prepare("UPDATE social_accounts SET validation=? WHERE id=? AND brand_id=?").bind(JSON.stringify(live.validation), account.id, brandId).run();
    } catch {
      eventSubscription = "pending";
      await notice(env, account.id, "page_subscription_setup_pending", `subscription:${account.id}`);
    }
  }
  return { accountId: account.id, status: account.status, validation: live.validation, eventSubscription };
}
