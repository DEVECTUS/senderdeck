import ProviderIcon from "./ProviderIcon";
import type { EmailConnection, OverviewWorkspace, SocialConnection } from "./account-overview-data";

export const channelNames: Record<string, string> = { google: "Google", microsoft: "Microsoft", facebook: "Facebook", instagram: "Instagram", whatsapp: "WhatsApp", linkedin: "LinkedIn" };

export function connectionStatus(account: { status: string; provider: string; capabilities: { messages?: string; comments?: string } }) {
  if (["revoked", "expired", "pending_authorization"].includes(account.status)) return { label: "Reconnect", tone: "error" };
  if (account.status === "limited") return { label: "Limited access", tone: "warning" };
  if (account.status !== "connected") return { label: account.status === "disconnected" ? "Disconnected" : "Needs check", tone: "warning" };
  const required = account.provider === "whatsapp" ? [account.capabilities.messages] : [account.capabilities.messages, account.capabilities.comments];
  if (required.every(value => value === "available")) return { label: "Connected", tone: "ok" };
  if (required.every(value => value === "unavailable")) return { label: "Access unavailable", tone: "error" };
  return { label: required.some(value => value === "available") ? "Limited access" : "Needs check", tone: "warning" };
}

export default function ConnectionTable({ emails, accounts, workspace, query = "", provider = "all", loading = false, failedBrandIds = [] }: {
  emails: EmailConnection[]; accounts: SocialConnection[]; workspace: OverviewWorkspace | null; query?: string; provider?: string; loading?: boolean; failedBrandIds?: string[];
}) {
  const needle = query.trim().toLowerCase();
  const rows = [
    ...emails.map(account => ({ key: `email:${account.id}`, provider: account.provider, name: account.label || account.email, detail: account.email, brand: "—", customer: "", search: account.senderIdentities?.map(identity => identity.email).join(" ") || "", status: account.senderDiscoveryError ? { label: "Needs attention", tone: "warning" } : { label: "Connected", tone: "ok" }, title: account.senderDiscoveryError || "Mailbox linked. Live provider access is checked when used.", href: `/settings#account-${encodeURIComponent(account.id)}` })),
    ...accounts.map(account => ({ key: `social:${account.id}`, provider: account.provider, name: account.name, detail: "", brand: account.brand.name, customer: workspace?.customers.find(customer => customer.id === account.brand.customer_id)?.name || "", search: account.asset_id, status: connectionStatus(account), title: `Messages: ${account.capabilities.messages || "unverified"}; comments: ${account.provider === "whatsapp" ? "not applicable" : account.capabilities.comments || "unverified"}`, href: `/conversations?brand=${encodeURIComponent(account.brand.id)}&account=${encodeURIComponent(account.id)}&tab=Connections` })),
  ].filter(row => (provider === "all" || row.provider === provider) && `${row.name} ${row.detail} ${row.provider} ${channelNames[row.provider] || ""} ${row.brand} ${row.customer} ${row.search}`.toLowerCase().includes(needle));
  const failedBrands = workspace?.brands.filter(brand => failedBrandIds.includes(brand.id) && `${brand.name} ${workspace.customers.find(customer => customer.id === brand.customer_id)?.name || ""}`.toLowerCase().includes(needle)) || [];
  return <div className="connections-table-wrap"><table className="connections-table" aria-label="Connected accounts">
    <thead><tr><th scope="col">Account</th><th scope="col">Channel</th><th scope="col">Brand</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
    <tbody>
      {rows.map(row => <tr key={row.key}>
        <td><strong>{row.name}</strong>{row.detail && row.detail !== row.name && <small>{row.detail}</small>}</td>
        <td><span className="provider-label"><ProviderIcon provider={row.provider} size={18}/>{channelNames[row.provider] || row.provider}</span></td>
        <td>{row.brand}{row.customer && row.customer !== row.brand && <small>{row.customer}</small>}</td>
        <td><span className={`connection-state ${row.status.tone}`} title={row.title}>{row.status.label}</span></td>
        <td><a href={row.href} aria-label={`Manage ${row.name}${row.brand !== "—" ? ` for ${row.brand}` : ""}`}>Manage</a></td>
      </tr>)}
      {failedBrands.map(brand => <tr key={`failed:${brand.id}`}><td>Accounts not loaded</td><td>—</td><td>{brand.name}</td><td><span className="connection-state error">Unavailable</span></td><td><a href={`/conversations?brand=${encodeURIComponent(brand.id)}&tab=Connections`}>Manage</a></td></tr>)}
      {!rows.length && !failedBrands.length && <tr><td colSpan={5} className="connections-empty">{loading ? "Loading connections…" : query || provider !== "all" ? "No matching connections." : "No connections loaded."}</td></tr>}
    </tbody>
  </table></div>;
}
