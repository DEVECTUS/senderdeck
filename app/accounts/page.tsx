import type { Metadata } from "next";
import AccountOverview from "../AccountOverview";
import WorkspaceNav from "../WorkspaceNav";
import { requireSenderDeckUser } from "../senderdeck-auth";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connected accounts | SenderDeck" };
export default async function AccountsPage() {
  const user = await requireSenderDeckUser("/accounts");
  return <main className="workspace-page"><WorkspaceNav email={user.email} active="accounts" /><header className="workspace-heading"><div><p className="workspace-kicker">YOUR WORKSPACE</p><h1>Accounts</h1><p>All your email and social connections, in one place.</p></div><a className="secondary dark" href="/conversations">Open conversations →</a></header><AccountOverview /></main>;
}
