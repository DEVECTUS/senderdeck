import type { Metadata } from "next";
import Link from "next/link";
import AccountManager from "../AccountManager";
import WorkspaceNav from "../WorkspaceNav";
import { requireSenderDeckUser } from "../senderdeck-auth";

export const metadata: Metadata = {
  title: "Email settings | SenderDeck",
  description: "Connect email identities and configure SenderDeck for Codex or Claude.",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireSenderDeckUser("/settings");

  return (
    <main className="workspace-page settings-page">
      <WorkspaceNav source={user.authSource} email={user.email} active="settings" />
      <header className="workspace-heading"><div><p className="workspace-kicker">EMAIL SETTINGS</p><h1>Email accounts</h1><p>Connect mailboxes, manage labels and review sender aliases.</p></div><Link className="secondary dark" href="/accounts">View all accounts →</Link></header>
      <AccountManager userEmail={user.email} />
      <div className="settings-client-link"><div><h2>Sign-in details</h2><p>Add a SenderDeck username and password for this account.</p></div><Link href="/settings/login">Manage username and password →</Link></div>
      <div className="settings-client-link"><div><h2>AI client setup</h2><p>Install SenderDeck in Codex or Claude using the setup guide.</p></div><Link href="/install">Open installation guide →</Link></div>

      <footer className="settings-footer">
        <p>SenderDeck keeps each connected mailbox as a separate sender identity.</p>
        <div className="footer-links">
          <Link href="/security">Security</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/support">Support</Link>
        </div>
      </footer>
    </main>
  );
}
