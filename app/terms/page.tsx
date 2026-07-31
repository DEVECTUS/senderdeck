import type { Metadata } from "next";
import LegalPage from "../LegalPage";

export const metadata: Metadata = {
  title: "Terms | SenderDeck by DEVECTUS",
  description: "Terms governing access to and use of SenderDeck.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="// Terms of service"
      title="Clear rules for deliberate email."
      summary="These terms govern your access to and use of SenderDeck, including its Google and Microsoft email integrations."
      updated="31 July 2026"
    >
      <section>
        <h2>1. Agreement and operator</h2>
        <p>
          These terms form an agreement between you and DEVECTUS Pty Ltd
          (“DEVECTUS”, “we”, “us” or “our”), Level 33, 385 Bourke Street,
          Melbourne VIC 3000, Australia. By accessing SenderDeck, you agree to
          these terms. If you use SenderDeck for an organisation, you confirm
          that you are authorised to accept these terms for that organisation.
        </p>
      </section>

      <section>
        <h2>2. What SenderDeck does</h2>
        <p>
          SenderDeck lets an authenticated user connect and manage multiple
          Google and Microsoft email accounts, search and read messages on
          demand, create provider-hosted drafts, handle permitted attachments
          and send a draft after exact confirmation.
        </p>
        <p>
          SenderDeck does not provide background mailbox monitoring, bulk or
          marketing email, automatic sending, calendar functions or support for
          shared or delegated mailboxes unless we expressly add those features.
        </p>
      </section>

      <section>
        <h2>3. Eligibility and authority</h2>
        <p>
          You must be at least 18 years old and legally able to enter this
          agreement. You may connect only accounts you own or are authorised to
          use. Your organisation may impose additional security, consent and
          acceptable-use requirements.
        </p>
      </section>

      <section>
        <h2>4. Your responsibilities</h2>
        <ul>
          <li>Keep your ChatGPT, Codex, Google and Microsoft accounts secure.</li>
          <li>Review the selected sender, all recipients, subject and attachments before approving a send.</li>
          <li>Comply with privacy, confidentiality, recordkeeping, anti-spam and employment obligations that apply to your messages.</li>
          <li>Do not use SenderDeck for unlawful, deceptive, abusive, malicious, unsolicited bulk or rights-infringing activity.</li>
          <li>Do not attempt to bypass limits, access another user’s data, interfere with the service or introduce harmful content.</li>
        </ul>
      </section>

      <section>
        <h2>5. Connected services</h2>
        <p>
          Google, Microsoft, OpenAI and other third-party services are governed
          by their own terms. Their availability, permissions and policies may
          affect SenderDeck. We are not responsible for third-party services or
          for changes they make.
        </p>
      </section>

      <section>
        <h2>6. Pre-release status and changes</h2>
        <p>
          SenderDeck may be offered as a private proof of concept, pilot or
          pre-release service. Features may change, be limited or be withdrawn.
          We may suspend access to protect users, providers or the service, or
          to comply with law or provider requirements.
        </p>
      </section>

      <section>
        <h2>7. Intellectual property</h2>
        <p>
          SenderDeck, its software, design and branding are owned by DEVECTUS
          or its licensors. These terms grant you a limited, revocable,
          non-transferable right to use the service for its intended purpose.
          You retain ownership of your email content and other materials.
        </p>
      </section>

      <section>
        <h2>8. Privacy and data handling</h2>
        <p>
          Our <a href="/privacy">SenderDeck Privacy Statement</a> explains how
          information is accessed, used, stored and deleted. You must ensure you
          have a lawful basis to process information you access or send through
          connected accounts.
        </p>
      </section>

      <section>
        <h2>9. Availability and warranties</h2>
        <p>
          SenderDeck is provided on an “as available” basis. To the extent
          permitted by law, we do not guarantee uninterrupted operation,
          compatibility with every provider configuration, or that the service
          will meet every requirement. Nothing in these terms excludes rights
          or guarantees that cannot lawfully be excluded, including applicable
          rights under the Australian Consumer Law.
        </p>
      </section>

      <section>
        <h2>10. Liability</h2>
        <p>
          To the extent permitted by law, DEVECTUS is not liable for indirect,
          consequential or special loss, loss of profit, loss of opportunity or
          loss caused by third-party services, unauthorised account access, or
          messages you approve and send. Where liability cannot be excluded, it
          is limited to the maximum extent permitted by law.
        </p>
      </section>

      <section>
        <h2>11. Ending access</h2>
        <p>
          You may stop using SenderDeck and disconnect your accounts at any
          time. We may suspend or end access for material breach, security risk,
          provider requirement, legal obligation or discontinuation. Provisions
          intended to survive termination continue to apply.
        </p>
      </section>

      <section>
        <h2>12. Governing law</h2>
        <p>
          These terms are governed by the laws of Victoria, Australia. Courts
          with jurisdiction in Victoria have non-exclusive jurisdiction,
          subject to any mandatory rights that apply where you live.
        </p>
      </section>

      <section>
        <h2>13. Contact</h2>
        <p>
          Questions about these terms can be sent to
          {" "}<a href="mailto:support@devectus.com.au">support@devectus.com.au</a>
          {" "}or DEVECTUS Pty Ltd, Level 33, 385 Bourke Street, Melbourne VIC
          3000, Australia.
        </p>
      </section>
    </LegalPage>
  );
}
