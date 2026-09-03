import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSenderDeckUser, safeRelativeReturnPath } from "../senderdeck-auth";

export const metadata: Metadata = {
  title: "Reviewer access | SenderDeck by DEVECTUS",
  description: "Credential-only access for authorised SenderDeck marketplace reviewers.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ReviewAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string; error?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeRelativeReturnPath(params.return_to || "/settings");
  if (await getSenderDeckUser()) redirect(returnTo);

  return (
    <main className="signin-page">
      <nav>
        <Link className="brand-lockup" href="/" aria-label="SenderDeck home">
          <Image className="senderdeck-mark" src="/senderdeck-mark.svg" alt="" width={1024} height={1024} priority />
          <Image className="devectus-wordmark" src="/devectus-logo-black.png" alt="DEVECTUS" width={1776} height={354} priority />
          <span className="brand-divider" aria-hidden="true" />
          <span className="wordmark">SenderDeck</span>
        </Link>
        <Link className="quiet-link" href="/signin">Standard sign-in</Link>
      </nav>

      <section className="signin-shell" aria-labelledby="review-title">
        <div className="signin-copy">
          <p className="eyebrow">{"// Marketplace review"}</p>
          <h1 id="review-title">Review safely.<br /><span>No extra setup.</span></h1>
          <p className="lede">
            This credential-only route is reserved for authorised marketplace reviewers. It opens
            a preconfigured sample workspace without Google or Microsoft verification prompts.
          </p>
        </div>

        <form className="signin-card reviewer-form" action="/auth/reviewer" method="post">
          <h2>Reviewer access</h2>
          <p>Use the credentials supplied with the SenderDeck submission.</p>
          {params.error === "invalid" ? (
            <p className="signin-error" role="alert">The username or password was not recognised.</p>
          ) : null}
          <input type="hidden" name="return_to" value={returnTo} />
          <label htmlFor="review-username">Username</label>
          <input id="review-username" name="username" autoComplete="username" required />
          <label htmlFor="review-password">Password</label>
          <input id="review-password" name="password" type="password" autoComplete="current-password" required />
          <button className="primary" type="submit">Open sample workspace</button>
          <p className="signin-note">Access expires after 24 hours and can be ended sooner by signing out.</p>
        </form>
      </section>
    </main>
  );
}
