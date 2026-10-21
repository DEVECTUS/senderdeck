import { HttpError } from "./auth";
import { sha256Base64Url } from "./crypto";
import type { Env } from "./env";
import { isUserRetired, retiredUserKey } from "./retired-users";
import { equalSecret, limitedBody } from "./social/webhooks";

type Plan = {
  sourceUserId: string;
  targetUserId: string;
  sourceBrandId: string;
  targetBrandId: string;
  tokenHash: string;
  expiresAt: number;
};
type Row = Record<string, string | number | null>;

// This is an operator maintenance operation, not an account-discovery API.
// The hosting control plane must provision one exact, expiring plan and a
// separate random bearer. Request bodies cannot select users or brands.
function configuredPlan(env: Env): Plan {
  let plan: Plan;
  try { plan = JSON.parse(env.ACCOUNT_RETIREMENT_PLAN || "null"); }
  catch { throw new HttpError(404, "Not found."); }
  if (!plan || [plan.sourceUserId, plan.targetUserId, plan.sourceBrandId, plan.targetBrandId, plan.tokenHash].some(x => typeof x !== "string" || !x || x.length > 200)
    || plan.sourceUserId === plan.targetUserId || plan.sourceBrandId === plan.targetBrandId
    || !Number.isSafeInteger(plan.expiresAt) || plan.expiresAt <= Date.now() || plan.expiresAt > Date.now() + 3600000) {
    throw new HttpError(404, "Not found.");
  }
  return plan;
}

// Canonical metadata snapshot, also evaluated INSIDE the write transaction.
// A membership, identity, brand, mailbox or draft change aborts the entire batch.
function snapshotQuery(plan: Plan) {
  const definitions: Array<[string, string, string[], string, unknown[]]> = [
    ["identities", "senderdeck_identities", ["provider", "provider_account_id", "user_id", "email"], "user_id IN (?,?)", [plan.sourceUserId, plan.targetUserId]],
    ["emails", "email_accounts", ["id", "user_id", "provider", "provider_account_id", "email", "label"], "user_id IN (?,?)", [plan.sourceUserId, plan.targetUserId]],
    ["members", "social_members", ["id", "customer_id", "user_id", "role"], "user_id=? OR customer_id IN (SELECT customer_id FROM social_brands WHERE id IN (?,?))", [plan.sourceUserId, plan.sourceBrandId, plan.targetBrandId]],
    ["brands", "social_brands", ["id", "customer_id", "name", "profile", "revision"], "customer_id IN (SELECT customer_id FROM social_members WHERE user_id=?) OR id=?", [plan.sourceUserId, plan.targetBrandId]],
    ["accounts", "social_accounts", ["id", "brand_id", "provider", "asset_id", "name"], "brand_id IN (?,?) OR (provider='email' AND asset_id IN (SELECT id FROM email_accounts WHERE user_id=?))", [plan.sourceBrandId, plan.targetBrandId, plan.sourceUserId]],
    ["drafts", "social_drafts", ["id", "state", "revision"], "thread_id IN (SELECT t.id FROM social_threads t JOIN social_accounts a ON a.id=t.account_id WHERE a.brand_id IN (?,?))", [plan.sourceBrandId, plan.targetBrandId]],
  ];
  const values: unknown[] = [];
  const parts = definitions.map(([key, table, columns, where, params]) => {
    values.push(...params);
    const fields = columns.map(column => `'${column}',${column}`).join(",");
    return `'${key}',json((SELECT json_group_array(json_object(${fields})) FROM (SELECT ${columns.join(",")} FROM ${table} WHERE ${where} ORDER BY ${columns.join(",")})))`;
  });
  return { sql: `SELECT json_object(${parts.join(",")})`, values };
}

async function inspect(env: Env, plan: Plan) {
  if (await isUserRetired(env, plan.sourceUserId) || await isUserRetired(env, plan.targetUserId)) throw new HttpError(409, "An account in this plan is already retired.");
  const query = snapshotQuery(plan);
  const result = await env.DB.prepare(`${query.sql} AS snapshot`).bind(...query.values).first<{ snapshot: string }>();
  if (!result) throw new HttpError(409, "Account metadata is unavailable.");
  const data = JSON.parse(result.snapshot) as Record<string, Row[]>;
  if (data.identities.some(row => row.user_id === plan.sourceUserId)) throw new HttpError(409, "Only a legacy account without a provider sign-in can be retired here.");
  const targetIdentity = data.identities.find(identity => identity.user_id === plan.targetUserId && data.emails.some(email => email.user_id === plan.sourceUserId && email.provider === identity.provider && email.provider_account_id === identity.provider_account_id));
  if (!targetIdentity) throw new HttpError(409, "The destination must have a verified provider identity also connected to the source account.");
  const source = data.brands.find(row => row.id === plan.sourceBrandId);
  const target = data.brands.find(row => row.id === plan.targetBrandId);
  if (!source || !target || source.customer_id === target.customer_id || source.profile !== target.profile) throw new HttpError(409, "Select separate source and destination brands with identical policies.");
  const sourceMemberships = data.members.filter(row => row.user_id === plan.sourceUserId);
  if (sourceMemberships.length !== 1 || sourceMemberships[0].customer_id !== source.customer_id || sourceMemberships[0].role !== "owner"
    || data.members.filter(row => row.customer_id === source.customer_id).length !== 1
    || !data.members.some(row => row.customer_id === target.customer_id && row.user_id === plan.targetUserId && row.role === "owner")
    || data.brands.filter(row => row.customer_id === source.customer_id).length !== 1) {
    throw new HttpError(409, "This operation requires one solely owned source workspace and a destination owned by the retained user.");
  }
  if (data.accounts.some(row => row.brand_id === target.id || row.provider === "email")) throw new HttpError(409, "The destination brand must be empty and source mailboxes must not be linked to social brands.");
  if (data.drafts.some(row => row.state === "sending" || row.state === "delivery_unknown")) throw new HttpError(409, "Resolve in-progress or uncertain deliveries before retirement.");
  return { query, snapshot: result.snapshot, source, target, revision: await sha256Base64Url(JSON.stringify(plan) + result.snapshot), summary: {
    sourceUserId: plan.sourceUserId, targetUserId: plan.targetUserId,
    retainedSignIn: { provider: targetIdentity.provider, email: targetIdentity.email },
    removeMailboxConnections: data.emails.filter(row => row.user_id === plan.sourceUserId).map(({ id, email }) => ({ id, email })),
    keepMailboxConnections: data.emails.filter(row => row.user_id === plan.targetUserId).map(({ id, email, label }) => ({ id, email, label })),
    moveSocialConnections: data.accounts.map(({ id, provider, name }) => ({ id, provider, name })),
    sourceBrandId: source.id, destinationBrandId: target.id,
    preserved: "Social connection IDs, provider grants, settings, threads, activity and monitoring records",
    revoked: "Source browser/MCP sessions, pending OAuth grants and social draft approvals",
  } };
}

export async function handleAccountRetirement(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/account-retirement/")) return null;
  try {
    const plan = configuredPlan(env);
    const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];
    if (url.protocol !== "https:" || request.method !== "POST" || request.headers.has("origin") || !token
      || !equalSecret(await sha256Base64Url(token), plan.tokenHash)) throw new HttpError(401, "Maintenance authentication required.");
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || "")) throw new HttpError(415, "JSON required.");
    const body = JSON.parse(await limitedBody(request, 1024)) as Record<string, unknown>;
    if (!body || Array.isArray(body) || typeof body !== "object") throw new HttpError(400, "Invalid request.");
    const preview = await inspect(env, plan);
    if (url.pathname === "/api/account-retirement/preview" && !Object.keys(body).length) return response({ ...preview.summary, revision: preview.revision });
    if (url.pathname !== "/api/account-retirement/apply" || Object.keys(body).some(key => !["revision", "confirmed"].includes(key)) || body.confirmed !== true || body.revision !== preview.revision) throw new HttpError(409, "Inspect the current plan and confirm its exact revision.");
    const key = await retiredUserKey(plan.sourceUserId);
    const targetKey = await retiredUserKey(plan.targetUserId);
    const at = Date.now();
    const sourceThreads = "SELECT t.id FROM social_threads t JOIN social_accounts a ON a.id=t.account_id WHERE a.brand_id=?";
    const statements = [
      // Unique marker makes retries fail closed. NOT NULL enforces the snapshot
      // and destination revocation guard atomically, rolling back every write.
      env.DB.prepare(`INSERT INTO social_runtime (key,value) SELECT ?,CASE WHEN (${preview.query.sql})=? AND NOT EXISTS(SELECT 1 FROM social_runtime WHERE key=?) THEN ? ELSE NULL END`).bind(key, ...preview.query.values, preview.snapshot, targetKey, at),
      env.DB.prepare(`UPDATE social_drafts SET approval_hash=NULL,approver=NULL,approval_expires_at=NULL,state=CASE WHEN state='draft' THEN 'superseded' ELSE state END WHERE thread_id IN (${sourceThreads})`).bind(plan.sourceBrandId),
      env.DB.prepare(`DELETE FROM social_snapshots WHERE thread_id IN (${sourceThreads})`).bind(plan.sourceBrandId),
      env.DB.prepare(`UPDATE social_threads SET assigned_to=NULL WHERE id IN (${sourceThreads})`).bind(plan.sourceBrandId),
    ];
    for (const table of ["social_accounts", "social_activity", "social_identity_links"]) statements.push(env.DB.prepare(`UPDATE ${table} SET brand_id=? WHERE brand_id=?`).bind(plan.targetBrandId, plan.sourceBrandId));
    for (const table of ["social_grants", "social_oauth"]) statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE user_id=? OR brand_id IN (?,?)`).bind(plan.sourceUserId, plan.sourceBrandId, plan.targetBrandId));
    statements.push(env.DB.prepare("DELETE FROM social_customers WHERE id=?").bind(preview.source.customer_id));
    for (const table of ["email_accounts", "senderdeck_sessions", "oauth_states", "mcp_authorization_requests", "mcp_authorization_codes", "mcp_oauth_tokens"]) statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(plan.sourceUserId));
    statements.push(env.DB.prepare("DELETE FROM senderdeck_login_states WHERE linking_user_id=?").bind(plan.sourceUserId));
    statements.push(env.DB.prepare("INSERT INTO social_platform_audit (id,user_id,action,keys,created_at) VALUES (?,'hosting-control-plane','legacy_account_retired',?,?)").bind(crypto.randomUUID(), JSON.stringify({ sourceUserId: plan.sourceUserId, targetUserId: plan.targetUserId, sourceBrandId: plan.sourceBrandId, targetBrandId: plan.targetBrandId }), at));
    await env.DB.batch(statements);
    return response({ retired: true, ...preview.summary });
  } catch (error) {
    return response({ error: error instanceof HttpError ? error.message : "Retirement was not applied. Inspect the current state before retrying." }, error instanceof HttpError ? error.status : 409);
  }
}

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
