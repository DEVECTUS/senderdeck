import { HttpError } from "./auth";
import type { Env } from "./env";
import { isUserRetired } from "./retired-users";

/** Hosting-owner-approved links, keyed by exact trusted OpenAI subject IDs.
 * No email matching, client-supplied links, data migration or token revival.
 */
export async function linkedOpenAiIdentity(env: Env, subject: string) {
  if (!env.OPENAI_SIGNIN_LINKS) return undefined;
  let links: Record<string, string>;
  try {
    const parsed = JSON.parse(env.OPENAI_SIGNIN_LINKS);
    const opaque = /^[A-Za-z0-9_-]{1,200}$/;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length > 20) throw new Error();
    for (const [from, to] of Object.entries(parsed)) {
      if (!opaque.test(from) || typeof to !== "string" || !opaque.test(to) || from === to || Object.hasOwn(parsed, to)) throw new Error();
    }
    links = parsed;
  } catch {
    throw new HttpError(503, "OpenAI sign-in linking is unavailable. Please use Google or Microsoft sign-in.");
  }
  if (!Object.hasOwn(links, subject)) return undefined;
  const target = links[subject];
  if (await isUserRetired(env, target)) return null;
  // The destination must still have a real provider identity. A deleted or
  // retired destination revokes the link rather than reviving the source.
  return await env.DB.prepare("SELECT user_id,email FROM senderdeck_identities WHERE user_id=? AND provider IN ('google','microsoft') LIMIT 1")
    .bind(target).first<{ user_id: string; email: string }>();
}
