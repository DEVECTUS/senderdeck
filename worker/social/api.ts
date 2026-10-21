import { HttpError, requireUserId } from "../auth";
import type { Env } from "../env";
import { platformStatus } from "./meta";
import { oauthCallback, socialRedirect } from "./oauth";
import { socialAction } from "./service";
import { equalSecret, limitedBody, runHostedMaintenance, metaDeletion, receiveMeta } from "./webhooks";
import { checkOperatorApp, customerSetup, operatorSetup } from "./setup";
import { operatorCsrf, resolveMetaSecrets, saveMetaSecrets, verifyOperatorWrite } from "./config";
import { configurePageWebhook, copyWebhookToken } from "./webhook-setup";

export async function handleSocial(request: Request, env: Env, defer: (p: Promise<unknown>) => void): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/social") && !path.startsWith("/oauth/social/")) return null;
  try {
    if (path === "/api/social/operator/secrets" && request.method === "POST") return Response.json(await saveMetaSecrets(request, env), {headers:{"cache-control":"no-store"}});
    if (path === "/api/social/operator/setup" && request.method === "GET") {
      const csrfToken = await operatorCsrf(request, env);
      return Response.json({...await operatorSetup(env, await requireUserId(request, env)), csrfToken, maintenanceCsrfToken:await operatorCsrf(request,env,"maintenance-run"), webhookCsrfToken:await operatorCsrf(request,env,"webhook-setup")}, {headers:{"cache-control":"no-store"}});
    }
    if (["/api/social/operator/webhook", "/api/social/operator/webhook-copy"].includes(path) && request.method === "POST") {
      if ((await limitedBody(request,64)).trim() !== "{}") throw new HttpError(400,"This operation accepts no custom URLs, fields or credentials.");
      return Response.json(await (path.endsWith("-copy") ? copyWebhookToken(request,env) : configurePageWebhook(request,env)), {headers:{"cache-control":"private, no-store","pragma":"no-cache"}});
    }
    if (path === "/api/social/operator/maintenance" && request.method === "POST") {
      const user=await verifyOperatorWrite(request,env,"maintenance-run");
      if ((await limitedBody(request,64)).trim() !== "{}") throw new HttpError(400,"This operation accepts no settings or customer arguments.");
      const result=await runHostedMaintenance(await resolveMetaSecrets(env),"operator");
      await env.DB.prepare("INSERT INTO social_platform_audit (id,user_id,action,keys,created_at) VALUES (?,?,'maintenance_run','[]',?)").bind(crypto.randomUUID(),user.userId,Date.now()).run();
      return Response.json(result,{headers:{"cache-control":"no-store"}});
    }
    if (path === "/api/social/operator/check" && request.method === "POST") {
      if (request.headers.get("origin") !== new URL(request.url).origin) throw new HttpError(403, "Same-origin request required.");
      return Response.json(await checkOperatorApp(env, await requireUserId(request, env)), {headers:{"cache-control":"no-store"}});
    }
    env = await resolveMetaSecrets(env);
    if (path === "/api/social/status" && request.method === "GET") return Response.json(platformStatus(env), {headers: {"cache-control": "no-store"}});
    if (path === "/api/social/setup" && request.method === "GET") {
      const user = await requireUserId(request, env);
      const brandId = new URL(request.url).searchParams.get("brandId") || "";
      return Response.json(await customerSetup(env, user, brandId), {headers:{"cache-control":"no-store"}});
    }
    if (path === "/api/social/webhooks/meta") return await receiveMeta(request, env, defer);
    if (["/api/social/meta/deauthorize", "/api/social/meta/delete"].includes(path)) return await metaDeletion(request, env);
    if (path === "/api/social/maintenance") {
      if (request.method !== "POST") throw new HttpError(405, "Method not allowed.");
      if (!env.SOCIAL_MAINTENANCE_TOKEN || env.SOCIAL_SCHEDULER_ENABLED !== "true" || !equalSecret(request.headers.get("authorization") || "", `Bearer ${env.SOCIAL_MAINTENANCE_TOKEN}`)) throw new HttpError(401, "Scheduler authentication required.");
      const source=request.headers.get("x-senderdeck-maintenance-source");
      return Response.json(await runHostedMaintenance(env,source === "github_schedule" || source === "github_dispatch" ? source : "external"));
    }
    const oauth = await oauthCallback(request, env); if (oauth) return oauth;
    if (path !== "/api/social" || request.method !== "POST") throw new HttpError(404, "Social route not found.");
    // Browser cookies cannot authorise cross-origin writes. MCP has a separate OAuth bearer flow.
    if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) throw new HttpError(403, "Same-origin JSON request required.");
    const user = await requireUserId(request, env);
    let body: {action?: string; args?: Record<string, unknown>};
    try { body = JSON.parse(await limitedBody(request, 65536)); } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "Invalid JSON request."); }
    if (!body || typeof body.action !== "string" || !body.action.startsWith("social_") || !body.args || typeof body.args !== "object" || Array.isArray(body.args)) throw new HttpError(400, "Invalid social operation.");
    const result = await socialAction(body.action, body.args, env, user);
    return Response.json(result, {headers: {"cache-control": "no-store"}});
  } catch (error) {
    if (path === "/oauth/social/meta/callback") return socialRedirect(env,`/connect/meta?connection=${error instanceof HttpError&&error.status===401?"restart_required":"failed"}`);
    return Response.json({error: error instanceof HttpError ? error.message : "The social operation could not be completed."}, {status: error instanceof HttpError ? error.status : 500, headers: {"cache-control": "no-store"}});
  }
}
