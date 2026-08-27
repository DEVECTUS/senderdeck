import type { Metadata } from "next";
import LegalPage from "../LegalPage";

export const metadata: Metadata = {
  title: "Privacy | SenderDeck by DEVECTUS",
  description: "How SenderDeck accesses, uses, protects, and deletes account and email data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="// Privacy statement"
      title="Privacy by design, not by promise."
      summary="This statement explains how SenderDeck accesses and handles information when you connect Google or Microsoft email accounts."
      updated="27 August 2026"
    >
      <section>
        <h2>1. Who operates SenderDeck</h2>
        <p>
          SenderDeck is operated by DEVECTUS Pty Ltd (“DEVECTUS”, “we”, “us” or
          “our”), Level 33, 385 Bourke Street, Melbourne VIC 3000, Australia.
          This statement applies specifically to SenderDeck and supplements the
          broader <a href="https://devectus.com.au/privacy-policy">DEVECTUS Privacy Policy</a>.
        </p>
      </section>

      <section>
        <h2>2. Information we handle</h2>
        <p>Depending on the features you use, SenderDeck handles:</p>
        <ul>
          <li>Your SenderDeck sign-in identifier and email address, established through Google or Microsoft or, for compatible OpenAI-hosted sessions, supplied by the hosting platform.</li>
          <li>Connected account information, including provider, email address, account label, granted scopes and connection timestamps.</li>
          <li>OAuth access and refresh tokens issued by Google or Microsoft. Tokens are encrypted before storage.</li>
          <li>Email search results, message content and attachment data requested by you. These are fetched on demand and processed transiently.</li>
          <li>Draft details needed to create, inspect and send provider-hosted drafts.</li>
          <li>Limited technical and security information needed to operate, diagnose and protect the service.</li>
        </ul>
      </section>

      <section>
        <h2>3. How we use information</h2>
        <p>We process information only to:</p>
        <ul>
          <li>connect, label, route and disconnect the email accounts you authorise;</li>
          <li>search and read messages when you request it;</li>
          <li>create and inspect drafts with your chosen email provider;</li>
          <li>list, download or send attachments when you request it and applicable security limits permit it;</li>
          <li>send a provider-hosted draft only after confirmation of the sender, recipients, subject and attachments;</li>
          <li>maintain service security, reliability and support; and</li>
          <li>comply with applicable legal obligations.</li>
        </ul>
        <p>
          We do not sell email data, use it for advertising, build marketing
          profiles from it, or use mailbox content to train general-purpose AI
          models.
        </p>
      </section>

      <section>
        <h2>4. Storage and retention</h2>
        <p>
          SenderDeck does not synchronise or index entire mailboxes and does not
          intentionally retain message bodies or attachment contents. Messages
          and attachments are retrieved only for the requested operation.
          Drafts remain with Google or Microsoft.
        </p>
        <p>
          Encrypted OAuth tokens, provider identity links and account preferences remain until you
          disconnect the account or the service must remove them for security,
          legal or operational reasons. OAuth transaction state is short-lived.
          SenderDeck browser sessions expire after 30 days and can be ended sooner by signing out.
          SenderDeck connection access tokens expire after one hour and refresh
          tokens expire after 30 days unless they are rotated or revoked sooner.
          Limited operational records may be retained only as long as reasonably
          necessary for security, troubleshooting and legal obligations.
        </p>
      </section>

      <section>
        <h2>5. Disclosure and service providers</h2>
        <p>
          Information may be processed by Google or Microsoft as your email
          provider, by OpenAI or Anthropic services when you use SenderDeck from
          their products, and by infrastructure providers used to host and secure
          SenderDeck. These providers process information under their own terms
          and privacy commitments. Processing may occur outside Australia.
        </p>
        <p>
          We may also disclose information where required by law, to protect
          users or the service, or as part of a corporate transaction subject to
          appropriate safeguards.
        </p>
      </section>

      <section>
        <h2>6. Your choices and controls</h2>
        <ul>
          <li>Choose which accounts to connect and what label to give each account.</li>
          <li>Disconnect an account from SenderDeck to remove its stored connection and encrypted tokens.</li>
          <li>Revoke SenderDeck directly from your Google Account or Microsoft account consent settings.</li>
          <li>Request access, correction or deletion of personal information held by DEVECTUS.</li>
        </ul>
        <p>
          Disconnecting SenderDeck does not delete email or drafts stored by
          your email provider.
        </p>
        <p>
          To delete all SenderDeck connection data, disconnect each account and
          email <a href="mailto:privacy@devectus.com.au?subject=SenderDeck%20deletion%20request">privacy@devectus.com.au</a>
          {" "}from the address associated with your SenderDeck sign-in. We may
          request reasonable identity verification before completing the request.
        </p>
      </section>

      <section>
        <h2>7. Security</h2>
        <p>
          We use safeguards designed for the sensitivity of connected mailbox
          access, including encrypted token storage, least-privilege delegated
          OAuth permissions, per-user account separation, configurable
          attachment restrictions and exact confirmation before sending. No
          internet service can guarantee absolute security.
        </p>
      </section>

      <section>
        <h2>8. Children</h2>
        <p>
          SenderDeck is intended for business and adult users and is not
          directed to children under 16.
        </p>
      </section>

      <section>
        <h2>9. Contact and complaints</h2>
        <p>
          Privacy questions, access or deletion requests and complaints can be
          sent to <a href="mailto:privacy@devectus.com.au">privacy@devectus.com.au</a>.
          You may also write to the Privacy Officer, DEVECTUS Pty Ltd, Level 33,
          385 Bourke Street, Melbourne VIC 3000, Australia.
        </p>
      </section>

      <section>
        <h2>10. Changes</h2>
        <p>
          We may update this statement when SenderDeck, its providers or legal
          requirements change. The current version and effective date will be
          published on this page.
        </p>
      </section>
    </LegalPage>
  );
}
