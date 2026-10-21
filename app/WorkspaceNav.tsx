import Image from "next/image";
import Link from "next/link";
import { senderDeckSignOutPath } from "./senderdeck-auth";

export default function WorkspaceNav({ email, active }: { email: string; active: "overview" | "accounts" | "conversations" | "settings" }) {
  const links = [ ["overview", "/", "Overview"], ["accounts", "/accounts", "Accounts"], ["conversations", "/conversations", "Conversations"], ["settings", "/settings", "Email settings"] ];
  return <nav className="workspace-nav" aria-label="Main navigation">
    <Link className="brand-lockup" href="/" aria-label="SenderDeck home"><Image className="senderdeck-mark" src="/senderdeck-mark.svg" alt="" width={34} height={34} priority /><span className="wordmark">SenderDeck</span></Link>
    <div className="workspace-links">{links.map(([key, href, name]) => <Link key={key} href={href} aria-current={active === key ? "page" : undefined}>{name}</Link>)}</div>
    <div className="workspace-user"><span title={email}>{email}</span><a href={senderDeckSignOutPath("/")}>Sign out</a></div>
  </nav>;
}
