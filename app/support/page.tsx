import type { Metadata } from "next";
import LegalPage from "../LegalPage";

export const metadata: Metadata = {
  title: "Support | SenderDeck by DEVECTUS",
  description: "Get help with SenderDeck account connections, permissions, privacy and security.",
};

export default function SupportPage() {
  return (
    <LegalPage
      eyebrow="// Support"
      title="Help with SenderDeck."
      summary="Contact DEVECTUS for connection, permission, privacy or security assistance."
      updated="4 August 2026"
    >
      <section>
        <h2>Contact support</h2>
        <p>
          Email <a href="mailto:support@devectus.com.au?subject=SenderDeck%20support">support@devectus.com.au</a>
          {" "}with “SenderDeck support” in the subject. Include the provider
          (Google or Microsoft), the affected account address, the approximate
          time of the issue and any error text. Do not send passwords, OAuth
          tokens, authentication codes or confidential message content.
        </p>
        <p>
          DEVECTUS provides support from Melbourne, Australia. Response timing
          depends on severity, service status and any applicable customer
          agreement.
        </p>
      </section>

      <section>
        <h2>Common connection issues</h2>
        <ul>
          <li><strong>Admin approval required:</strong> your Microsoft 365 administrator may need to approve SenderDeck for your organisation.</li>
          <li><strong>Google test user restriction:</strong> during testing, the Google account must be listed as an approved test user.</li>
          <li><strong>Expired authorisation:</strong> disconnect the affected account and reconnect it to obtain fresh provider consent.</li>
          <li><strong>Wrong sender:</strong> review account labels and explicitly select the required sender before drafting.</li>
        </ul>
      </section>

      <section>
        <h2>Disconnect or revoke access</h2>
        <p>
          Use SenderDeck’s connection manager to disconnect an account. You can
          also revoke access in your Google Account’s third-party connections or
          your Microsoft account’s application consent settings. Revocation
          prevents future access but does not delete email or drafts stored by
          the provider.
        </p>
      </section>

      <section>
        <h2>Privacy and security</h2>
        <p>
          Privacy requests should be sent to
          {" "}<a href="mailto:privacy@devectus.com.au">privacy@devectus.com.au</a>.
          Security reports should follow the guidance on the
          {" "}<a href="/security">SenderDeck Security page</a>.
        </p>
      </section>

      <section>
        <h2>DEVECTUS</h2>
        <p>
          DEVECTUS Pty Ltd<br />
          Level 33, 385 Bourke Street<br />
          Melbourne VIC 3000, Australia<br />
          <a href="https://devectus.com.au/contact">devectus.com.au/contact</a>
        </p>
      </section>
    </LegalPage>
  );
}
