"use client";

import { useState } from "react";

const installCommand = "codex plugin add senderdeck@personal";

export default function CodexSetup() {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="codex-setup" aria-labelledby="codex-setup-title">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">{"// Codex setup"}</p>
          <h2 id="codex-setup-title">Make SenderDeck available in Codex</h2>
        </div>
        <span className="setup-status">One-time setup</span>
      </div>

      <ol className="setup-steps">
        <li>
          <span className="step-number">01</span>
          <div>
            <h3>Connect your email identities</h3>
            <p>Add each Google or Microsoft account below and give it a clear sender label.</p>
            <a className="inline-link" href="#connections">Manage connected accounts</a>
          </div>
        </li>
        <li>
          <span className="step-number">02</span>
          <div>
            <h3>Install or refresh the Codex plugin</h3>
            <p>Run this command in a terminal on the computer where you use Codex.</p>
            <div className="command-row">
              <code>{installCommand}</code>
              <button type="button" aria-live="polite" onClick={() => void copyCommand()}>
                {copied ? "Copied" : "Copy command"}
              </button>
            </div>
          </div>
        </li>
        <li>
          <span className="step-number">03</span>
          <div>
            <h3>Start a new Codex task</h3>
            <p>New tasks load the latest plugin tools. Ask Codex to list your connected SenderDeck accounts.</p>
            <blockquote>“List my connected SenderDeck email accounts.”</blockquote>
          </div>
        </li>
      </ol>

      <p className="setup-disclaimer">
        This browser page cannot inspect your local Codex installation. Successful account connections
        and plugin installation are shown separately so a problem is easier to diagnose.
      </p>
    </section>
  );
}
