import ProviderIcon from "./ProviderIcon";

type Channel = { name: string; provider: string; description: string; href: string; action: string };
const channels: Channel[] = [
  { name: "Google email", provider: "google", description: "Gmail and Google Workspace mailboxes, with authorised sender aliases.", href: "/settings#connections", action: "Connect Google email" },
  { name: "Microsoft email", provider: "microsoft", description: "Outlook and Microsoft 365 mailboxes. Keep each sender account separate.", href: "/settings#connections", action: "Connect Microsoft email" },
  { name: "WhatsApp Business", provider: "whatsapp", description: "Keep your Business phone app with Coexistence, or connect an existing Cloud API number. Meta checks eligibility during setup.", href: "/connect/meta?provider=whatsapp", action: "Set up WhatsApp" },
  { name: "Facebook", provider: "facebook", description: "Connect a business Page for supported messages and comments. Access depends on Meta permissions and live validation.", href: "/connect/meta?provider=facebook", action: "Set up Facebook" },
  { name: "Instagram", provider: "instagram", description: "Connect a professional account for supported messages and comments. Permissions and delivery need verification.", href: "/connect/meta?provider=instagram", action: "Set up Instagram" },
  { name: "LinkedIn", provider: "linkedin", description: "Community and messaging access require separate provider approvals. A LinkedIn inbox is not currently available.", href: "/social-setup#linkedin", action: "View LinkedIn requirements" },
];

export default function ConnectionCatalog({ counts, loading = false }: { counts: Record<string, number | undefined>; loading?: boolean }) {
  return <section className="connection-catalog" aria-labelledby="connection-catalog-title">
    <div className="catalog-heading"><div><p className="workspace-kicker">CHOOSE YOUR CHANNEL</p><h2 id="connection-catalog-title">Add a connection</h2><p>Email belongs to your sign-in. WhatsApp and social accounts belong to a brand.</p></div><a href="/social-setup">Connection guide →</a></div>
    <div className="channel-grid">{channels.map(channel => <article className={`channel-card channel-${channel.provider}`} key={channel.provider}>
      <div className="channel-card-heading"><span className="channel-mark"><ProviderIcon provider={channel.provider} size={25}/></span><span className="overview-status">{channel.provider === "linkedin" ? "Approval required" : loading ? "Checking connections…" : counts[channel.provider] === undefined ? "Status unavailable" : counts[channel.provider] ? `${counts[channel.provider]} saved` : "Not connected"}</span></div>
      <h3>{channel.name}</h3><p>{channel.description}</p><a href={channel.href}>{channel.action} <span aria-hidden="true">→</span></a>
    </article>)}</div>
    <p className="catalog-footnote">Linked accounts still need channel checks. Setup availability does not confirm Meta approval, live delivery or permission to send. Every reply keeps its draft and approval workflow.</p>
  </section>;
}
