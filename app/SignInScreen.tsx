import Image from "next/image";
import Link from "next/link";
import VersionBadge from "./VersionBadge";
import type { SenderDeckUser } from "./senderdeck-auth";

export default function SignInScreen({ returnTo, currentUser }: { returnTo: string; currentUser?: SenderDeckUser | null }) {
  const encodedReturnTo = encodeURIComponent(returnTo);
  return (
    <main className="signin-page">
      <nav>
        <Link className="brand-lockup" href="/" aria-label="SenderDeck home">
          <Image className="senderdeck-mark" src="/senderdeck-mark.svg" alt="" width={1024} height={1024} priority />
          <span className="wordmark">SenderDeck</span><VersionBadge />
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
          {currentUser && <p className="signin-scope-note">Currently viewing {currentUser.email} through {currentUser.authSource === "openai" ? "OpenAI" : "SenderDeck"} sign-in. Choose the Google or Microsoft identity used for your brands. This switches the session; it does not merge workspaces or share account access.</p>}
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
