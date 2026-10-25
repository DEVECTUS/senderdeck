import Image from "next/image";
import Link from "next/link";
import VersionBadge from "./VersionBadge";
import ProviderIcon from "./ProviderIcon";
import type { SenderDeckUser } from "./senderdeck-auth";

export default function SignInScreen({ returnTo, currentUser, passwordError }: { returnTo: string; currentUser?: SenderDeckUser | null; passwordError?: boolean }) {
  const encoded = encodeURIComponent(returnTo);
  return <main className="signin-page">
    <nav><Link className="brand-lockup" href="/" aria-label="SenderDeck home"><Image className="senderdeck-mark" src="/senderdeck-mark.svg" alt="" width={1024} height={1024} priority /><span className="wordmark">SenderDeck</span><VersionBadge /></Link><Link className="quiet-link" href="/">Back home</Link></nav>
    <section className="signin-shell signin-compact" aria-labelledby="signin-title"><div className="signin-card">
      <h1 id="signin-title">{currentUser ? "Switch account" : "Sign in"}</h1>
      <p className="signin-intro">Choose an account to continue.</p>
      {currentUser && <p className="signin-current">Currently: <strong>{currentUser.email}</strong></p>}
      <div className="signin-actions">
        {["google", "microsoft", "openai"].map(provider => <a className="provider-button" key={provider} href={`/auth/${provider}/start?return_to=${encoded}`} target="_top"><ProviderIcon provider={provider}/><span>{`Continue with ${provider === "openai" ? "OpenAI" : provider === "google" ? "Google" : "Microsoft"}`}</span></a>)}
      </div>
      <details className="signin-password" open={passwordError || undefined}><summary>Use username and password</summary>
        <form className="reviewer-form" action="/auth/password" method="post"><input type="hidden" name="return_to" value={returnTo}/>
          {passwordError && <p className="signin-error" role="alert">Username or password not recognised.</p>}
          <label htmlFor="login-username">SenderDeck username</label><input id="login-username" name="username" autoComplete="username" maxLength={64} required/>
          <label htmlFor="login-password">Password</label><input id="login-password" name="password" type="password" autoComplete="current-password" required/>
          <button type="submit" className="primary">Sign in</button>
        </form>
      </details>
      <details className="signin-help"><summary>Sign-in help</summary><p>New here? Use Google or Microsoft. Add a password in Settings.</p><p>Sign-in does not connect a mailbox or merge workspaces. Only an approved link shares access.</p><Link href="/support">Get help →</Link></details>
    </div></section>
  </main>;
}
