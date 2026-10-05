import Link from "next/link";

export default function CodexSetup() {
  return (
    <section className="codex-setup" aria-labelledby="codex-setup-title">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">{"// AI client setup"}</p>
          <h2 id="codex-setup-title">Make SenderDeck available in Codex or Claude</h2>
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
            <h3>Choose your AI client</h3>
            <p>
              Follow the public setup guide for Codex, ChatGPT, Claude Code, or Claude on the web.
              It includes the exact marketplace commands and connector URL.
            </p>
            <Link className="setup-plugin-link" href="/install">Open installation guide</Link>
          </div>
        </li>
        <li>
          <span className="step-number">03</span>
          <div>
            <h3>Start a new task</h3>
            <p>New tasks load the latest plugin tools. Ask your AI client to confirm the connection.</p>
            <blockquote>“List my connected SenderDeck email accounts.”</blockquote>
          </div>
        </li>
      </ol>

      <p className="setup-disclaimer">
        This browser page cannot inspect your local Codex or Claude installation. Account connections
        and plugin installation are shown separately so a problem is easier to diagnose.
      </p>
    </section>
  );
}
