import { pathToFileURL } from "node:url";

const ENDPOINT = "https://senderdeck.devectus.com.au/api/social/maintenance";
/** @param {string | undefined} token @param {typeof fetch} [fetcher] */
export async function runMaintenance(token, fetcher = fetch) {
  if (!token) throw new Error("The maintenance secret is not configured.");
  let response;
  try { response = await fetcher(ENDPOINT, {method:"POST", headers:{authorization:`Bearer ${token}`,"x-senderdeck-maintenance-source":process.env.GITHUB_EVENT_NAME === "schedule" ? "github_schedule" : "github_dispatch"}, redirect:"manual", signal:AbortSignal.timeout(60000)}); }
  catch { throw new Error("The maintenance endpoint could not be reached."); }
  if (!response.ok) throw new Error(`The maintenance endpoint returned HTTP ${response.status}.`);
  const result = await response.json().catch(()=>null);
  if (result?.processed !== true || !Number.isInteger(result.reconciled) || !Number.isFinite(Date.parse(result.at))) throw new Error("The maintenance endpoint did not confirm completion.");
  return {processed:true, reconciled:result.reconciled, at:result.at};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await runMaintenance(process.env.SOCIAL_MAINTENANCE_TOKEN))); }
  catch (error) { console.error(error instanceof Error ? error.message : "Maintenance failed."); process.exitCode=1; }
}
