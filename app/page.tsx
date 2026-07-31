import type { Metadata } from "next";
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
        <span className="wordmark">Multi-Account Email</span>
        {user ? (
          <a className="quiet-link" href={chatGPTSignOutPath("/")}>Sign out</a>
        ) : (
          <a className="quiet-link" href={chatGPTSignInPath("/")}>Sign in with ChatGPT</a>
        )}
      </nav>

      <section className="hero">
        <p className="eyebrow">Private proof of concept</p>
        <h1>Every inbox. The right sender. Your final say.</h1>
        <p className="lede">
          Search, read, and draft across Gmail, Google Workspace, Outlook.com,
          and Microsoft 365. Nothing sends until the sender, recipients,
          subject, and attachments are explicitly confirmed.
        </p>
        {user ? (
          <div className="connect-panel">
            <div>
              <p className="signed-in">Signed in as</p>
              <strong>{user.email}</strong>
            </div>
            <a className="primary" href="#connections">Manage connections</a>
          </div>
        ) : (
          <a className="primary hero-action" href={chatGPTSignInPath("/")}>
            Sign in to connect an account
          </a>
        )}
      </section>

      {user ? <AccountManager userEmail={user.email} /> : null}

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
        <p>Up to 10 connected accounts per user.</p>
        <p>Background monitoring, bulk email, calendars, and automatic sending are not included.</p>
      </footer>
    </main>
  );
}
