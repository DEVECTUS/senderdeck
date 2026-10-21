import { HttpError } from "../auth";
import type { Env } from "../env";
import { admins, brandFor, maintenanceStatus } from "./model";
import { graph, platformStatus } from "./meta";
import { publicOrigin } from "./oauth";
import { resolveMetaSecrets, storedMetaSecrets } from "./config";

export function isPlatformOperator(env: Env, userId: string) {
  // This allowlist belongs to the hosting control plane. Customer memberships,
  // client headers and request bodies cannot grant global operator privileges.
  return (env.SOCIAL_OPERATOR_USER_IDS || "").split(",").map(id => id.trim()).filter(Boolean).includes(userId);
}
export function requirePlatformOperator(env: Env, userId: string) {
  if (!isPlatformOperator(env, userId)) throw new HttpError(403, "Platform administrator access is required. Customer workspace roles do not grant this access.");
}
export async function setupRuntime(env: Env) {
  return maintenanceStatus(env);
}
export async function customerSetup(env: Env, user: string, brandId: string) {
  const brand = await brandFor(env, user, brandId);
  const platform = platformStatus(env); const runtime = await setupRuntime(env);
  const blockers: string[] = [];
  if (!platform.meta.configured) blockers.push("SenderDeck's platform administrator must finish Meta app configuration.");
  if (!runtime.schedulerConfigured || !runtime.schedulerRecent) blockers.push("Hosted maintenance must be configured and complete a recent run before authorisation can start.");
  if (!admins.includes(brand.role!)) blockers.push("A customer owner or administrator must authorise this brand's accounts.");
  return { brand: {id: brand.id, name: brand.name, customerId: brand.customer_id}, canConnect: blockers.length === 0, canManageConnections: admins.includes(brand.role!), blockers,
    appConfigured: platform.meta.configured, businessVerification: "not_confirmed_by_senderdeck", customerAccess: platform.meta.customerAccess,
    reviewNote: "A configured app does not establish business verification or approved customer access. Meta consent and live asset checks determine actual access.",
    runtime, operatorMaintenanceAvailable:isPlatformOperator(env,user), sending: platform.sending, monitoringActive: false, needsCustomerDeveloperCredentials: false };
}
export async function operatorSetup(env: Env, user: string) {
  requirePlatformOperator(env, user);
  const stored = await storedMetaSecrets(env);
  const statusEnv = {...env};
  for (const row of stored) if (!statusEnv[row.key]) statusEnv[row.key] = "configured";
  const origin = publicOrigin(env); const platform = platformStatus(statusEnv); const runtime = await setupRuntime(env);
  const fields = [
    {key:"META_APP_ID", configured:!!env.META_APP_ID, secret:false, value:env.META_APP_ID || null},
    {key:"META_APP_SECRET", configured:!!statusEnv.META_APP_SECRET, secret:true, source:env.META_APP_SECRET?"hosting":stored.some(row=>row.key==="META_APP_SECRET")?"encrypted_store":"missing"},
    {key:"META_LOGIN_CONFIG_ID", configured:!!env.META_LOGIN_CONFIG_ID, secret:false, value:env.META_LOGIN_CONFIG_ID || null},
    {key:"META_WEBHOOK_VERIFY_TOKEN", configured:!!statusEnv.META_WEBHOOK_VERIFY_TOKEN, secret:true, source:env.META_WEBHOOK_VERIFY_TOKEN?"hosting":stored.some(row=>row.key==="META_WEBHOOK_VERIFY_TOKEN")?"encrypted_store":"missing"},
    {key:"SOCIAL_PUBLIC_ORIGIN", configured:!!env.SOCIAL_PUBLIC_ORIGIN, secret:false, value:env.SOCIAL_PUBLIC_ORIGIN || null},
    {key:"SOCIAL_MAINTENANCE_TOKEN", configured:!!env.SOCIAL_MAINTENANCE_TOKEN, secret:true},
  ];
  const observed = await env.DB.prepare("SELECT MAX(created_at) AS last_event FROM social_queue").first<{last_event:number|null}>();
  return { fields, routes: { callback:`${origin}/oauth/social/meta/callback`, webhook:`${origin}/api/social/webhooks/meta`, deauthorisation:`${origin}/api/social/meta/deauthorize`, deletion:`${origin}/api/social/meta/delete`, maintenance:`${origin}/api/social/maintenance`, privacy:`${origin}/privacy` },
    platform, runtime, webhookLastObservedAt:observed?.last_event || null, businessVerification:"must_be_verified_in_meta", appReview:"must_be_verified_in_meta",
    credentialEntry:"Only a verified, hosting-allowlisted platform operator may enter the two Meta secrets below. Values are encrypted with the hosting encryption key. The app secret is never returned. Only the explicit, protected operator clipboard action can return the webhook verification token. Native hosting secrets take precedence and cannot be replaced here.",
    activationNote:"Settings and mock tests do not prove provider approval, webhook delivery, a running scheduler or complete conversation history." };
}
export async function checkOperatorApp(env: Env, user: string) {
  requirePlatformOperator(env, user);
  env = await resolveMetaSecrets(env);
  if (!env.META_APP_ID || !env.META_APP_SECRET) throw new HttpError(409, "Configure the platform app ID and enter its secret in platform setup first.");
  // App name/id are publicly readable; validate the secret through a server-side
  // client-credentials exchange before checking identity. Never put it in a URL.
  const grant = await graph("", "oauth/access_token", {client_id:env.META_APP_ID, client_secret:env.META_APP_SECRET, grant_type:"client_credentials"}, "POST");
  if (typeof grant.access_token !== "string" || !grant.access_token) throw new HttpError(502, "Meta did not verify the configured app credentials.");
  const app = await graph(grant.access_token, env.META_APP_ID, {fields:"id,name"});
  if (app.id !== env.META_APP_ID) throw new HttpError(409, "The configured Meta app identity was not verified.");
  return { appVerified:true, appId:String(app.id), name:String(app.name || ""), businessVerification:"not_checked", customerAccessApproval:"not_checked",
    note:"App credentials were accepted for this app ID. This does not verify business ownership, App Review, login configuration, customer consent or account capabilities." };
}
