import Image from "next/image";
import Link from "next/link";
import { senderDeckSignOutPath } from "./senderdeck-auth";
import VersionBadge from "./VersionBadge";

export default function WorkspaceNav({ email, active, source }: { email: string; active: "overview" | "accounts" | "conversations" | "settings"; source?: string }) {
  const links = [ ["overview", "/", "Overview"], ["accounts", "/accounts", "Connections"], ["conversations", "/conversations", "Conversations"], ["settings", "/settings", "Email settings"] ];
  return <nav className="workspace-nav" aria-label="Main navigation">
    <div className="workspace-brand"><Link className="brand-lockup" href="/" aria-label="SenderDeck home"><Image className="senderdeck-mark" src="/senderdeck-mark.svg" alt="" width={34} height={34} priority /><span className="wordmark">SenderDeck</span></Link><VersionBadge /></div>
    <div className="workspace-links">{links.map(([key, href, name]) => <Link key={key} href={href} aria-current={active === key ? "page" : undefined}>{name}</Link>)}</div>
    <div className="workspace-user"><span title={email}>{email}<small>{source === "openai" ? "OpenAI sign-in" : "SenderDeck sign-in"}</small></span><a href="/signin/switch">Switch sign-in</a><a href={senderDeckSignOutPath("/")}>Sign out</a></div>
  </nav>;
}
