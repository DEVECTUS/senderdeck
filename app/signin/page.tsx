import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSenderDeckUser, safeRelativeReturnPath } from "../senderdeck-auth";

export const metadata: Metadata = {
  title: "Sign in | SenderDeck by DEVECTUS",
  description: "Sign in to SenderDeck and connect the mailbox you want to use with Codex or Claude.",
};

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeRelativeReturnPath(params.return_to || "/settings");
  if (await getSenderDeckUser()) redirect(returnTo);
  const encodedReturnTo = encodeURIComponent(returnTo);

  return (
    <main className="signin-page">
      <nav>
        <Link className="brand-lockup" href="/" aria-label="SenderDeck home">
          <Image className="senderdeck-mark" src="/senderdeck-mark.svg" alt="" width={1024} height={1024} priority />
          <Image className="devectus-wordmark" src="/devectus-logo-black.png" alt="DEVECTUS" width={1776} height={354} priority />
          <span className="brand-divider" aria-hidden="true" />
          <span className="wordmark">SenderDeck</span>
        </Link>
        <Link className="quiet-link" href="/">Back home</Link>
      </nav>

      <section className="signin-shell" aria-labelledby="signin-title">
        <div className="signin-copy">
          <p className="eyebrow">{"// One SenderDeck identity"}</p>
          <h1 id="signin-title">Sign in once.<br /><span>Use Codex or Claude.</span></h1>
          <p className="lede">
            Choose the mailbox that will establish your SenderDeck identity. SenderDeck connects
            that mailbox and keeps every additional Google or Microsoft account separate.
          </p>
        </div>

        <div className="signin-card">
          <h2>Choose your provider</h2>
          <p>You will review the provider permissions before anything is connected.</p>
          <div className="signin-actions">
            <a className="primary" href={`/auth/google/start?return_to=${encodedReturnTo}`}>
              Continue with Google
            </a>
            <a className="provider-secondary" href={`/auth/microsoft/start?return_to=${encodedReturnTo}`}>
              Continue with Microsoft
            </a>
          </div>
          <p className="signin-note">
            Your Claude or OpenAI account identifies you only to that AI service. SenderDeck uses
            the provider you choose here to protect your mailbox connections.
          </p>
        </div>
      </section>
    </main>
  );
}
