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
      summary="Get help with email connections, brand workspaces, social activation, privacy or security."
      updated="21 October 2026"
    >
      <section>
        <h2>Contact support</h2>
        <p>
          Email <a href="mailto:support@devectus.com.au?subject=SenderDeck%20support">support@devectus.com.au</a>
          {" "}with “SenderDeck support” in the subject. Include the provider
          and channel, the affected SenderDeck account or brand ID, the approximate
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
          <li><strong>Social activation pending:</strong> Facebook and Instagram require platform approval, owner consent, asset validation, subscriptions and hosted scheduling. See the <a href="/social-setup">provider setup guide</a>.</li>
          <li><strong>Incomplete coverage:</strong> missing permissions, unavailable history and unsupported attachments require review in the native provider. An access failure does not establish that an inbox is empty.</li>
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
        <p>For social accounts, use the selected brand&apos;s Connections view to remove locally stored credentials and conversation records. Provider-side revocation is a separate owner action in the provider&apos;s connected-app settings. Customer workspace deletion removes local social records without deleting provider-hosted conversations.</p>
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
        <h2>Open-source contributions</h2>
        <p>For reproducible bugs and feature proposals, use <a href="https://github.com/DEVECTUS/senderdeck/issues">GitHub issues</a>. Read the <a href="https://github.com/DEVECTUS/senderdeck/blob/main/CONTRIBUTING.md">contribution guide</a> before opening a pull request. Keep private messages, attachments, credentials and account data out of public reports. Report vulnerabilities privately using the <a href="https://github.com/DEVECTUS/senderdeck/blob/main/SECURITY.md">security policy</a>.</p>
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
