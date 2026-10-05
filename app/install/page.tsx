import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { senderDeckSignInPath } from "../senderdeck-auth";

export const metadata: Metadata = {
  title: "Install SenderDeck for Codex or Claude",
  description:
    "Add the SenderDeck plugin to Codex, ChatGPT, Claude Code, or Claude using the public marketplace or MCP connector.",
};

const repositoryUrl = "https://github.com/DEVECTUS/senderdeck";
const mcpUrl = "https://senderdeck.devectus.com.au/api/mcp";

export default function InstallPage() {
  return (
    <main className="install-page">
      <nav>
        <Link className="brand-lockup" href="/" aria-label="SenderDeck home">
          <Image className="senderdeck-mark" src="/senderdeck-mark.svg" alt="" width={1024} height={1024} priority />
          <Image className="devectus-wordmark" src="/devectus-logo-black.png" alt="DEVECTUS" width={1776} height={354} priority />
          <span className="brand-divider" aria-hidden="true" />
          <span className="wordmark">SenderDeck</span>
        </Link>
        <Link className="quiet-link" href="/">Back to SenderDeck</Link>
      </nav>

      <header className="install-hero">
        <div>
          <p className="eyebrow">{"// Install SenderDeck"}</p>
          <h1>Add the right sender<br /><span>to your AI client.</span></h1>
        </div>
        <p className="lede">
          Choose Codex or Claude, install the public plugin or connector, then authenticate with
          the same SenderDeck identity you use to manage your email accounts.
        </p>
      </header>

      <section className="install-prerequisite" aria-labelledby="before-installing">
        <span className="step-number">01</span>
        <div>
          <h2 id="before-installing">Connect your email accounts first</h2>
          <p>
            SenderDeck needs at least one Google or Microsoft account before an AI client can use it.
            You can connect up to 10 separate sender identities.
          </p>
        </div>
        <a className="primary" href={senderDeckSignInPath("/settings")}>Connect accounts</a>
      </section>

      <section className="client-install-grid" aria-label="AI client installation choices">
        <article className="client-install-card codex-card">
          <div className="client-card-heading">
            <span className="client-kicker">Codex + ChatGPT</span>
            <span className="client-number">02A</span>
          </div>
          <h2>Install from the public repository</h2>
          <p>
            In Codex, add the DEVECTUS repository as a plugin marketplace. Then open Plugins,
            choose <strong>DEVECTUS Plugins</strong>, and install <strong>SenderDeck</strong>.
          </p>
          <div className="command-block" aria-label="Codex marketplace command">
            <span>Terminal</span>
            <code>codex plugin marketplace add DEVECTUS/senderdeck</code>
          </div>
          <p className="availability-note">
            If SenderDeck already appears in the public Plugins directory, install it there instead.
            A directory installation is shared across supported ChatGPT and Codex surfaces.
          </p>
          <div className="install-links">
            <a className="primary" href={repositoryUrl} target="_blank" rel="noopener noreferrer">Open public repository</a>
            <a className="inline-link" href="https://developers.openai.com/plugins/build/plugins" target="_blank" rel="noopener noreferrer">Codex plugin instructions ↗</a>
          </div>
        </article>

        <article className="client-install-card claude-card">
          <div className="client-card-heading">
            <span className="client-kicker">Claude</span>
            <span className="client-number">02B</span>
          </div>
          <h2>Choose Claude Code or a web connector</h2>
          <p>
            For Claude Code, add the repository marketplace and install the packaged plugin.
            Authenticate SenderDeck when Claude opens the MCP connection.
          </p>
          <div className="command-block" aria-label="Claude Code marketplace commands">
            <span>Claude Code</span>
            <code>claude plugin marketplace add DEVECTUS/senderdeck</code>
            <code>claude plugin install senderdeck@devectus-senderdeck</code>
          </div>
          <p>
            For Claude on the web, open <strong>Customize → Connectors</strong>, choose
            <strong> Add custom connector</strong>, name it SenderDeck, and use this URL:
          </p>
          <div className="command-block connector-url" aria-label="SenderDeck MCP connector URL">
            <span>Remote MCP URL</span>
            <code>{mcpUrl}</code>
          </div>
          <div className="install-links">
            <a className="primary" href="https://claude.ai" target="_blank" rel="noopener noreferrer">Open Claude</a>
            <a className="inline-link" href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noopener noreferrer">Claude connector instructions ↗</a>
          </div>
        </article>
      </section>

      <section className="install-finish" aria-labelledby="verify-installation">
        <span className="step-number">03</span>
        <div>
          <h2 id="verify-installation">Verify the connection</h2>
          <p>Start a new task or conversation and ask:</p>
          <blockquote>“List my connected SenderDeck email accounts.”</blockquote>
          <p>
            SenderDeck will ask you to choose a sender identity when needed. It will never send an
            email until you have reviewed and explicitly confirmed the final send details.
          </p>
        </div>
      </section>

      <footer className="settings-footer">
        <p>SenderDeck is open source and built by DEVECTUS.</p>
        <div className="footer-links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/security">Security</Link>
          <Link href="/support">Support</Link>
          <a href={repositoryUrl} target="_blank" rel="noopener noreferrer">Source code</a>
        </div>
      </footer>
    </main>
  );
}
