import Image from "next/image";
import Link from "next/link";
import { senderDeckSignOutPath } from "./senderdeck-auth";
import VersionBadge from "./VersionBadge";

export default function WorkspaceNav({ email, active, source }: { email: string; active: "overview" | "accounts" | "conversations" | "publishing" | "settings"; source?: string }) {
  const links = [ ["overview", "/", "Overview"], ["accounts", "/accounts", "Connections"], ["conversations", "/conversations", "Conversations"], ["publishing", "/publishing", "Publishing"], ["settings", "/settings", "Email settings"] ];
  return <nav className="workspace-nav" aria-label="Main navigation">
    <div className="workspace-brand"><Link className="brand-lockup" href="/" aria-label="SenderDeck home"><Image className="senderdeck-mark" src="/senderdeck-mark.svg" alt="" width={34} height={34} priority /><span className="wordmark">SenderDeck</span></Link><VersionBadge /></div>
    <div className="workspace-links">{links.map(([key, href, name]) => <Link key={key} href={href} aria-current={active === key ? "page" : undefined}>{name}</Link>)}</div>
    <details className="workspace-account-menu"><summary aria-label={`Account: ${email}`} title={email}><span className="workspace-avatar" aria-hidden="true">{email.slice(0, 2).toUpperCase()}</span></summary><div className="workspace-account-panel"><p>{email}<small>{source === "openai" ? "OpenAI sign-in" : "SenderDeck sign-in"}</small></p><a href="/settings/login">Sign-in details</a><a href="/install">Connect your AI client</a><a href="/signin/switch">Switch sign-in</a><a href={senderDeckSignOutPath("/")}>Sign out</a></div></details>
  </nav>;
}
