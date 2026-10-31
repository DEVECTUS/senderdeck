import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const ENDPOINT = "https://senderdeck.devectus.com.au/api/social/maintenance";
/** @param {string | undefined} token @param {typeof fetch} [fetcher] @param {(ms: number) => Promise<unknown>} [wait] */
export async function runMaintenance(token, fetcher = fetch, wait = delay) {
  if (!token) throw new Error("The maintenance secret is not configured.");
  const source = process.env.GITHUB_EVENT_NAME === "schedule" ? "github_schedule" : process.env.GITHUB_EVENT_NAME === "workflow_dispatch" && process.env.MAINTENANCE_UNATTENDED === "true" ? "github_scheduled_dispatch" : "github_dispatch";
  const deadline = Date.now() + 240000;
  for (let attempt = 0; ; attempt++) {
    // Use one deadline for both response headers and the completion body.
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("The maintenance endpoint did not confirm completion.");
    const signal = AbortSignal.timeout(remaining);
    let response;
    let result;
    try {
      response = await fetcher(ENDPOINT, {method:"POST", headers:{authorization:`Bearer ${token}`,"x-senderdeck-maintenance-source":source}, redirect:"manual", signal});
      if (response.ok) result = await response.json();
      else await response.body?.cancel().catch(() => {});
    } catch {
      // An unreadable completion is uncertain; never report it as success.
      // A deadline can leave hosted work running under its lease; do not retry it.
      if (signal.aborted || response?.ok) throw new Error("The maintenance endpoint did not confirm completion.");
      if (attempt === 2) throw new Error("The maintenance endpoint could not be reached.");
      await wait(5000 * (attempt + 1));
      continue;
    }
    if (!response.ok) {
      // Lease contention is safe to retry: the server has not started this run.
      // An unmarked 409 still fails closed (configuration or unknown conflict).
      if (response.status === 409 && response.headers.get("x-senderdeck-maintenance-state") === "busy" && attempt < 2) {
        await wait(30000 * (attempt + 1));
        continue;
      }
      if ([502, 503, 504].includes(response.status) && attempt < 2) {
        await wait(5000 * (attempt + 1));
        continue;
      }
      throw new Error(`The maintenance endpoint returned HTTP ${response.status}.`);
    }
    if (result?.processed !== true || !Number.isInteger(result.reconciled) || !Number.isFinite(Date.parse(result.at))) throw new Error("The maintenance endpoint did not confirm completion.");
    return {processed:true, reconciled:result.reconciled, at:result.at};
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await runMaintenance(process.env.SOCIAL_MAINTENANCE_TOKEN))); }
  catch (error) { console.error(error instanceof Error ? error.message : "Maintenance failed."); process.exitCode=1; }
}
