"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Provider = "google" | "microsoft";

interface Account {
  id: string;
  provider: Provider;
  email: string;
  label: string;
  connectedAt: string;
}

interface AccountResponse {
  accounts: Account[];
  limit: number;
  error?: string;
}

export default function AccountManager({ userEmail }: { userEmail: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const response = await fetch("/api/accounts", { cache: "no-store" });
      const data = (await response.json()) as AccountResponse;
      if (!response.ok) throw new Error(data.error || "Could not load connected accounts.");
      setError(null);
      setAccounts(data.accounts);
      setLimit(data.limit);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load connected accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAccounts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAccounts]);

  async function saveLabel(event: FormEvent, accountId: string) {
    event.preventDefault();
    setBusyId(accountId);
    setError(null);
    try {
      const response = await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId, label }),
      });
      const data = (await response.json()) as { account?: Account; error?: string };
      if (!response.ok || !data.account) throw new Error(data.error || "Could not rename account.");
      const updated = data.account;
      setAccounts((current) =>
        current.map((account) => (account.id === accountId ? updated : account)),
      );
      setEditingId(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not rename account.");
    } finally {
      setBusyId(null);
    }
  }

  async function disconnect(account: Account) {
    const confirmed = window.confirm(
      `Disconnect ${account.email}?\n\nThis removes its connection from Multi-Account Email. It does not delete any email.`,
    );
    if (!confirmed) return;

    setBusyId(account.id);
    setError(null);
    try {
      const response = await fetch("/api/accounts", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: account.id, confirmed: true }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not disconnect account.");
      setAccounts((current) => current.filter((item) => item.id !== account.id));
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Could not disconnect account.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const atLimit = accounts.length >= limit;

  return (
    <section className="connections" id="connections" aria-labelledby="connections-title">
      <div className="connections-heading">
        <div>
          <p className="eyebrow">{"// Connection manager"}</p>
          <h2 id="connections-title">Connected identities</h2>
          <p className="connections-intro">
            This workspace belongs to <strong>{userEmail}</strong>. Every card below is an
            independent email account and sender identity. Connect up to {limit}.
          </p>
        </div>
        <div className="connection-summary">
          <span className="account-count">{accounts.length} / {limit} connected</span>
          <button className="refresh-button" type="button" onClick={() => void loadAccounts()}>
            Refresh list
          </button>
        </div>
      </div>

      {error ? (
        <div className="manager-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void loadAccounts()}>Try again</button>
        </div>
      ) : null}

      {loading ? (
        <p className="manager-status" role="status">Loading connected accounts…</p>
      ) : accounts.length ? (
        <div className="account-list">
          {accounts.map((account) => (
            <article className="account-card" key={account.id}>
              <div className={`provider-mark ${account.provider}`} aria-hidden="true">
                {account.provider === "google" ? "G" : "M"}
              </div>
              <div className="account-identity">
                {editingId === account.id ? (
                  <form className="label-form" onSubmit={(event) => void saveLabel(event, account.id)}>
                    <label htmlFor={`label-${account.id}`}>Account label</label>
                    <div>
                      <input
                        id={`label-${account.id}`}
                        value={label}
                        maxLength={80}
                        required
                        autoFocus
                        onChange={(event) => setLabel(event.target.value)}
                      />
                      <button type="submit" disabled={busyId === account.id}>Save</button>
                      <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <>
                    <strong>{account.label}</strong>
                    <span>{account.email}</span>
                    <small>
                      Active sender · {account.provider === "google" ? "Google" : "Microsoft"} · Connected{" "}
                      {new Date(account.connectedAt).toLocaleDateString()}
                    </small>
                  </>
                )}
              </div>
              {editingId !== account.id ? (
                <div className="account-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(account.id);
                      setLabel(account.label);
                    }}
                    disabled={busyId === account.id}
                  >
                    Rename
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => void disconnect(account)}
                    disabled={busyId === account.id}
                  >
                    {busyId === account.id ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-accounts">
          <h3>No email accounts connected yet</h3>
          <p>Choose a provider below to connect your first account.</p>
        </div>
      )}

      <div className="connect-another">
        <div>
          <h3>Connect another account</h3>
          <p>
            {atLimit
              ? "Disconnect an account before adding another."
              : "You will choose the exact Google or Microsoft identity during sign-in."}
          </p>
        </div>
        <div className="actions">
          <a
            className={`primary${atLimit ? " disabled-link" : ""}`}
            href={atLimit ? undefined : "/oauth/google/start?label=Google account"}
            aria-disabled={atLimit}
          >
            Connect Google
          </a>
          <a
            className={`secondary dark${atLimit ? " disabled-link" : ""}`}
            href={atLimit ? undefined : "/oauth/microsoft/start?label=Microsoft account"}
            aria-disabled={atLimit}
          >
            Connect Microsoft
          </a>
        </div>
      </div>
    </section>
  );
}
