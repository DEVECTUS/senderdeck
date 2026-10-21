import { sha256Base64Url } from "./crypto";
import type { Env } from "./env";

// Durable, non-reversible access revocation. No email addresses or credentials
// are retained in the marker; it must not be removed by runtime lease cleanup.
export async function retiredUserKey(userId: string) {
  return `retired_user:${await sha256Base64Url(userId)}`;
}

export async function isUserRetired(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT value FROM social_runtime WHERE key=?")
    .bind(await retiredUserKey(userId)).first<{ value: number }>();
  return typeof row?.value === "number" && row.value > 0;
}
