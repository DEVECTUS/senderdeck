import { HttpError } from "../auth";
import type { Env } from "../env";
import { admins, brandFor } from "./model";
import { graph, platformStatus } from "./meta";
import { publicOrigin } from "./oauth";

export function isPlatformOperator(env: Env, userId: string) {
  // This allowlist belongs to the hosting control plane. Customer memberships,
  // client headers and request bodies cannot grant global operator privileges.
  return (env.SOCIAL_OPERATOR_USER_IDS || "").split(",").map(id => id.trim()).filter(Boolean).includes(userId);
}
export function requirePlatformOperator(env: Env, userId: string) {
  if (!isPlatformOperator(env, userId)) throw new HttpError(403, "Platform administrator access is required. Customer workspace roles do not grant this access.");
}
export async function setupRuntime(env: Env) {
  const heartbeat = await env.DB.prepare("SELECT value FROM social_runtime WHERE key='maintenance'").first<{value:number}>();
  const schedulerConfigured = env.SOCIAL_SCHEDULER_ENABLED === "true";
  const schedulerRecent = !!heartbeat && Date.now() - heartbeat.value >= 0 && Date.now() - heartbeat.value <= 1200000;
  return { schedulerConfigured, schedulerRecent, lastMaintenanceAt: heartbeat?.value || null };
}
export async function customerSetup(env: Env, user: string, brandId: string) {
  const brand = await brandFor(env, user, brandId);
  const platform = platformStatus(env); const runtime = await setupRuntime(env);
  const blockers: string[] = [];
  if (!platform.meta.configured) blockers.push("SenderDeck's platform administrator must finish Meta app configuration.");
  if (!runtime.schedulerConfigured || !runtime.schedulerRecent) blockers.push("Hosted maintenance must be configured and complete a recent run before authorisation can start.");
  if (!admins.includes(brand.role!)) blockers.push("A customer owner or administrator must authorise this brand's accounts.");
  return { brand: {id: brand.id, name: brand.name, customerId: brand.customer_id}, canConnect: blockers.length === 0, blockers,
    appConfigured: platform.meta.configured, businessVerification: "not_confirmed_by_senderdeck", customerAccess: platform.meta.customerAccess,
    reviewNote: "A configured app does not establish business verification or approved customer access. Meta consent and live asset checks determine actual access.",
    runtime, sending: platform.sending, monitoringActive: false, needsCustomerDeveloperCredentials: false };
}
export async function operatorSetup(env: Env, user: string) {
  requirePlatformOperator(env, user);
  const origin = publicOrigin(env); const platform = platformStatus(env); const runtime = await setupRuntime(env);
  const fields = [
    {key:"META_APP_ID", configured:!!env.META_APP_ID, secret:false, value:env.META_APP_ID || null},
    {key:"META_APP_SECRET", configured:!!env.META_APP_SECRET, secret:true},
    {key:"META_LOGIN_CONFIG_ID", configured:!!env.META_LOGIN_CONFIG_ID, secret:false, value:env.META_LOGIN_CONFIG_ID || null},
    {key:"META_WEBHOOK_VERIFY_TOKEN", configured:!!env.META_WEBHOOK_VERIFY_TOKEN, secret:true},
    {key:"SOCIAL_PUBLIC_ORIGIN", configured:!!env.SOCIAL_PUBLIC_ORIGIN, secret:false, value:env.SOCIAL_PUBLIC_ORIGIN || null},
    {key:"SOCIAL_MAINTENANCE_TOKEN", configured:!!env.SOCIAL_MAINTENANCE_TOKEN, secret:true},
  ];
  const observed = await env.DB.prepare("SELECT MAX(created_at) AS last_event FROM social_queue").first<{last_event:number|null}>();
  return { fields, routes: { callback:`${origin}/oauth/social/meta/callback`, webhook:`${origin}/api/social/webhooks/meta`, deauthorisation:`${origin}/api/social/meta/deauthorize`, deletion:`${origin}/api/social/meta/delete`, maintenance:`${origin}/api/social/maintenance`, privacy:`${origin}/privacy` },
    platform, runtime, webhookLastObservedAt:observed?.last_event || null, businessVerification:"must_be_verified_in_meta", appReview:"must_be_verified_in_meta",
    credentialEntry:"Use the hosting project's native environment/secret controls. This application never accepts, reads back or changes platform secrets through a tenant request.",
    activationNote:"Settings and mock tests do not prove provider approval, webhook delivery, a running scheduler or complete conversation history." };
}
export async function checkOperatorApp(env: Env, user: string) {
  requirePlatformOperator(env, user);
  if (!env.META_APP_ID || !env.META_APP_SECRET) throw new HttpError(409, "Set the platform app ID and secret in the native hosting secret controls first.");
  const app = await graph(`${env.META_APP_ID}|${env.META_APP_SECRET}`, env.META_APP_ID, {fields:"id,name"});
  if (app.id !== env.META_APP_ID) throw new HttpError(409, "The configured Meta app identity was not verified.");
  return { appVerified:true, appId:String(app.id), name:String(app.name || ""), businessVerification:"not_checked", customerAccessApproval:"not_checked",
    note:"App credentials were accepted for this app ID. This does not verify business ownership, App Review, login configuration, customer consent or account capabilities." };
}
