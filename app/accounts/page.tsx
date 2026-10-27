import type { Metadata } from "next";
import AccountOverview from "../AccountOverview";
import WorkspaceNav from "../WorkspaceNav";
import { requireSenderDeckUser } from "../senderdeck-auth";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connections | SenderDeck" };
export default async function AccountsPage() {
  const user = await requireSenderDeckUser("/accounts");
  return <main className="workspace-page"><WorkspaceNav source={user.authSource} email={user.email} active="accounts" /><header className="workspace-heading"><div><p className="workspace-kicker">YOUR WORKSPACE</p><h1>Connections</h1><p>Choose a channel, connect an account and check what is ready to use.</p></div><a className="secondary dark" href="/conversations">Open conversations →</a></header><AccountOverview authSource={user.authSource} /></main>;
}
