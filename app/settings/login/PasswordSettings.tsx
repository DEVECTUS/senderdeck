"use client";
import { useEffect, useState } from "react";

export default function PasswordSettings({ email }: { email: string }) {
  const [status, setStatus] = useState<{ username: string; hasPassword: boolean } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; fetch("/api/password-login", { cache: "no-store" }).then(async response => {
    const value = await response.json(); if (!response.ok) throw new Error(value.error || "Could not load sign-in details."); if (active) setStatus(value);
  }).catch(error => { if (active) setMessage(error.message); }); return () => { active = false; }; }, []);
  return <section className="signin-card" aria-labelledby="password-heading" style={{ maxWidth: "38rem", margin: "2rem 0" }}>
    <h2 id="password-heading">Sign-in for {email}</h2>
    <p>Choose a unique SenderDeck username and a password of at least 15 characters. Use a different password from your email provider.</p>
    <p>Before adding a password, sign in with Google or Microsoft within the last 15 minutes. Changing an existing password requires your current SenderDeck password and signs out other browser sessions.</p>
    <a href="/signin/switch?return_to=%2Fsettings%2Flogin">Sign in again to this account</a>
    {message && <p role="status" aria-live="polite">{message}</p>}
    {status && <form className="reviewer-form" onSubmit={async event => {
      event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form);
      if (fields.get("password") !== fields.get("confirmPassword")) { setMessage("The new passwords do not match."); return; }
      setBusy(true); setMessage("");
      try {
        const response = await fetch("/api/password-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: fields.get("username"), password: fields.get("password"), currentPassword: fields.get("currentPassword") || "" }) });
        const value = await response.json(); if (!response.ok) throw new Error(value.error || "Could not save sign-in details.");
        form.reset(); setStatus({ username: value.username, hasPassword: true }); setMessage(`Saved. Sign in as ${value.username} at senderdeck.devectus.com.au/signin. Keep this password in your password manager.`);
      } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save sign-in details."); } finally { setBusy(false); }
    }}>
      <label htmlFor="password-username">SenderDeck username</label>
      <input key={status.username} id="password-username" name="username" defaultValue={status.username} autoComplete="username" minLength={3} maxLength={64} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}" required disabled={busy} />
      {status.hasPassword && <><label htmlFor="current-password">Current SenderDeck password</label><input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required disabled={busy} /></>}
      <label htmlFor="new-password">New SenderDeck password</label>
      <input id="new-password" name="password" type="password" autoComplete="new-password" minLength={15} required disabled={busy} />
      <label htmlFor="confirm-password">Confirm new password</label>
      <input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={15} required disabled={busy} />
      <button className="primary" disabled={busy} type="submit">{busy ? "Saving…" : status.hasPassword ? "Update sign-in details" : "Add username and password"}</button>
    </form>}
  </section>;
}
