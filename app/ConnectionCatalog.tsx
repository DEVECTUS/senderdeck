"use client";
import { useState } from "react";
import ProviderIcon from "./ProviderIcon";

const channels = [
  { name: "Google", provider: "google", group: "Email", method: "Google account", description: "Connect Gmail or Google Workspace. Choose a mailbox and review sender aliases in email settings.", href: "/oauth/google/start?label=Google%20account" },
  { name: "Microsoft", provider: "microsoft", group: "Email", method: "Microsoft account", description: "Connect Outlook or Microsoft 365. Each mailbox stays a separate sender identity.", href: "/oauth/microsoft/start?label=Microsoft%20account" },
  { name: "Facebook", provider: "facebook", group: "Social", method: "Sign in with Meta", description: "Choose a brand, authorise Meta, then select the Pages you manage. Available access is checked for each account.", href: "/connect/meta?provider=facebook" },
  { name: "Instagram", provider: "instagram", group: "Social", method: "Sign in with Meta", description: "Choose a brand and authorise Meta, then select a professional Instagram account linked to your Page.", href: "/connect/meta?provider=instagram" },
  { name: "WhatsApp", provider: "whatsapp", group: "Social", method: "WhatsApp Business", description: "Choose a brand, then connect an existing Business app or Cloud API number. Meta checks eligibility during setup.", href: "/connect/meta?provider=whatsapp" },
  { name: "LinkedIn", provider: "linkedin", group: "Social", method: "Provider approval required", description: "Direct publishing requires LinkedIn programme approval and an authorised company connection. Review the current requirements before connecting.", href: "/social-setup#linkedin" },
];
export default function ConnectionCatalog({ counts, loading = false, brandId, brandOnly = false }: { counts: Record<string, number | undefined>; loading?: boolean; brandId?: string; brandOnly?: boolean }) {
  const [query, setQuery] = useState(""), [group, setGroup] = useState("All");
  const available = channels.filter(channel => !brandOnly || channel.group === "Social");
  const filtered = available.filter(channel => (group === "All" || group === channel.group) && `${channel.name} ${channel.method} ${channel.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="connection-catalog" aria-label="Add connection">
    <h2 className="workspace-section-title"><span>Add a connection</span><i aria-hidden="true"/><span className="workspace-section-count">{available.length}</span></h2>
    <div className="connection-catalog-filters">
      <label><span className="sr-only">Filter providers</span><input type="search" placeholder="Filter providers…" value={query} onChange={event => setQuery(event.target.value)}/></label>
      {!brandOnly && <div className="connection-segments" role="group" aria-label="Connection category">{["All", "Email", "Social"].map(category => <button type="button" key={category} aria-pressed={group === category} onClick={() => setGroup(category)}>{category}</button>)}</div>}
    </div>
    <div className="connection-provider-grid">{filtered.map(channel => {
      const href = brandId && ["facebook", "instagram", "whatsapp"].includes(channel.provider) ? `${channel.href}&brand=${encodeURIComponent(brandId)}` : channel.href;
      const count = counts[channel.provider];
      return <article className="connection-provider" key={channel.provider}>
        <div className="connection-provider-line"><span className="connection-provider-logo"><ProviderIcon provider={channel.provider} size={24}/></span><div className="connection-provider-name"><h3>{channel.name}</h3><p>{channel.method}{channel.provider !== "linkedin" && <span> · {loading ? "Loading…" : count === undefined ? "Status unavailable" : `${count} connected`}</span>}</p></div><a className="connection-connect" href={href} aria-label={`${channel.provider === "linkedin" ? "View requirements for" : "Connect"} ${channel.name}`}>{channel.provider === "linkedin" ? "Requirements" : count ? "Add account" : "Connect"}</a></div>
        <details className="connection-provider-details"><summary>About this connection</summary><p>{channel.description}</p></details>
      </article>;
    })}</div>
    {!filtered.length && <p className="connections-empty" role="status">No providers match your filters. <button type="button" className="connection-clear" onClick={() => { setQuery(""); setGroup("All"); }}>Clear filters</button></p>}
  </section>;
}
