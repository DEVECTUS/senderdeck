import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getSenderDeckUser, senderDeckSignInPath, senderDeckSignOutPath } from "./senderdeck-auth";

export const metadata: Metadata = {
  title: "SenderDeck by DEVECTUS",
  description:
    "Open, inspectable infrastructure for safe, on-demand access to multiple email accounts.",
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSenderDeckUser();
  return (
    <main>
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
        {user ? (
          <div className="nav-user">
            <span>{user.email}</span>
            <Link className="quiet-link" href="/settings">Configuration</Link>
            <a className="quiet-link" href={senderDeckSignOutPath("/")}>Sign out</a>
          </div>
        ) : (
          <a className="quiet-link" href={senderDeckSignInPath("/")}>Sign in</a>
        )}
      </nav>

      {user ? (
        <>
          <section className="workspace-hero">
            <div>
              <p className="eyebrow">{"// Your email workspace"}</p>
              <h1>One user.<br /><span>Many email identities.</span></h1>
            </div>
            <p className="lede">
              Every connected mailbox remains a separate sender identity. Add,
              label, review, and disconnect accounts here—then choose the exact
              account whenever you search, draft, or send.
            </p>
          </section>
          <section className="configuration-callout" aria-labelledby="configuration-title">
            <div>
              <p className="eyebrow">{"// Configuration"}</p>
              <h2 id="configuration-title">Configure accounts and AI clients.</h2>
              <p>
                Manage Google and Microsoft sender identities, review which SenderDeck identity owns
                them, and connect the plugin to Codex or Claude in one place.
              </p>
            </div>
            <Link className="primary" href="/settings">Open configuration</Link>
          </section>
        </>
      ) : (
        <section className="hero">
          <p className="eyebrow">{"// Built in public by DEVECTUS"}</p>
          <h1>Every inbox.<br /><span>The right sender.</span><br />Your final say.</h1>
          <p className="lede">
            One secure workspace for Gmail, Google Workspace, Outlook.com, and
            Microsoft 365. Nothing sends until the sender, recipients, subject,
            and attachments are explicitly confirmed.
          </p>
          <a className="primary hero-action" href={senderDeckSignInPath("/settings")}>
            Sign in to manage accounts
          </a>
        </section>
      )}

      <section className="principles" aria-label="Product principles">
        <article>
          <span>01</span>
          <h2>On demand</h2>
          <p>Messages are fetched when requested. Mailboxes are not synchronized or indexed.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Deliberate sending</h2>
          <p>Drafts stay with the email provider and require an exact confirmation before send.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Minimal retention</h2>
          <p>Only encrypted OAuth tokens and account preferences are stored by this service.</p>
        </article>
      </section>

      <section className="open-source" aria-labelledby="open-source-title">
        <div className="open-source-copy">
          <p className="eyebrow">{"// Built in the open"}</p>
          <h2 id="open-source-title">Public code.<br /><span>Human stakes.</span></h2>
          <p>
            Trust should be inspectable. DEVECTUS publishes SenderDeck&apos;s source so people can
            examine how it handles identity, consent, and email—not just take our word for it.
          </p>
          <a
            className="source-link"
            href="https://github.com/DEVECTUS/senderdeck"
            target="_blank"
            rel="noopener noreferrer"
          >
            View SenderDeck on GitHub <span aria-hidden="true">↗</span>
          </a>
        </div>
        <div className="open-source-notes" aria-label="Why DEVECTUS builds in public">
          <article>
            <span>01</span>
            <div>
              <h3>Earn trust in public</h3>
              <p>Security boundaries, data handling, and every release are open to scrutiny.</p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>Safety is product work</h3>
              <p>Explicit sender identities, minimal retention, and human confirmation are core features.</p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>Useful beats heroic</h3>
              <p>We contribute focused work, honest constraints, and a few late nights to make human–AI collaboration safer.</p>
            </div>
          </article>
        </div>
      </section>

      <footer>
        <div className="builder-attribution">
          <a
            className="devectus-link"
            href="https://devectus.com.au"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit DEVECTUS, designer and builder of SenderDeck"
          >
            <span>Designed &amp; built by</span>
            <Image
              src="/devectus-logo-black.png"
              alt="DEVECTUS"
              width={1776}
              height={354}
            />
          </a>
          <p>Bespoke software and automation platforms for Australian organisations.</p>
        </div>
        <div>
          <p>Up to 10 connected accounts per user.</p>
          <p>Background monitoring, bulk email, calendars, and automatic sending are not included.</p>
          <div className="footer-links">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/security">Security</Link>
            <Link href="/support">Support</Link>
            <Link href="/settings">Configuration</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
