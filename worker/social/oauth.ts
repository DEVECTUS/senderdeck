import { whatsappAssets } from "./whatsapp";
import { HttpError, requireUserId } from "../auth";
import { encrypt, decrypt, randomBase64Url, sha256Base64Url } from "../crypto";
import type { Env } from "../env";
import { admins, accountFor, brandFor, id, json, audit, notice, type SocialAccount } from "./model";
import { advertisingAssets, advertisingGrant, advertisingAccount } from "./advertising";
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
export async function startOAuth(env: Env, user: string, brandId: string, provider = "meta") {
  await brandFor(env, user, brandId, admins);
  if (!["meta", "whatsapp"].includes(provider)) throw new HttpError(400, "Choose meta or whatsapp.");
  if (provider === "meta") requireMeta(env);
  else if (!env.META_APP_ID || !env.META_APP_SECRET || !env.WHATSAPP_LOGIN_CONFIG_ID) throw new HttpError(409, "WhatsApp Business OAuth is not configured.");
  // Expiry is checked in the queries themselves. Cleanup cadence must not
  // prevent a customer from authorising an account.
  const state = randomBase64Url(); const redirect = `${publicOrigin(env)}/oauth/social/${provider}/callback`;
  await env.DB.prepare("INSERT INTO social_oauth (hash, brand_id, user_id, redirect_uri, expires_at) VALUES (?, ?, ?, ?, ?)").bind(await sha256Base64Url(state), brandId, user, redirect, Date.now() + 600000).run();
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  for (const [key, value] of Object.entries({ client_id: env.META_APP_ID!, config_id: provider === "whatsapp" ? env.WHATSAPP_LOGIN_CONFIG_ID! : env.META_LOGIN_CONFIG_ID!, response_type: "code", redirect_uri: redirect, state })) url.searchParams.set(key, value);
  return { authorizationUrl: url.toString(), brandId, provider, action: "Open the hosted authorisation flow, then select and verify each business asset." };
}
export async function oauthCallback(request: Request, env: Env) {
  const url = new URL(request.url);
  if (!["/oauth/social/meta/callback", "/oauth/social/whatsapp/callback"].includes(url.pathname)) return null;
  if (request.method !== "GET") throw new HttpError(405, "Method not allowed.");
  const user = await requireUserId(request, env);
  const whatsapp = url.pathname === "/oauth/social/whatsapp/callback";
  if (!env.META_APP_ID || !env.META_APP_SECRET) throw new HttpError(503, "Meta is not configured.");
  const state = url.searchParams.get("state");
  if (!state || state.length > 1000) throw new HttpError(400, "Invalid OAuth state.");
  const row = await env.DB.prepare("DELETE FROM social_oauth WHERE hash = ? AND user_id = ? AND expires_at > ? RETURNING *").bind(await sha256Base64Url(state), user, Date.now()).first<{ brand_id: string; redirect_uri: string }>();
  if (row && row.redirect_uri !== `${publicOrigin(env)}${url.pathname}`) throw new HttpError(403, "OAuth callback does not match its connection flow.");
  if (!row) return socialRedirect(env,`/connect/meta?connection=restart_required${whatsapp ? "&provider=whatsapp" : ""}`);
  await brandFor(env, user, row.brand_id, admins);
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.has("error")) return socialRedirect(env,`/connect/meta?brand=${encodeURIComponent(row.brand_id)}&connection=cancelled${whatsapp ? "&provider=whatsapp" : ""}`);
  const exchange = await graph(`${env.META_APP_ID}|${env.META_APP_SECRET}`, "oauth/access_token", { client_id: env.META_APP_ID!, client_secret: env.META_APP_SECRET!, redirect_uri: row.redirect_uri, code });
  if (typeof exchange.access_token !== "string") throw new HttpError(502, "Meta did not return an authorisation token.");
  const grant = whatsapp ? { ...await inspectToken(env, exchange.access_token), userToken: exchange.access_token, candidates: [] } : await discover(env, exchange.access_token);
  const grantId = id();
  await env.DB.prepare("INSERT INTO social_grants (id, brand_id, user_id, encrypted, expires_at) VALUES (?, ?, ?, ?, ?)").bind(grantId, row.brand_id, user, await encrypt(JSON.stringify(grant), env.TOKEN_ENCRYPTION_KEY), Date.now() + 600000).run();
  return socialRedirect(env,`/connect/meta?brand=${encodeURIComponent(row.brand_id)}&grant=${encodeURIComponent(grantId)}${whatsapp ? "&provider=whatsapp" : ""}`);
}
async function getGrant(env: Env, user: string, brandId: string, grantId: string) {
  await brandFor(env, user, brandId, admins);
  const row = await env.DB.prepare("SELECT encrypted FROM social_grants WHERE id = ? AND brand_id = ? AND user_id = ? AND expires_at > ?").bind(grantId, brandId, user, Date.now()).first<{ encrypted: string }>();
  if (!row) throw new HttpError(404, "Asset selection expired or was not found.");
  const grant=json<MetaGrant & {kind?:string}>(await decrypt(row.encrypted, env.TOKEN_ENCRYPTION_KEY));
  if(grant.kind)throw new HttpError(403,"This grant belongs to another connection purpose.");
  return grant;
}
export async function grantAssets(env: Env, user: string, brandId: string, grantId: string, kind = "social", cursor?: string, wabaId?: string) {
  const grant = await getGrant(env, user, brandId, grantId);
  if (kind === "advertising") return advertisingAssets(env, grant.userToken, cursor);
  if (kind === "whatsapp") {
    const result = await whatsappAssets(env, grant.userToken, strWaba(wabaId));
    return { assets: await Promise.all(result.assets.map(async ({token: _token, ...asset}) => ({...asset, assignment: await assetAssignment(env, user, brandId, asset.provider, asset.assetId)}))) };
  }
  if (kind !== "social") throw new HttpError(400, "Asset kind must be social, advertising or whatsapp.");
  const current = await discover(env,grant.userToken);
  const assets = [];
  for (const { token: _token, ...asset } of current.candidates) {
    const assignment = await assetAssignment(env, user, brandId, asset.provider, asset.assetId);
    assets.push({ ...asset, assignment });
  }
  return { assets, permissions: current.permissions, diagnostics:current.diagnostics||null, expiresIn: "up to ten minutes" };
}
export async function selectAdvertisingAccount(env: Env, user: string, brandId: string, grantId: string, accountId: string, advertisingId: string, confirmed: unknown, confirmation: unknown) {
  const { account } = await accountFor(env, user, brandId, accountId, admins);
  if (!["facebook", "instagram"].includes(account.provider)) throw new HttpError(409, "Advertising mapping needs a selected Facebook or Instagram account.");
  if (!account.provider_user_id) throw new HttpError(409, "The granting identity for this social account must be verified before advertising selection.");
  const exact = `Select advertising account ${advertisingId} for social account ${accountId} in brand ${brandId}`;
  if (confirmed !== true || confirmation !== exact) throw new HttpError(400, `Separate owner confirmation is required: ${exact}`);
  const saved = await getGrant(env, user, brandId, grantId);
  const live = await advertisingGrant(env, saved.userToken, account.provider_user_id);
  if (json<string[]>(account.permissions).some(scope => !live.permissions.includes(scope))) throw new HttpError(409, "The new grant must retain the existing social permissions as well as advertising read access. No credentials were replaced.");
  const selected = await advertisingAccount(saved.userToken, advertisingId);
  const selection = { id: selected.id, name: selected.name, selectedAt: Date.now(), selectedBy: user };
  const validation = { ...json<Record<string, unknown>>(account.validation), advertisingAccount: selection };
  const updated = await env.DB.prepare("UPDATE social_accounts SET user_token=?,permissions=?,validation=? WHERE id=? AND brand_id=? AND provider_user_id=? RETURNING id")
    .bind(await encrypt(saved.userToken, env.TOKEN_ENCRYPTION_KEY), JSON.stringify(live.permissions), JSON.stringify(validation), account.id, brandId, live.providerUserId).first();
  if (!updated) throw new HttpError(409, "The social account changed during selection. Read it again before continuing.");
  await audit(env, brandId, user, "advertising_account_selected", account.id, selected.id);
  return { selected: selection, accountId, brandId, readOnlyMapping: true, sendingPolicyChanged: false };
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
export async function selectAsset(env: Env, user: string, brandId: string, grantId: string, provider: string, assetId: string, wabaId?: string, coexistenceReconnect = false) {
  const saved = await getGrant(env, user, brandId, grantId);
  // Re-discover the grant rather than trusting a caller-supplied Page, task or token.
  const grant = provider === "whatsapp" ? { ...saved, candidates: (await whatsappAssets(env, saved.userToken, strWaba(wabaId))).assets } : await discover(env, saved.userToken);
  const asset = grant.candidates.find(a => a.provider === provider && a.assetId === assetId);
  if (!asset) throw new HttpError(403, "The selected asset is not present in the current authorisation.");
  const existing = await env.DB.prepare("SELECT id, brand_id FROM social_accounts WHERE provider = ? AND asset_id = ?").bind(provider, assetId).first<{id: string; brand_id: string}>();
  if (existing && existing.brand_id !== brandId) throw new HttpError(409, "This account is already connected to another SenderDeck brand. Use its original workspace or sign-in to manage it. The existing connection has been preserved.");
  const tokenInfo = await inspectToken(env, asset.token);
  const account: SocialAccount = { id: existing?.id || id(), brand_id: brandId, provider: asset.provider, asset_id: assetId, parent_id: asset.parentId,
    provider_user_id: grant.providerUserId, name: asset.name, token: await encrypt(asset.token, env.TOKEN_ENCRYPTION_KEY), user_token: await encrypt(grant.userToken, env.TOKEN_ENCRYPTION_KEY),
    expires_at: tokenInfo.expiresAt || grant.expiresAt, permissions: JSON.stringify(grant.permissions), status: "pending_validation", validation: JSON.stringify({ tasks: asset.tasks, ...(provider === "whatsapp" && coexistenceReconnect ? {coexistenceReconnect:true} : {}) }),
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

function strWaba(value?: string) { if (!value || !/^\d{1,32}$/.test(value)) throw new HttpError(400, "Provide the WhatsApp Business Account ID."); return value; }
