import ProviderIcon from "./ProviderIcon";

type Channel = { name: string; provider: string; description: string; href: string; action: string };
const groups: { name: string; id: string; description: string; channels: Channel[] }[] = [
  { name: "Email", id: "email", description: "Mailboxes belong to your SenderDeck sign-in.", channels: [
    { name: "Google email", provider: "google", description: "Gmail and Google Workspace mailboxes, with authorised sender aliases.", href: "/settings#connections", action: "Connect Google email" },
    { name: "Microsoft email", provider: "microsoft", description: "Outlook and Microsoft 365 mailboxes. Keep each sender account separate.", href: "/settings#connections", action: "Connect Microsoft email" },
  ] },
  { name: "Meta channels", id: "meta", description: "Facebook, Instagram and WhatsApp belong to a brand. Choose a channel to open its setup steps.", channels: [
    { name: "Facebook", provider: "facebook", description: "Connect a business Page for supported messages and comments. Access depends on Meta permissions and live validation.", href: "/connect/meta?provider=facebook", action: "Set up Facebook" },
    { name: "Instagram", provider: "instagram", description: "Connect a professional account for supported messages and comments. Meta authorisation also checks the associated Page.", href: "/connect/meta?provider=instagram", action: "Set up Instagram" },
    { name: "WhatsApp Business", provider: "whatsapp", description: "Keep your Business phone app with Coexistence, or connect an existing Cloud API number. Meta checks eligibility during setup.", href: "/connect/meta?provider=whatsapp", action: "Set up WhatsApp" },
  ] },
  { name: "Other channels", id: "other", description: "Review availability before starting setup.", channels: [
    { name: "LinkedIn", provider: "linkedin", description: "Community and messaging access require separate provider approvals. A LinkedIn inbox is not currently available.", href: "/social-setup#linkedin", action: "View LinkedIn requirements" },
  ] },
];

export default function ConnectionCatalog({ counts, loading = false, brandId, brandOnly = false }: { counts: Record<string, number | undefined>; loading?: boolean; brandId?: string; brandOnly?: boolean }) {
  return <section className="connection-catalog" aria-labelledby="connection-catalog-title">
    <div className="catalog-heading"><div><p className="workspace-kicker">CHOOSE YOUR CHANNEL</p><h2 id="connection-catalog-title">Add a connection</h2><p>Choose an account type, then follow its setup steps.</p></div><a href="/social-setup">Connection guide →</a></div>
    {groups.filter(group => !brandOnly || group.id !== "email").map(group => <section className={`channel-group channel-group-${group.id}`} aria-labelledby={`channel-group-${group.id}`} key={group.id}>
      <div className="channel-group-heading"><h3 id={`channel-group-${group.id}`}>{group.name}</h3><p>{group.description}</p></div>
      <div className="channel-grid">{group.channels.map(channel => <article className={`channel-card channel-${channel.provider}`} key={channel.provider}>
        <div className="channel-card-heading"><span className="channel-mark"><ProviderIcon provider={channel.provider} size={28}/></span><span className="overview-status">{channel.provider === "linkedin" ? "Approval required" : loading ? "Checking connections…" : counts[channel.provider] === undefined ? "Status unavailable" : counts[channel.provider] ? `${counts[channel.provider]} saved` : "Not connected"}</span></div>
        <h4>{channel.name}</h4><p>{channel.description}</p><a href={brandId && group.id === "meta" ? `${channel.href}&brand=${encodeURIComponent(brandId)}` : channel.href}>{channel.action} <span aria-hidden="true">→</span></a>
      </article>)}</div>
    </section>)}
    <p className="catalog-footnote">Saved connections still need channel checks. Setup availability does not confirm Meta approval, live delivery or permission to send. Every reply keeps its draft and approval workflow.</p>
  </section>;
}
