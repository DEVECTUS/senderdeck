import type { Metadata } from "next";
import { publicPageMetadata } from "../site-seo";
import LegalPage from "../LegalPage";

export const metadata: Metadata = {
  ...publicPageMetadata("/security"),
  title: "Security | SenderDeck by DEVECTUS",
  description: "SenderDeck security architecture, controls and responsible disclosure.",
};

export default function SecurityPage() {
  return (
    <LegalPage
      eyebrow="// Security"
      title="Small attack surface. Strong user control."
      summary="SenderDeck is designed to minimise retained data and keep sensitive email actions deliberate."
      updated="21 October 2026"
    >
      <section>
        <h2>Security principles</h2>
        <ul>
          <li><strong>Least privilege:</strong> delegated OAuth permissions are limited to enabled email or social functions.</li>
          <li><strong>On-demand access:</strong> mailboxes are not synchronised or indexed into a separate message database.</li>
          <li><strong>Platform secret setup:</strong> a verified operator allowlist, same-origin HTTPS requests and session-bound CSRF protect the write-only Meta form. Values are encrypted; customer roles never grant platform access.</li>
          <li><strong>Encrypted credentials:</strong> OAuth tokens are encrypted before storage and are separated by authenticated user.</li>
          <li><strong>Password sign-in:</strong> Optional SenderDeck passwords use salted scrypt hashes, persistent attempt limits and secure session cookies. Adding a password requires recent sign-in; changing one requires the current password. Mailbox ownership and workspace roles remain scoped to the same SenderDeck user.</li>
          <li><strong>Vendor-neutral identity:</strong> Google or Microsoft establishes the SenderDeck user for both Codex and Claude; opaque browser sessions are stored server-side and expire after 30 days.</li>
          <li><strong>Per-user MCP authorization:</strong> Codex and Claude connections use OAuth 2.1 authorization code flow with PKCE, short-lived access tokens and rotating refresh tokens.</li>
          <li><strong>Provider-hosted email drafts:</strong> email drafts remain with Google or Microsoft. Optional social drafts are encrypted and expire locally.</li>
          <li><strong>Deliberate sending:</strong> sending requires confirmation of the exact sender, recipients, subject and attachment list.</li>
          <li><strong>Attachment controls:</strong> configurable type and size limits block high-risk or oversized attachments.</li>
          <li><strong>Minimal email retention:</strong> email message bodies and attachment contents are processed transiently for requested operations.</li>
          <li><strong>Social isolation:</strong> backend membership and role checks scope every brand, account and draft. Linking a mailbox does not share its credentials with team members.</li>
          <li><strong>Organic publishing:</strong> brand-scoped standing authority, exact destinations, encrypted uploads, independent receipts and uncertain-outcome locks are separate from reply approval. Provider permissions remain mandatory.</li>
          <li><strong>Social approvals:</strong> immutable revisions, expiring approval tokens, fresh history checks and atomic claims reject stale and duplicate sends. Uncertain delivery requires native review.</li>
          <li><strong>Verified webhooks:</strong> Meta signatures are checked over the original body before encrypted events enter a durable deduplicated queue.</li>
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
          SenderDeck does not perform automatic or scheduled sending, bulk campaigns,
          calendar operations or shared mailbox access. Optional social monitoring requires
          verified provider access and an independently running hosted scheduler. LinkedIn
          and unsupported provider features remain unavailable pending approval.
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
