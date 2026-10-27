"use client";

import { useEffect, useState } from "react";
import ProviderIcon from "./ProviderIcon";
import AccountHierarchy from "./AccountHierarchy";
import ConnectionCatalog from "./ConnectionCatalog";

import { loadAccountOverview, type EmailConnection, type SocialConnection, type OverviewWorkspace } from "./account-overview-data";

export default function AccountOverview({ authSource, summary = false }: { authSource?: string; summary?: boolean }) {
  const [emails, setEmails] = useState<EmailConnection[]>([]), [accounts, setAccounts] = useState<SocialConnection[]>([]);
  const [workspace, setWorkspace] = useState<OverviewWorkspace | null>(null);
  const [errors, setErrors] = useState<string[]>([]), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const [emailAvailable, setEmailAvailable] = useState(false), [socialComplete, setSocialComplete] = useState(false);
  const [failedBrandIds, setFailedBrandIds] = useState<string[]>([]);
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all");
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true); setErrors([]); setEmails([]); setAccounts([]); setWorkspace(null); setFailedBrandIds([]);
    setEmailAvailable(false); setSocialComplete(false);
    void loadAccountOverview(signal).then(result => {
      if (signal.aborted) return;
      setEmails(result.emails); setAccounts(result.accounts); setWorkspace(result.workspace);
      setErrors(result.errors); setFailedBrandIds(result.failedBrandIds); setEmailAvailable(result.emailAvailable); setSocialComplete(result.socialComplete); setLoading(false);
    });
    return () => controller.abort();
  }, [refresh]);

  const needle = query.trim().toLowerCase();
  const visibleEmails = filter === "social" ? [] : emails.filter(a => `${a.label} ${a.email} ${a.provider} ${a.senderIdentities?.map(i => i.email).join(" ") || ""}`.toLowerCase().includes(needle));
  const visibleSocial = filter === "email" ? [] : accounts.filter(a => `${a.name} ${a.provider} ${a.asset_id} ${a.brand.name} ${workspace?.customers.find(c => c.id === a.brand.customer_id)?.name || ""}`.toLowerCase().includes(needle));
  const total = emails.length + accounts.length;
  const counts: Record<string, number | undefined> = {};
  for (const provider of ["google", "microsoft"]) counts[provider] = emailAvailable ? emails.filter(a => a.provider === provider).length : undefined;
  for (const provider of ["whatsapp", "facebook", "instagram"]) counts[provider] = socialComplete && workspace ? accounts.filter(a => a.provider === provider).length : undefined;
  return <section className="account-overview" aria-labelledby="overview-accounts-title">

    <div className="overview-stats" aria-label="Account summary">
      <div><span>Email accounts</span><strong>{loading || !emailAvailable ? "—" : emails.length}</strong><small>Google &amp; Microsoft</small></div>
      <div><span>Brand connections</span><strong>{loading || !socialComplete ? "—" : accounts.length}</strong><small>WhatsApp &amp; social accounts</small></div>
      <div><span>Brands</span><strong>{loading ? "—" : workspace?.brands.length ?? "—"}</strong><small>Private workspaces</small></div>
    </div>
    <ConnectionCatalog counts={counts} loading={loading}/>
    {summary ? <div className="overview-next"><h2 id="overview-accounts-title">Your next step</h2><p>Manage linked accounts and their access checks, or open a brand to review conversations and prepare replies.</p><div><a className="primary" href="/accounts">Manage connections →</a><a className="secondary dark" href="/conversations">Open conversations →</a><a href="/install">Connect Codex or Claude →</a></div>{errors.length > 0 && <p role="alert">{errors.join(" ")} Open Connections to review the loaded accounts.</p>}</div> : <div className="overview-panel">
      <div className="overview-panel-heading"><div><h2 id="overview-accounts-title">Connected accounts</h2></div><button type="button" className="overview-refresh" disabled={loading} onClick={() => setRefresh(n => n + 1)}>{loading ? "Loading…" : "Refresh"}</button></div>
      <div className="overview-controls"><div className="overview-filters" role="group" aria-label="Filter accounts">{[["all", "All accounts"], ["email", "Email"], ["social", "Social"]].map(([key, text]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{text}</button>)}</div><label className="overview-search"><span className="sr-only">Search connected accounts</span><input type="search" placeholder="Search accounts or brands" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
      {errors.length > 0 && <div className="overview-errors" role="alert"><strong>Some connections could not be loaded</strong>{errors.map((error, i) => <p key={i}>{error}</p>)}<p>Counts show loaded connections only.</p></div>}
      {loading ? <p className="overview-empty" role="status">Loading your connected accounts…</p> : <>
        {filter !== "social" && <section className="overview-email-section" aria-labelledby="overview-email-title"><div className="hierarchy-heading"><div><h3 id="overview-email-title">Your email accounts</h3></div><a href="/settings#connections">Manage email →</a></div>
        {visibleEmails.length ? <div className="overview-table-wrap"><table className="overview-table"><thead><tr><th scope="col">Account</th><th scope="col">Provider</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {visibleEmails.map(a => <tr key={a.id}><td><strong>{a.label || a.email}</strong><span>{a.email}</span>{a.senderIdentities?.some(i => !i.isPrimary) && <details><summary>Sender aliases</summary>{a.senderIdentities.filter(i => !i.isPrimary).map(i => <span key={i.email}>{i.email}</span>)}</details>}{a.senderDiscoveryError && <small>Aliases need review</small>}</td><td><span className="provider-label"><ProviderIcon provider={a.provider}/>{a.provider === "google" ? "Google" : "Microsoft"}</span></td><td><span className="overview-status">Connected</span></td><td><a className="overview-manage" href={`/settings#account-${encodeURIComponent(a.id)}`} aria-label={`Manage ${a.email}`}>Manage →</a></td></tr>)}
        </tbody></table></div> : <div className="hierarchy-empty"><strong>{!emailAvailable ? "Email accounts could not be loaded" : query ? "No matching email accounts" : "No email accounts connected to this sign-in"}</strong><p>{!emailAvailable ? "Refresh to try again." : query ? "Try another search." : "Connect a Google or Microsoft mailbox to get started."}</p></div>}
        </section>}
        {filter !== "email" && <AccountHierarchy workspace={workspace} accounts={accounts} query={query} failedBrandIds={failedBrandIds} />}
        <p className="overview-count">Showing {visibleEmails.length + visibleSocial.length} of {filter === "social" ? accounts.length : filter === "email" ? emails.length : total} loaded {filter === "all" ? "connections" : `${filter} connections`} for this sign-in.</p>
      </>}
    </div>}
    {authSource === "openai" && <details className="overview-note"><summary>About OpenAI sign-in access</summary><p>Unlinked sign-ins can have separate workspaces. <a href="/signin/switch">Switch sign-in</a></p></details>}
    <p className="overview-note">Access details are under Manage. <a href="/social-setup">Provider requirements</a></p>
  </section>;
}
