import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getSenderDeckUser, senderDeckSignInPath, senderDeckSignOutPath } from "./senderdeck-auth";

export const metadata: Metadata = {
  title: "SenderDeck by DEVECTUS",
  description:
    "Open-source email and brand conversation tools for Codex and Claude. Manage Gmail and Microsoft accounts, brand rules and approved replies, with clear social activation requirements.",
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
            <Link className="quiet-link" href="/conversations">Conversations</Link>
            <a className="quiet-link" href={senderDeckSignOutPath("/")}>Sign out</a>
          </div>
        ) : (
          <div className="nav-user"><a className="quiet-link" href="#capabilities">Capabilities</a><a className="quiet-link" href={senderDeckSignInPath("/")}>Sign in</a></div>
        )}
      </nav>

      {user ? (
        <>
          <section className="workspace-hero">
            <div>
              <p className="eyebrow">{"// Your conversation workspace"}</p>
              <h1>Your accounts.<br /><span>Your brands.</span></h1>
            </div>
            <p className="lede">
              Manage your Google and Microsoft email identities, then organise customer
              brands, reply policies and social enquiries. Choose the exact account for
              each conversation and review every response before approving it.
            </p>
          </section>
          <section className="configuration-callout" aria-labelledby="configuration-title">
            <div>
              <p className="eyebrow">{"// Configuration"}</p>
              <h2 id="configuration-title">Connect accounts and organise your brands.</h2>
              <p>
                Configuration manages email identities and AI clients. Conversations holds
                customer workspaces, brand rules, enquiries and social connection readiness.
              </p>
            </div>
            <Link className="primary" href="/settings">Open configuration</Link>
            <Link className="secondary dark" href="/conversations">Open Conversations</Link>
          </section>
        </>
      ) : (
        <section className="hero">
          <p className="eyebrow">{"// Open-source conversation tools by DEVECTUS"}</p>
          <h1>Every inbox.<br /><span>Every brand.</span><br />Your final say.</h1>
          <p className="lede">
            An open-source workspace for email and brand conversations, connected to Codex
            or Claude. Use Gmail and Microsoft email today. Organise brands, enquiries and
            reply approvals, with Facebook and Instagram activation subject to provider approval.
            Nothing sends until the exact message and account are explicitly confirmed.
          </p>
          <div className="hero-actions">
            <a className="primary" href={senderDeckSignInPath("/settings")}>
              Connect email accounts
            </a>
            <Link className="secondary dark" href="/install">Install for Codex or Claude</Link>
          </div>
        </section>
      )}

      <section className="product-capabilities" id="capabilities" aria-labelledby="capabilities-title">
        <div className="product-section-heading"><div><p className="eyebrow">{"// What SenderDeck does"}</p><h2 id="capabilities-title">Email today.<br /><span>A foundation for every brand.</span></h2></div><p>One project, distinct provider capabilities. Each connection reports what it can actually read or send.</p></div>
        <div className="product-capability-grid">
          <article><span className="product-state available">Available</span><h3>Google &amp; Microsoft email</h3><p>Connect up to 10 mailboxes per user. Search and read messages, download attachments, choose an authorised Gmail alias and prepare or update provider-hosted drafts.</p><p>Inspect the sender, recipients, subject, files and current revision before a separate send confirmation.</p><Link href="/settings">Manage email accounts →</Link></article>
          <article><span className="product-state available">Available</span><h3>Brands &amp; enquiry workflows</h3><p>Organise customers, brands and account associations. Set language, tone, verified facts and escalation rules. Track enquiry ownership, next actions and activity with customer role controls.</p><p>Social drafts and history snapshots are encrypted and expire. Replies require approval of the exact revision.</p><Link href="/conversations">Explore Conversations →</Link></article>
          <article><span className="product-state pending">Activation pending</span><h3>Facebook &amp; Instagram</h3><p>Provider adapters cover Page messages, comment and reply trees, hosted OAuth and explicit asset selection. Signed webhooks and reconciliation support hosted monitoring.</p><p>Live access requires an approved platform app, owner consent, verified subscriptions and a working scheduler. Social sending is currently disabled.</p><Link href="/social-setup">See activation requirements →</Link></article>
          <article><span className="product-state pending">Approval pending</span><h3>LinkedIn &amp; coverage limits</h3><p>LinkedIn community access needs programme and data-use approval. Page messaging requires separate partner access. No LinkedIn inbox coverage is currently provided.</p><p>Instagram mentions, social attachment sending and unsupported history remain explicit gaps for native review.</p><Link href="/social-setup#linkedin">Review provider limits →</Link></article>
        </div>
      </section>

      <section className="principles" aria-label="Product principles">
        <article>
          <span>01</span>
          <h2>Explicit account scope</h2>
          <p>Choose one sender or brand account for each action. Mailbox credentials stay with their owner; customer roles control social access.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Deliberate sending</h2>
          <p>Email drafts stay with the provider. Social drafts expire locally. Each send requires a separate confirmation of the inspected message.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Clear data boundaries</h2>
          <p>Email content is fetched on demand. Optional social content is encrypted with expiry controls, while policies and enquiry metadata support review.</p>
        </article>
      </section>

      <section className="open-source" aria-labelledby="open-source-title">
        <div className="open-source-copy">
          <p className="eyebrow">{"// Built in the open"}</p>
          <h2 id="open-source-title">Public code.<br /><span>Human stakes.</span></h2>
          <p>
            Trust should be inspectable. SenderDeck is open source under the MIT License, so people
            can inspect how it handles identity, account routing, brand policies, stored data and reply approvals.
          </p>
          <a
            className="source-link"
            href="https://github.com/DEVECTUS/senderdeck"
            target="_blank"
            rel="noopener noreferrer"
          >
            Explore the open-source code <span aria-hidden="true">↗</span>
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
              <h3>Contribute with context</h3>
              <p>Explore the architecture, report reproducible issues or contribute code and documentation. Provider activation requirements are documented alongside the implementation.</p>
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
          <p>Up to 10 email accounts per user, plus customer and brand workspaces.</p>
          <p>Social access and hosted monitoring await activation. Automatic sending is disabled.</p>
          <div className="footer-links">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/security">Security</Link>
            <Link href="/support">Support</Link>
            <Link href="/install">Install</Link>
            <Link href="/settings">Configuration</Link>
            <Link href="/conversations">Conversations</Link>
            <Link href="/social-setup">Provider status</Link>
            <a href="https://github.com/DEVECTUS/senderdeck/blob/main/CONTRIBUTING.md">Contribute</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
