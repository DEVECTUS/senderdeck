import type { Metadata } from "next";
import LegalPage from "../LegalPage";

export const metadata: Metadata = {
  title: "Security | SenderDeck by DEVECTUS",
  description: "SenderDeck security architecture, controls and responsible disclosure.",
};

export default function SecurityPage() {
  return (
    <LegalPage
      eyebrow="// Security"
      title="Small attack surface. Strong user control."
      summary="SenderDeck is designed to minimise retained data and keep sensitive email actions deliberate."
      updated="31 July 2026"
    >
      <section>
        <h2>Security principles</h2>
        <ul>
          <li><strong>Least privilege:</strong> delegated OAuth permissions are limited to the email functions SenderDeck provides.</li>
          <li><strong>On-demand access:</strong> mailboxes are not synchronised or indexed into a separate message database.</li>
          <li><strong>Encrypted credentials:</strong> OAuth tokens are encrypted before storage and are separated by authenticated user.</li>
          <li><strong>Provider-hosted drafts:</strong> drafts remain with Google or Microsoft.</li>
          <li><strong>Deliberate sending:</strong> sending requires confirmation of the exact sender, recipients, subject and attachment list.</li>
          <li><strong>Attachment controls:</strong> configurable type and size limits block high-risk or oversized attachments.</li>
          <li><strong>Minimal retention:</strong> message bodies and attachment contents are processed transiently for requested operations.</li>
        </ul>
      </section>

      <section>
        <h2>Account control</h2>
        <p>
          Users can review connected identities, rename local routing labels and
          disconnect accounts. Access can also be revoked through Google or
          Microsoft account consent settings. Disconnecting removes the
          SenderDeck connection without deleting provider-hosted email.
        </p>
      </section>

      <section>
        <h2>Service boundaries</h2>
        <p>
          SenderDeck does not perform automatic or scheduled sending,
          background monitoring, bulk campaigns, calendar operations or shared
          mailbox access. These exclusions reduce both privilege and misuse
          risk.
        </p>
      </section>

      <section>
        <h2>Responsible disclosure</h2>
        <p>
          If you believe you have found a security issue, email
          {" "}<a href="mailto:support@devectus.com.au?subject=SenderDeck%20security%20report">support@devectus.com.au</a>
          {" "}with “SenderDeck security report” in the subject. Include a clear
          description, affected URL or feature, reproducible steps and the
          potential impact. Do not access other users’ data, disrupt service,
          perform social engineering or publish sensitive details before we
          have had a reasonable opportunity to investigate.
        </p>
      </section>

      <section>
        <h2>Privacy incidents</h2>
        <p>
          Privacy concerns or suspected exposure of personal information should
          be reported to <a href="mailto:privacy@devectus.com.au">privacy@devectus.com.au</a>.
        </p>
      </section>
    </LegalPage>
  );
}
