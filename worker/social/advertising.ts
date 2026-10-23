import { HttpError } from "../auth";
import { decrypt } from "../crypto";
import type { Env } from "../env";
import { graph, inspectToken, GRAPH_VERSION, type ReadBudget } from "./meta";
import { json, type SocialAccount } from "./model";

export interface AdvertisingSelection { id: string; name: string; selectedAt: number; selectedBy: string }
type ObjectRow = Record<string, unknown>;
export function advertisingSelection(account: SocialAccount): AdvertisingSelection | null {
  const selection = json<{ advertisingAccount?: AdvertisingSelection }>(account.validation).advertisingAccount;
  return selection && /^act_\d{1,32}$/.test(selection.id) && Number.isFinite(selection.selectedAt) ? selection : null;
}
export async function advertisingGrant(env: Env, token: string, providerUserId?: string | null, budget?: ReadBudget) {
  const grant = await inspectToken(env, token, budget);
  if (providerUserId && grant.providerUserId !== providerUserId) throw new HttpError(403, "Advertising grant identity does not match this social account.");
  if (!grant.permissions.some(scope => scope === "ads_read" || scope === "ads_management")) throw new HttpError(409, "Advertising reads need an existing ads_read grant (or existing ads_management). Owner approval and fresh Meta consent are required before adding ads_read; no scope has been changed.");
  return grant;
}
export async function advertisingAccount(token: string, accountId: string, budget?: ReadBudget) {
  if (!/^act_\d{1,32}$/.test(accountId)) throw new HttpError(400, "Choose an exact provider-returned act_ advertising account ID.");
  const row = await graph(token, accountId, { fields: "id,name,account_status" }, "GET", budget);
  if (row.id !== accountId) throw new HttpError(403, "Advertising account identity was not verified.");
  return { id: accountId, name: String(row.name || accountId), status: typeof row.account_status === "number" ? row.account_status : null };
}
export async function advertisingAssets(env: Env, token: string, after?: string) {
  await advertisingGrant(env, token);
  if (after && after.length > 2000) throw new HttpError(400, "Invalid advertising account cursor.");
  const page = await graph(token, "me/adaccounts", { fields: "id,name,account_status", limit: "20", ...(after ? { after } : {}) });
  if (!Array.isArray(page.data)) throw new HttpError(502, "Meta returned an unexpected advertising account collection.");
  const rows = page.data as ObjectRow[];
  if (rows.length > 20) throw new HttpError(502, "Meta exceeded the advertising account discovery page size.");
  const paging = page.paging as { next?: string; cursors?: { after?: string } } | undefined;
  const nextCursor = paging?.next && typeof paging.cursors?.after === "string" ? paging.cursors.after : null;
  return { assets: rows.filter(row => typeof row.id === "string" && /^act_\d{1,32}$/.test(row.id)).map(row => ({ provider: "advertising", assetId: String(row.id), name: String(row.name || row.id), status: row.account_status, assignment: { state: "requires_explicit_selection" } })),
    nextCursor, complete: !paging?.next, gaps: paging?.next && !nextCursor ? ["provider_account_cursor_unavailable"] : [], selected: false };
}

// Read one authorised creative page, then verify actual root authorship before
// exposing ANY content. An ad account may contain several customers' creatives.
export async function adCreativeRoots(env: Env, account: SocialAccount, limit: number, budget: ReadBudget, continuation?: { path: string; depth: number }) {
  const selected = advertisingSelection(account);
  if (!selected) throw new HttpError(409, "No advertising account has been explicitly approved for this social account. Use a fresh owner-bound Meta grant with ads_read, list advertising assets, then confirm the exact ad account and target social account. No advertising endpoint was read.");
  if (!account.user_token || !account.provider_user_id) throw new HttpError(409, "Reconnect the granting identity before advertising reads.");
  const token = await decrypt(account.user_token, env.TOKEN_ENCRYPTION_KEY);
  await advertisingGrant(env, token, account.provider_user_id, budget);
  await advertisingAccount(token, selected.id, budget);
  const path = `/${GRAPH_VERSION}/${selected.id}/adcreatives`;
  const url = continuation ? new URL(continuation.path) : new URL(`https://graph.facebook.com${path}`);
  if (url.origin !== "https://graph.facebook.com" || url.pathname !== path) throw new HttpError(400, "Advertising cursor belongs to a different account or edge.");
  url.searchParams.delete("access_token");
  if (!continuation) { url.searchParams.set("fields", "id,effective_object_story_id,effective_instagram_media_id"); url.searchParams.set("limit", String(Math.min(limit, 5))); }
  const page = await graph(token, url.href, {}, "GET", budget);
  if (!Array.isArray(page.data) || page.data.length > 20) throw new HttpError(502, "Meta returned an unexpected creative page.");
  const rows = page.data as ObjectRow[]; const roots: ObjectRow[] = []; const seen = new Set<string>(); const gaps: string[] = [];
  const rootToken = account.provider === "facebook" ? await decrypt(account.token!, env.TOKEN_ENCRYPTION_KEY) : token;
  for (let index = continuation?.depth || 0; index < rows.length; index++) {
    const creative = rows[index]; const rootId = account.provider === "facebook" ? creative.effective_object_story_id : creative.effective_instagram_media_id;
    if (typeof rootId !== "string" || !/^\d{1,32}(?:_\d{1,32})?$/.test(rootId)) { gaps.push("creative_has_no_effective_root_for_selected_channel"); continue; }
    if (seen.has(rootId)) continue; seen.add(rootId);
    let root: ObjectRow;
    try { root = await graph(rootToken, rootId, { fields: account.provider === "facebook" ? "id,from,message,created_time,permalink_url" : "id,owner,caption,timestamp,permalink" }, "GET", budget); }
    catch { gaps.push("creative_root_verification_unavailable_retry_cursor"); return { roots, gaps, next: { path: url.href, depth: index } }; }
    const owner = (account.provider === "facebook" ? root.from : root.owner) as { id?: string } | undefined;
    if (root.id !== rootId || owner?.id !== account.asset_id) { gaps.push("creative_root_not_verified_for_selected_asset"); continue; }
    roots.push(root);
  }
  const next = (page.paging as { next?: string })?.next;
  if (next) {
    const nextUrl = new URL(next);
    if (nextUrl.origin !== url.origin || nextUrl.pathname !== path) throw new HttpError(502, "Advertising pagination URL was rejected.");
  }
  return { roots, gaps, next: next ? { path: next, depth: 0 } : null };
}
