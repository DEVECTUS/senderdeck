"use client";

import { useEffect, useState } from "react";

import { loadAccountOverview, type EmailConnection, type SocialConnection, type OverviewWorkspace } from "./account-overview-data";

export default function AccountOverview() {
  const [emails, setEmails] = useState<EmailConnection[]>([]), [accounts, setAccounts] = useState<SocialConnection[]>([]);
  const [workspace, setWorkspace] = useState<OverviewWorkspace | null>(null);
  const [errors, setErrors] = useState<string[]>([]), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const [emailAvailable, setEmailAvailable] = useState(false), [socialComplete, setSocialComplete] = useState(false);
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all");
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true); setErrors([]); setEmails([]); setAccounts([]); setWorkspace(null);
    setEmailAvailable(false); setSocialComplete(false);
    void loadAccountOverview(signal).then(result => {
      if (signal.aborted) return;
      setEmails(result.emails); setAccounts(result.accounts); setWorkspace(result.workspace);
      setErrors(result.errors); setEmailAvailable(result.emailAvailable); setSocialComplete(result.socialComplete); setLoading(false);
    });
    return () => controller.abort();
  }, [refresh]);

  const needle = query.trim().toLowerCase();
  const visibleEmails = filter === "social" ? [] : emails.filter(a => `${a.label} ${a.email} ${a.provider} ${a.senderIdentities?.map(i => i.email).join(" ") || ""}`.toLowerCase().includes(needle));
  const visibleSocial = filter === "email" ? [] : accounts.filter(a => `${a.name} ${a.provider} ${a.asset_id} ${a.brand.name} ${workspace?.customers.find(c => c.id === a.brand.customer_id)?.name || ""}`.toLowerCase().includes(needle));
  const total = emails.length + accounts.length;
  return <section className="account-overview" aria-labelledby="overview-accounts-title">
    <div className="overview-stats" aria-label="Account summary">
      <div><span>Email accounts</span><strong>{loading || !emailAvailable ? "—" : emails.length}</strong><small>Google &amp; Microsoft</small></div>
      <div><span>Social connections</span><strong>{loading || !socialComplete ? "—" : accounts.length}</strong><small>Across your brands</small></div>
      <div><span>Brands</span><strong>{loading ? "—" : workspace?.brands.length ?? "—"}</strong><small>Private workspaces</small></div>
    </div>
    <div className="overview-panel">
      <div className="overview-panel-heading"><div><h2 id="overview-accounts-title">Connected accounts</h2><p>Email and social connections you can access in this workspace.</p></div><button type="button" className="overview-refresh" disabled={loading} onClick={() => setRefresh(n => n + 1)}>{loading ? "Loading…" : "Refresh"}</button></div>
      <div className="overview-controls"><div className="overview-filters" role="group" aria-label="Filter accounts">{[["all", "All accounts"], ["email", "Email"], ["social", "Social"]].map(([key, text]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{text}</button>)}</div><label className="overview-search"><span className="sr-only">Search connected accounts</span><input type="search" placeholder="Search accounts or brands" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
      {errors.length > 0 && <div className="overview-errors" role="alert"><strong>Some connections could not be loaded</strong>{errors.map((error, i) => <p key={i}>{error}</p>)}<p>Counts show loaded connections only.</p></div>}
      {loading ? <p className="overview-empty" role="status">Loading your connected accounts…</p> : <>
        {(visibleEmails.length > 0 || visibleSocial.length > 0) && <div className="overview-table-wrap"><table className="overview-table"><thead><tr><th scope="col">Account</th><th scope="col">Provider</th><th scope="col">Brand / workspace</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {visibleEmails.map(a => <tr key={a.id}><td><strong>{a.label || a.email}</strong><span>{a.email}</span>{a.senderIdentities?.some(i => !i.isPrimary) && <details><summary>Sender aliases</summary>{a.senderIdentities.filter(i => !i.isPrimary).map(i => <span key={i.email}>{i.email}</span>)}</details>}{a.senderDiscoveryError && <small>Aliases need review</small>}</td><td>{a.provider === "google" ? "Google" : "Microsoft"}<span>Email</span></td><td>Your mailbox</td><td><span className="overview-status">Saved connection</span><small>Live access checked when used</small></td><td><a className="overview-manage" href={`/settings#account-${encodeURIComponent(a.id)}`} aria-label={`Manage ${a.email}`}>Manage →</a></td></tr>)}
          {visibleSocial.map(a => <tr key={a.id}><td><strong>{a.name}</strong><span>{a.asset_id}</span></td><td className="overview-provider">{a.provider}<span>Social</span></td><td>{a.brand.name}<span>{workspace?.customers.find(c => c.id === a.brand.customer_id)?.name}</span></td><td><span className={`overview-status ${a.status === "connected" ? "" : "needs-review"}`}>{a.status.replaceAll("_", " ")}</span><small>Messages: {String(a.capabilities.messages || "unverified").replaceAll("_", " ")} · Comments: {String(a.capabilities.comments || "unverified").replaceAll("_", " ")}</small></td><td><a className="overview-manage" href={`/conversations?brand=${encodeURIComponent(a.brand.id)}&account=${encodeURIComponent(a.id)}&tab=Connections`} aria-label={`Manage ${a.name} for ${a.brand.name}`}>Manage →</a></td></tr>)}
        </tbody></table></div>}
        {!visibleEmails.length && !visibleSocial.length && <div className="overview-empty"><h3>{total || query || filter !== "all" ? "No matching accounts" : errors.length ? "Connections unavailable" : "Connect your first account"}</h3><p>{total || query || filter !== "all" ? "Try another search or account filter." : errors.length ? "Refresh to load your connections again." : "Add an email account, or connect a social account to a brand."}</p></div>}
        <p className="overview-count">Showing {visibleEmails.length + visibleSocial.length} of {total} loaded connections. Linked mailboxes appear once under Email.</p>
      </>}
    </div>
    <div className="overview-shortcuts"><a href="/settings#connections"><strong>Connect email <span>→</span></strong><span>Add Google or Microsoft accounts.</span></a><a href="/connect/meta"><strong>Connect social <span>→</span></strong><span>Choose a brand and authorise Meta.</span></a><a href="/install"><strong>Set up your AI client <span>→</span></strong><span>Installation steps for Codex or Claude.</span></a></div>
    <p className="overview-note">Social connections can have limited access. Open Manage for validation and coverage details. <a href="/social-setup">Provider requirements</a></p>
  </section>;
}
