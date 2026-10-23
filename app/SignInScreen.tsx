import Image from "next/image";
import Link from "next/link";
import VersionBadge from "./VersionBadge";
import type { SenderDeckUser } from "./senderdeck-auth";

export default function SignInScreen({ returnTo, currentUser, passwordError }: { returnTo: string; currentUser?: SenderDeckUser | null; passwordError?: boolean }) {
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
            Sign in to your SenderDeck workspace with your username and password, or use Google
            or Microsoft. Each connected mailbox remains a separate sender account.
          </p>
        </div>

        <div className="signin-card">
          <h2>Sign in to SenderDeck</h2>
          <form className="reviewer-form" action="/auth/password" method="post">
            <input type="hidden" name="return_to" value={returnTo} />
            {passwordError && <p className="signin-error" role="alert">Username or password not recognised. Please try again.</p>}
            <label htmlFor="login-username">SenderDeck username</label>
            <input id="login-username" name="username" autoComplete="username" maxLength={64} required />
            <label htmlFor="login-password">SenderDeck password</label>
            <input id="login-password" name="password" type="password" autoComplete="current-password" required />
            <button type="submit" className="primary">Sign in</button>
          </form>
          <p className="signin-note">New here? Sign in with Google or Microsoft once, then add a username and password in Settings → Sign-in details.</p>
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
