import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import AccountManager from "./AccountManager";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "./chatgpt-auth";

export const metadata: Metadata = {
  title: "Multi-Account Email",
  description:
    "A private proof of concept for safe, on-demand access to multiple email accounts.",
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return (
    <main>
      <nav>
        <Link className="brand-lockup" href="/" aria-label="Multi-Account Email home">
          <Image
            src="/devectus-logo-black.png"
            alt="DEVECTUS"
            width={1776}
            height={354}
            priority
          />
          <span className="brand-divider" aria-hidden="true" />
          <span className="wordmark">Multi-Account Email</span>
        </Link>
        {user ? (
          <div className="nav-user">
            <span>{user.email}</span>
            <a className="quiet-link" href={chatGPTSignOutPath("/")}>Sign out</a>
          </div>
        ) : (
          <a className="quiet-link" href={chatGPTSignInPath("/")}>Sign in with ChatGPT</a>
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
          <AccountManager userEmail={user.email} />
        </>
      ) : (
        <section className="hero">
          <p className="eyebrow">{"// A DEVECTUS private proof of concept"}</p>
          <h1>Every inbox.<br /><span>The right sender.</span><br />Your final say.</h1>
          <p className="lede">
            One secure workspace for Gmail, Google Workspace, Outlook.com, and
            Microsoft 365. Nothing sends until the sender, recipients, subject,
            and attachments are explicitly confirmed.
          </p>
          <a className="primary hero-action" href={chatGPTSignInPath("/")}>
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

      <footer>
        <div className="builder-attribution">
          <a
            className="devectus-link"
            href="https://devectus.com.au"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit DEVECTUS, designer and builder of Multi-Account Email"
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
        </div>
      </footer>
    </main>
  );
}
