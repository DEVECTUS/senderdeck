const pluginDeepLink =
  "codex://plugins/senderdeck?marketplacePath=C%3A%5CUsers%5Cbarsh%5C.agents%5Cplugins%5Cmarketplace.json";

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
            <h3>Install or refresh the Codex plugin</h3>
            <p>Open SenderDeck from your Personal marketplace and select Install or reinstall it.</p>
            <a className="setup-plugin-link" href={pluginDeepLink}>Open SenderDeck in Codex</a>
            <p className="setup-fallback">
              If the button does not open the app: open <strong>Plugins</strong>, choose
              <strong> Personal</strong>, then select <strong>SenderDeck</strong>.
            </p>
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
        <li>
          <span className="step-number">04</span>
          <div>
            <h3>Use SenderDeck in Claude</h3>
            <p>
              In Claude Code, add <strong>DEVECTUS/senderdeck</strong> as a plugin marketplace,
              install <strong>senderdeck@devectus-senderdeck</strong>, then authenticate from the MCP panel.
              In Claude.ai, add the production MCP URL as a custom connector.
            </p>
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
