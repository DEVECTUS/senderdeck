import ProviderIcon from "./ProviderIcon";

const channels = [
  { name: "Google", provider: "google", href: "/oauth/google/start?label=Google%20account" },
  { name: "Microsoft", provider: "microsoft", href: "/oauth/microsoft/start?label=Microsoft%20account" },
  { name: "Facebook", provider: "facebook", href: "/connect/meta?provider=facebook" },
  { name: "Instagram", provider: "instagram", href: "/connect/meta?provider=instagram" },
  { name: "WhatsApp", provider: "whatsapp", href: "/connect/meta?provider=whatsapp" },
  { name: "LinkedIn", provider: "linkedin", href: "/social-setup#linkedin" },
];
export default function ConnectionCatalog({ counts, loading = false, brandId, brandOnly = false }: { counts: Record<string, number | undefined>; loading?: boolean; brandId?: string; brandOnly?: boolean }) {
  return <details className="connection-add"><summary>Add connection</summary>
    <div className="connections-table-wrap"><table className="connections-table connection-options" aria-label="Add connection">
      <thead><tr><th scope="col">Channel</th><th scope="col">Linked accounts</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
      <tbody>{channels.filter(channel => !brandOnly || !["google", "microsoft"].includes(channel.provider)).map(channel => <tr key={channel.provider}>
        <td><span className="provider-label"><ProviderIcon provider={channel.provider} size={18}/>{channel.name}</span></td>
        <td>{channel.provider === "linkedin" ? "Not available" : loading ? "Loading…" : counts[channel.provider] === undefined ? "Unknown" : counts[channel.provider] || "Not connected"}</td>
        <td><a href={brandId && ["facebook", "instagram", "whatsapp"].includes(channel.provider) ? `${channel.href}&brand=${encodeURIComponent(brandId)}` : channel.href} aria-label={`${channel.provider === "linkedin" ? "View requirements for" : "Connect"} ${channel.name}`}>{channel.provider === "linkedin" ? "Requirements" : "Connect"}</a></td>
      </tr>)}</tbody>
    </table></div>
  </details>;
}
