import type { Metadata } from "next";
import Link from "next/link";
import { requireSenderDeckUser } from "../../senderdeck-auth";
import WorkspaceNav from "../../WorkspaceNav";
import PasswordSettings from "./PasswordSettings";

export const metadata: Metadata = { title: "Sign-in details | SenderDeck" };
export const dynamic = "force-dynamic";
export default async function LoginSettingsPage() {
  const user = await requireSenderDeckUser("/settings/login");
  return <main className="workspace-page settings-page">
    <WorkspaceNav source={user.authSource} email={user.email} active="settings" />
    <header className="workspace-heading"><div><p className="workspace-kicker">SIGN-IN DETAILS</p><h1>Username and password</h1><p>Add a SenderDeck login for this account. It opens the same workspaces and connected mailboxes.</p></div><Link href="/settings">Back to settings</Link></header>
    <PasswordSettings email={user.email} />
  </main>;
}
