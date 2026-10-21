import type { Env } from "../env";
import { json, maintenanceStatus, type SocialAccount } from "./model";

export type MonitorEvidence = { messages_at: number | null; comments_at: number | null; poll_at: number | null; poll_errors: string };
export async function monitoringEvidence(env: Env, accountId: string) {
  return env.DB.prepare("SELECT messages_at,comments_at,poll_at,poll_errors FROM social_monitor_evidence WHERE account_id=?").bind(accountId).first<MonitorEvidence>();
}
export async function recordDelivery(env: Env, accountId: string, kind: "messages" | "comments") {
  // The only callers are after verified Meta signatures and exact account routing.
  const column = kind === "messages" ? "messages_at" : "comments_at";
  await env.DB.prepare(`INSERT INTO social_monitor_evidence (account_id,${column}) VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET ${column}=excluded.${column}`).bind(accountId, Date.now()).run();
}
export async function recordPoll(env: Env, accountId: string, errors: string[]) {
  await env.DB.prepare("INSERT INTO social_monitor_evidence (account_id,poll_at,poll_errors) VALUES (?,?,?) ON CONFLICT(account_id) DO UPDATE SET poll_at=excluded.poll_at,poll_errors=excluded.poll_errors").bind(accountId, Date.now(), JSON.stringify([...new Set(errors)])).run();
}
export async function accountMonitoring(env: Env, account: SocialAccount, caps: {webhook:boolean;messages:string;comments:string}) {
  const evidence = await monitoringEvidence(env, account.id);
  const runtime = await maintenanceStatus(env);
  const settings = json<{enabled?:boolean;intervalMinutes?:number}>(account.monitoring);
  const at = Date.now(), recentPoll = !!evidence?.poll_at && at - evidence.poll_at >= 0 && at - evidence.poll_at <= Math.max(20, (settings.intervalMinutes || 10) * 2) * 60000;
  const deliveryObserved = !!evidence?.messages_at && !!evidence?.comments_at;
  const errors = json<string[]>(evidence?.poll_errors || "[]");
  return { requested: !!settings.enabled, intervalMinutes: settings.intervalMinutes || 10,
    active: !!settings.enabled && recentPoll && deliveryObserved && caps.webhook && caps.messages === "available" && caps.comments === "available" && runtime.backgroundScheduling === "recent",
    polling: recentPoll ? "recent_completed_check" : "no_recent_completed_check",
    lastPollAt: evidence?.poll_at || null, coverage: errors.length ? "partial_or_unverified" : evidence?.poll_at ? "last_check_had_no_reported_gaps" : "unverified", gaps: errors,
    signedDelivery: { messagesAt: evidence?.messages_at || null, commentsAt: evidence?.comments_at || null, bothChannelsObserved: deliveryObserved },
    subscriptionVerified: caps.webhook, readableChannels: { messages: caps.messages, comments: caps.comments }, recurringExecution: runtime.backgroundScheduling,
    note: "A completed check, subscription setting and actual signed delivery are separate evidence. A manual check does not prove an unattended schedule or complete provider history." };
}
