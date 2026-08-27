import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import AccountManager from "../AccountManager";
import CodexSetup from "../CodexSetup";
import { requireSenderDeckUser, senderDeckSignOutPath } from "../senderdeck-auth";

export const metadata: Metadata = {
  title: "Configuration | SenderDeck by DEVECTUS",
  description: "Connect email identities and configure SenderDeck for Codex or Claude.",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireSenderDeckUser("/settings");

  return (
    <main className="settings-page">
      <nav>
        <Link className="brand-lockup" href="/" aria-label="SenderDeck home">
          <Image
            className="senderdeck-mark"
            src="/senderdeck-mark.svg"
            alt=""
            width={1024}
            height={1024}
            priority
          />
          <Image
            className="devectus-wordmark"
            src="/devectus-logo-black.png"
            alt="DEVECTUS"
            width={1776}
            height={354}
            priority
          />
          <span className="brand-divider" aria-hidden="true" />
          <span className="wordmark">SenderDeck</span>
        </Link>
        <div className="nav-user">
          <span>{user.email}</span>
          <Link className="quiet-link" href="/">Home</Link>
          <a className="quiet-link" href={senderDeckSignOutPath("/")}>Sign out</a>
        </div>
      </nav>

      <section className="settings-hero">
        <div>
          <p className="eyebrow">{"// Configuration"}</p>
          <h1>Plugin &amp; account<br /><span>configuration.</span></h1>
          <p className="lede">
            Connect the email identities SenderDeck may use, then make the plugin available to Codex
            or Claude. Email access stays with the signed-in SenderDeck identity shown here.
          </p>
        </div>
        <div className="configuration-status" aria-label="Configuration status">
          <div>
            <span className="status-dot active" aria-hidden="true" />
            <p><strong>SenderDeck identity</strong><span>{user.email}</span></p>
          </div>
          <div>
            <span className="status-dot neutral" aria-hidden="true" />
            <p><strong>AI clients</strong><span>Connect Codex or Claude using the steps below</span></p>
          </div>
        </div>
      </section>

      <CodexSetup />
      <AccountManager userEmail={user.email} />

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
