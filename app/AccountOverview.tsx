"use client";

import { useEffect, useState } from "react";
import ConnectionCatalog from "./ConnectionCatalog";
import ConnectionTable, { channelNames } from "./ConnectionTable";
import { loadAccountOverview, type EmailConnection, type SocialConnection, type OverviewWorkspace } from "./account-overview-data";

export default function AccountOverview(_props: { authSource?: string; summary?: boolean }) {
  const [emails, setEmails] = useState<EmailConnection[]>([]), [accounts, setAccounts] = useState<SocialConnection[]>([]);
  const [workspace, setWorkspace] = useState<OverviewWorkspace | null>(null);
  const [errors, setErrors] = useState<string[]>([]), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const [emailAvailable, setEmailAvailable] = useState(false), [socialComplete, setSocialComplete] = useState(false);
  const [failedBrandIds, setFailedBrandIds] = useState<string[]>([]);
  const [query, setQuery] = useState(""), [provider, setProvider] = useState("all");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void loadAccountOverview(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setEmails(result.emails); setAccounts(result.accounts); setWorkspace(result.workspace);
      setErrors(result.errors); setFailedBrandIds(result.failedBrandIds);
      setEmailAvailable(result.emailAvailable); setSocialComplete(result.socialComplete); setLoading(false);
    });
    return () => controller.abort();
  }, [refresh]);
  const counts: Record<string, number | undefined> = {};
  for (const channel of ["google", "microsoft"]) counts[channel] = emailAvailable ? emails.filter(account => account.provider === channel).length : undefined;
  for (const channel of ["facebook", "instagram", "whatsapp"]) counts[channel] = socialComplete && workspace ? accounts.filter(account => account.provider === channel).length : undefined;
  return <section className="connections-list" aria-label="Your connections">
    <div className="connections-toolbar">
      <label><span className="sr-only">Search connected accounts</span><input type="search" placeholder="Search accounts or brands" value={query} onChange={event => setQuery(event.target.value)}/></label>
      <label><span className="sr-only">Channel</span><select value={provider} onChange={event => setProvider(event.target.value)}><option value="all">All channels</option>{Object.entries(channelNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      <span className="connection-total" aria-live="polite">{loading ? "Loading…" : `${emails.length + accounts.length}${errors.length ? "+" : ""} accounts`}</span>
      <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
    </div>
    {errors.length > 0 && <p className="connections-error" role="alert">{errors.join(" ")}</p>}
    <ConnectionTable emails={emails} accounts={accounts} workspace={workspace} query={query} provider={provider} loading={loading} failedBrandIds={failedBrandIds}/>
    <ConnectionCatalog counts={counts} loading={loading}/>
  </section>;
}
