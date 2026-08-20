import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type LegalPageProps = {
  eyebrow: string;
  title: string;
  summary: string;
  updated: string;
  children: ReactNode;
};

export default function LegalPage({
  eyebrow,
  title,
  summary,
  updated,
  children,
}: LegalPageProps) {
  return (
    <main className="legal-page">
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
        <Link className="quiet-link" href="/">Back to SenderDeck</Link>
      </nav>

      <header className="legal-hero">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="legal-summary">{summary}</p>
        <p className="legal-updated">Last updated {updated}</p>
      </header>

      <div className="legal-layout">
        <aside aria-label="Legal and support pages">
          <strong>SenderDeck resources</strong>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/security">Security</Link>
          <Link href="/support">Support</Link>
        </aside>
        <article className="legal-content">{children}</article>
      </div>

      <footer>
        <div className="builder-attribution">
          <a
            className="devectus-link"
            href="https://devectus.com.au"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>Designed &amp; built by</span>
            <Image
              src="/devectus-logo-black.png"
              alt="DEVECTUS"
              width={1776}
              height={354}
            />
          </a>
          <p>DEVECTUS Pty Ltd · Melbourne, Australia</p>
        </div>
        <div className="footer-links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/security">Security</Link>
          <Link href="/support">Support</Link>
        </div>
      </footer>
    </main>
  );
}
