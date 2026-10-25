# SenderDeck by DEVECTUS

**Open-source email and brand conversation tools for Codex and Claude.**

SenderDeck connects AI clients to explicitly selected accounts so you can review messages, prepare replies and retain control over delivery. It combines on-demand Google and Microsoft email workflows with customer workspaces, brand rules and an optional social conversation module. The source is available under the [MIT License](LICENSE).

[Use SenderDeck](https://senderdeck.devectus.com.au/) · [Install the plugin](https://senderdeck.devectus.com.au/install) · [Releases](https://github.com/DEVECTUS/senderdeck/releases) · [Contribute](CONTRIBUTING.md) · [Report a security issue](SECURITY.md)

## What you can use

| Area | Capabilities | Current status |
| --- | --- | --- |
| Google and Microsoft email | Up to 10 Gmail, Google Workspace, Outlook.com or Microsoft 365 accounts per user; explicit routing; search/read; attachments; authorised Gmail aliases; create/update/inspect drafts | Implemented and deployed; provider consent and valid grants required |
| Customer and brand workspaces | Multiple brands, account associations, customer roles, tone/language/punctuation settings, verified facts and escalation rules | Available in Conversations |
| Enquiries and approvals | Status, assigned owner, next action, minimal audit records, encrypted expiring social drafts, exact revision approval | Implemented; social sending disabled in the current deployment |
| Facebook and Instagram | Hosted Meta OAuth, asset discovery/verification, messages, comment/reply trees, signed webhooks and reconciliation adapters | Activation pending platform approval, owner consent, live validation and hosted scheduling |
| WhatsApp Business | Existing Cloud API number connection, signed inbound webhooks, encrypted retained history, text drafts and exact approval within 24 hours | Implemented locally; migration, Meta configuration and live acceptance required; templates/media sending unavailable |
| LinkedIn | Explicit capability blockers and programme/data-use requirements | No live community or inbox access; Page messaging requires separate partner access |
| Other social capabilities | Instagram mentions, social attachment sending and provider-specific history extensions | Unavailable pending validation |

The project currently exposes **38 MCP tools**: 14 email tools and 24 social/workspace tools. A deployed adapter is not proof that a provider has approved access or that an inbox was checked. The hosted service reports connection capabilities and coverage limits explicitly.

## Typical workflows

- Search selected email accounts for messages needing attention, keeping each result attributed to its account.
- Prepare a reply from the chosen mailbox or authorised Gmail alias, inspect the saved draft and wait for separate approval.
- Organise customers and brands, record verified business information and define which enquiries need owner escalation.
- Review provider readiness, enquiry ownership and suggested social replies without presenting pending social access as active.

Email drafts remain with Google or Microsoft. Email search/read and attachment downloads are transient; the service does not synchronise or index whole mailboxes. The optional social module stores encrypted tokens, expiring history snapshots and drafts, plus policies and minimal enquiry metadata. See [architecture and data handling](docs/ARCHITECTURE.md) and the [privacy statement](https://senderdeck.devectus.com.au/privacy).

## Get started

1. Open the [hosted portal](https://senderdeck.devectus.com.au/) and sign in with Google or Microsoft. Review provider consent and connect the mailboxes you intend to use. Existing users can add a separate SenderDeck username/password under Settings → Sign-in details and use the ordinary sign-in page afterward; see [password sign-in](docs/PASSWORD-SIGN-IN.md).
2. Follow the [Codex and Claude installation guide](https://senderdeck.devectus.com.au/install). The repository includes both plugin formats and a shared remote MCP endpoint: `https://senderdeck.devectus.com.au/api/mcp`.
3. List accounts and explicitly select a sender before creating a draft. Sending requires a separate confirmation after inspecting the exact message details.
4. Open [Conversations](https://senderdeck.devectus.com.au/conversations) to create a customer and brand and configure rules, then use the [Meta connection wizard](https://senderdeck.devectus.com.au/connect/meta) to choose a brand, sign in to Meta and select accounts. Platform configuration and maintenance diagnostics are kept in the protected operator area.

The Accounts page groups social connections under customer/organisation, then brand, then account. Email mailboxes remain owned by the signed-in identity. The header shows the release version and sign-in source. If an older OpenAI sign-in shows a different workspace from a SenderDeck provider sign-in, use **Switch sign-in** and choose the provider identity used for the brands; matching email text does not merge access.

Customers do not need to create developer apps or run local relays for the hosted product. The service operator must complete the provider setup. Installing the plugin or saving a monitoring preference does not activate social access.

## Provider sign-in and connected mailboxes

Provider sign-in requests basic identity only: Google `openid email`; Microsoft `openid profile email User.Read`. It creates a SenderDeck session without connecting email or replacing saved mailbox credentials. Connect email separately in Settings to grant mailbox access. See [provider verification](publishing/PROVIDER-SIGN-IN-2026-10-24.md) for the remaining Google and Microsoft approval requirements.

A connected mailbox does not automatically grant sign-in to its owner's SenderDeck account. Under Settings → Connected email accounts, the signed-in owner can select **Enable sign-in** for a mailbox and confirm access to the whole account. A provider identity already assigned to another SenderDeck account cannot be reassigned this way. Disconnecting the mailbox removes its sign-in link. Preserve another sign-in method before disconnecting your login mailbox.

Google and Microsoft authorization must finish in the same browser that started it. Each flow uses its own short-lived Secure, HttpOnly, host-only cookie and one-use server state. Forwarded authorization links and callbacks from another browser are refused. Mailbox connection callbacks also require the same signed-in owner. Starts from before this security update must be restarted.

## Social activation and limits

Instagram comment hiding/restoration is available through `social_comment_inspect` and `social_comment_moderate`, or the authenticated [Comment visibility page](https://senderdeck.devectus.com.au/comments/moderate). Each operation requires exact human approval, owner/admin membership, a current provider grant and verified actual media ownership, then reads visibility back. It does not enable replies or request new scopes. See the [moderation contract and limitations](publishing/INSTAGRAM-MODERATION.md).

Facebook and Instagram access requires a DEVECTUS-owned platform app, appropriate App Review/Advanced Access, customer consent, explicit asset verification, working subscriptions and a hosted maintenance/reconciliation trigger. Social sending is off by default and also requires brand enablement and exact draft approval. No unattended replies are sent.

Connecting Meta requires configured platform credentials and actual customer grants. Background monitoring and physical retention cleanup separately require a working hosted maintenance trigger; a stale heartbeat does not prevent sign-in or account selection. Existing browser monitoring should continue until actual API coverage is proved. Meta may expose only 20 recent message details; Instagram Requests and media have additional limits. Unsupported history and attachments require native review. LinkedIn has separate programme, messaging and data-use restrictions.

See [WhatsApp Business setup and limitations](docs/WHATSAPP-BUSINESS.md).

See [activation and live acceptance requirements](docs/SOCIAL-ACTIVATION.md) or the [hosted provider guide](https://senderdeck.devectus.com.au/social-setup). Configuration switches are not a substitute for provider approval or successful live tests.

Platform operators have a separate `/operator/social` setup view protected by a hosting-controlled user-ID allowlist. It displays redacted configuration and observed readiness; verified operators can enter the two supported Meta secrets in a masked write-only form. Stored values are encrypted; native hosting secrets take precedence. Ordinary customer owners/admins cannot change global app settings. No operator is enabled automatically.

## Open-source development

The application uses TypeScript, React, Next.js through Vinext, Cloudflare Workers and D1, with Drizzle migrations. OAuth credentials are encrypted server-side. The web portal and MCP server share backend account and approval controls.

```text
npm ci
npm run typecheck
npm test
npm run dev
```

Node.js 22.13 or newer is required. Use synthetic data and mocked providers for tests. Local UI development needs environment values and local database bindings; deployment requires your own hosting and provider registrations. The hosted DEVECTUS app credentials and approval do not transfer to forks. See [CONTRIBUTING.md](CONTRIBUTING.md), [architecture](docs/ARCHITECTURE.md) and [.env.example](.env.example).

The 0.4.0 release passed 121 unit tests and 14 built-page tests. See the [changelog](CHANGELOG.md) for release scope and the actual validation recorded for each release. Public issues and pull requests are welcome; do not include private messages, tokens, reviewer credentials or customer account data.

## Project documentation

- [Contribution guide](CONTRIBUTING.md), [community expectations](CODE_OF_CONDUCT.md) and [security reporting](SECURITY.md)
- [Architecture, authorisation and storage](docs/ARCHITECTURE.md)
- [Social provider activation](docs/SOCIAL-ACTIVATION.md)
- [Changelog](CHANGELOG.md) and [GitHub releases](https://github.com/DEVECTUS/senderdeck/releases)
- [Plugin listing status](publishing/LISTING-STATUS.md) and maintained OpenAI/Claude submission copy

## Licence and support

MIT licensed. Copyright © 2026 DEVECTUS Pty Ltd. Open source does not imply provider approval, unlimited hosted capacity, a support SLA or endorsement by Google, Microsoft, Meta, LinkedIn, OpenAI or Anthropic. For product support, see [Support](https://senderdeck.devectus.com.au/support); for sensitive reports use [SECURITY.md](SECURITY.md).

## Runtime configuration

Copy `.env.example` to `.env.local` for local work. Generate `TOKEN_ENCRYPTION_KEY` as 32 random bytes encoded with base64. Never commit real credentials or encryption keys.

Google OAuth redirect URI:

`https://senderdeck.devectus.com.au/oauth/google/callback`

Microsoft OAuth redirect URI:

`https://senderdeck.devectus.com.au/oauth/microsoft/callback`

Production MCP server URL:

`https://senderdeck.devectus.com.au/api/mcp`

Keep the original Sites-host callback URLs registered during the custom-domain transition so existing sessions can complete and the deployment can be rolled back safely.

Required hosted secrets:

- `TOKEN_ENCRYPTION_KEY`
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`

Optional configuration is documented in `.env.example`. The Microsoft tenant defaults to `common`, supporting personal Microsoft accounts and organizational tenants.

## Local validation

Run `npm run typecheck` and `npm test` after installing dependencies. Generate a new migration with `npm run db:generate` only when changing `db/schema.ts`; preserve existing migrations. `ALLOW_DEV_AUTH=true` enables a local browser/account API identity shortcut, not an unauthenticated MCP connection. MCP calls still require SenderDeck OAuth bearer tokens.

## Attachment references (0.3.7)

Treat attachment IDs as opaque and pass the exact `accountId`, `messageId`, and
attachment `id` from `email_read` or `attachment_list` to `attachment_download`.
Gmail references now identify the MIME part within that account/message; the
download resolves Gmail's latest attachment token. Nested and inline parts use
the same path. IDs from older versions may require another read/list if Gmail
has rotated the underlying token. Editing a Gmail draft replaces its message,
so use the IDs from the new inspection after an edit.

Download results return complete JSON, including `contentBase64`, in MCP text
content. They omit the duplicate `structuredContent` payload to avoid doubling
large binary responses. Other tools continue returning both representations.

Gmail search now reads the full MIME structure transiently to determine
`hasAttachments`, including inline files, and returns only summary fields. It
does not fetch external attachment bytes during search. This corrects the
metadata-only response's false negatives independently of download ID mapping.

The packaged plugin points to the Sites deployment at `/api/mcp`. Sites reserves `/mcp` at its edge, so production MCP clients must use `/api/mcp`. Public plugin connections use OAuth 2.1 authorization code flow with PKCE and per-user bearer tokens. Local development may opt into the `x-dev-user-email` shortcut only by setting `ALLOW_DEV_AUTH=true`; production must keep it disabled.

## OAuth permissions

Mailbox connection requests Google OpenID email identity plus `gmail.readonly` and `gmail.compose`. Microsoft mailbox connection requests OpenID identity plus `User.Read`, `Mail.ReadWrite` and `Mail.Send`, with `offline_access`. Signing in alone does not request mailbox scopes or offline access.

Public submission materials are maintained in `publishing/OPENAI-PLUGIN-SUBMISSION.md` and `publishing/CLAUDE-PUBLISHING-PLAN.md`. Provider verification, publisher verification, reviewer credentials, external security review and legal approval remain account-bound release gates.

## Claude testing

For Claude Code 2.1.275 or later, install directly with `/plugin install senderdeck --marketplace DEVECTUS/senderdeck`.

For Claude Code, validate the repository marketplace with `claude plugin validate .`, add it with `claude plugin marketplace add DEVECTUS/senderdeck`, then install `senderdeck@devectus-senderdeck`. Authenticate the bundled remote MCP server from `/mcp`.

For hosted Claude surfaces, add `https://senderdeck.devectus.com.au/api/mcp` under **Customize → Connectors → Add custom connector**. The hosted OAuth callback is restricted to `https://claude.ai/api/mcp/auth_callback`; Claude Code uses a loopback callback.

Codex and Claude use the same SenderDeck OAuth authorization server. Claude-only users sign in directly with Google or Microsoft; the selected provider identity establishes the SenderDeck user and connects the first mailbox. Existing OpenAI-hosted identities remain supported as a compatibility fallback, and additional mailboxes are linked to the same SenderDeck user.

## License

SenderDeck is open source under the [MIT License](LICENSE). Copyright © 2026 DEVECTUS Pty Ltd.

## Formatted emails and signatures

`draft_create` and `draft_reply` accept optional `bodyHtml` alongside the required
`bodyText` fallback. Supply the complete authored HTML body, including the sender's
signature. Gmail uses MIME alternatives (text and HTML); Outlook uses an HTML body.
Existing plain-text calls continue to work.

For embedded logos/images, pass an attachment with `contentId: "logo@signature"`
and reference it with `<img src="cid:logo@signature">` in `bodyHtml`. Omit `contentId`
for ordinary attachments. IDs must be unique and contain only letters, digits,
`.`, `_`, `@`, `+`, or `-` (maximum 200 characters). Inline files require HTML,
use the same size/type limits, and appear in attachment inspection and confirmation.
Attachment reads include `contentId` and `isInline` metadata for reusing images.

Signatures are not automatically fetched from Gmail/Outlook settings or stored by
SenderDeck. Supply signature HTML/images explicitly, or reuse a sender-owned
message identified by the user. Preserve the HTML rather than reconstructing it
from plain text. Use email-compatible inline CSS and verify important layouts in
the recipient's mail client. Reply-history behavior differs by provider; include
any quoted HTML that must be retained in the authored body.

Example tool arguments (image bytes abbreviated for illustration):

```json
{
  "accountId": "chosen-account-id",
  "to": ["recipient@example.com"],
  "subject": "Project update",
  "bodyText": "Hello, here is the update.\nAlex | Example Co",
  "bodyHtml": "<p>Hello, here is the update.</p><div style=\"color:#234567\"><b>Alex</b> | Example Co<br><img src=\"cid:logo@signature\" alt=\"Example Co\"></div>",
  "attachments": [{
    "filename": "logo.png",
    "contentType": "image/png",
    "contentBase64": "<base64 image bytes>",
    "contentId": "logo@signature"
  }]
}
```

After deploying the backend, refresh/reconnect the MCP client to load the updated
tool schema and update the installed plugin skill. An existing session exposing
only `bodyText` cannot use the new fields until its tools refresh.

## Updating saved drafts

`draft_update` edits the existing provider draft ID without sending or creating a
second draft. Call `draft_inspect`, then pass `accountId`, `draftId`, and the
returned `revision` as `expectedRevision`, plus only the fields to change:

```json
{
  "accountId": "chosen-account-id",
  "draftId": "existing-provider-draft-id",
  "expectedRevision": "revision-from-draft-inspect",
  "bodyHtml": "<p>Revised wording.</p><div>Existing signature HTML here</div>"
}
```

Omitted fields preserve saved values. Empty strings clear subject/body values;
empty arrays clear To/Cc/Bcc. `attachments` replaces the **whole** list, including
inline files; `attachments: []` removes them all. Omit it for body-only edits.
The update response and `draft_inspect` include saved body content, body format,
thread/message IDs, attachment metadata and a revision scoped to account/draft.
Gmail retains the original MIME attachment bytes and reply headers when omitted.
Outlook updates only requested message properties and retains conversation context.

Every send confirmation must now include `revision` copied from a fresh inspection,
in addition to sender, To/Cc/Bcc, subject and attachment filenames/sizes. Changes to
the body, attachments or provider version invalidate earlier approval. Existing
clients must refresh their tool schemas; confirmations without revision fail.

Provider limits:

- Gmail uses [drafts.update](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/update)
  to replace content under the same draft ID. The message ID changes. SenderDeck
  checks the revision before editing and again immediately before writing, but
  Gmail exposes no atomic compare-and-swap precondition for this operation. Avoid
  simultaneous edits in another client. Signed/encrypted or malformed MIME is
  rejected rather than silently rebuilt. Updated recipient headers use ASCII
  email addresses; existing recipient headers remain untouched when omitted.
- Gmail preserves `threadId`, `In-Reply-To` and `References`. Changing a reply's
  subject can affect Gmail's thread grouping rules despite those preserved values.
- Outlook stores one body rather than independent text/HTML alternatives. Its
  `bodyText` inspection value for HTML is derived. Use `bodyHtml` for formatted
  drafts; switching explicitly to text requires `bodyHtml: ""` plus `bodyText`.
  Setting HTML on a text draft replaces the sole stored body with HTML.
- Outlook [message updates](https://learn.microsoft.com/en-us/graph/api/message-update?view=graph-rest-1.0)
  use PATCH and the available ETag. Attachment replacement takes separate calls,
  uploads replacements before removing originals, and is not transactional. A
  failure may leave partial changes; inspect the same draft before retrying.
  New Outlook replacement files must each be smaller than 3 MB (upload sessions
  are not implemented). Omitted large attachments remain untouched.
- Inspection and sending are separate provider operations. Revision checking
  rejects already-stale approvals, but cannot lock a mailbox against an external
  change in the interval between the final check and the provider send operation.

Tests use mocked provider APIs; no real messages are sent as part of validation.

## Gmail send-as aliases (0.3.4)

`account_list` returns `senderIdentities` beneath each owning account: Gmail's
primary identity plus custom identities with `verificationStatus: accepted`.
Pending or unknown identities are excluded. Aliases share the account's OAuth
connection and `accountId`, and do not count as additional accounts. The settings
page shows them beneath the owning Google account. Discovery failures are reported
in `senderDiscoveryError`, with no cached aliases advertised.

`route_account` accepts an exact alias email and returns the owner plus
`selectedFrom`. Ambiguous ownership fails. Carry `selectedFrom` explicitly into
the optional `from` field of `draft_create`, `draft_reply` or `draft_update`:

```json
{
  "accountId": "owning-google-account-id",
  "from": "support@example.com",
  "to": [],
  "subject": "Unsent alias test",
  "bodyText": "Safe draft only."
}
```

`from` must be one bare email address. Server-side checks fetch the selected
account's current Gmail sendAs list and reject unknown, pending, malformed or
other-account identities before writing. Creation without `from` still uses the
connected primary address, even if Gmail's default is an alias. Updating without
`from` preserves the saved identity; empty `from` is invalid. Microsoft permits
only its connected primary address.

`draft_inspect.sender` is the exact effective mailbox; `fromHeader` preserves the
saved Gmail display name/header. Missing or ambiguous From headers fail closed.
Changing From invalidates the previous revision and send confirmation. The send
summary must show both the owning account and inspected alias. Sending revalidates
the inspected identity with Gmail and rechecks the full draft revision after that
lookup. Revoked aliases fail; they never silently fall back to the primary.

The existing `gmail.readonly` scope authorises
[sendAs.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.sendAs/list).
No OAuth scope expansion or Gmail settings-write permission is needed. Custom
identities must have Gmail's
[accepted verification status](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.settings.sendAs).
No aliases are created or verified by SenderDeck. Alias signatures and SMTP
settings are neither requested nor exposed. Gmail offers no atomic lock across
alias validation, draft inspection and send, so concurrent external changes in
that final interval remain a provider limitation.

Release schemas are in `publishing/mcp-tools-0.3.4.json`. Run `npm run test:unit`
for the provider-mocked security tests, or `npm test` for the full build and suite.

### Loading the updated capabilities in an existing Codex chat

The MCP URL remains `https://senderdeck.devectus.com.au/api/mcp`. A live server
deployment does not itself prove an existing chat has refreshed tool definitions.
Check that `draft_create`, `draft_reply` and `draft_update` expose optional `from`,
and that `account_list` describes nested `senderIdentities`.

- For the installed repository plugin, update SenderDeck from
  `DEVECTUS/senderdeck` to the latest release, reload the plugin/MCP connection or restart Codex,
  then reopen the existing chat and verify those fields before using them. If that
  chat retains its old tool definitions, start a new chat after updating. Updating
  the remote schema does not migrate an already loaded skill package.
- For the published OpenAI-directory connector, open its existing developer-portal
  listing, select **MCPs**, choose the server, then **Issues → Rescan**. Confirm
  that the **Live definition** includes `from`; a held update can retain older
  metadata even when the server is deployed. Update the package for the revised
  skill, then reload the connector in Codex and verify its tool definitions.
  See [OpenAI's MCP update process](https://developers.openai.com/plugins/deploy/submission).
- No mailbox reconnection is needed solely for this feature when the existing
  grant already has SenderDeck's documented scopes. A revoked or incomplete
  provider grant still requires reconnection through the normal account flow.

After reloading, list accounts, select the owning account and authorised alias,
create an unsent draft with `from`, and inspect its `sender`/`fromHeader` before
preparing any separate send confirmation. Do not assume an alias is authorised
merely because its domain belongs to the same organisation.

Version 0.3.5 includes the currently inspected draft message ID in Gmail update
requests, separately from the stable draft ID and conversation ID. Repeated edits
use the newly returned message ID. Provider errors identify the failing HTTP
method and endpoint without including credentials or request bodies.

### Explicitly linked OpenAI sign-in

A hosting owner can configure `OPENAI_SIGNIN_LINKS` as a private JSON object mapping an exact, independently verified OpenAI site subject ID to an existing active SenderDeck provider user ID, after the person explicitly authorises linking. Matching email addresses never create a link. Do not put private IDs in repository examples, browser storage or request bodies. Links have no public write endpoint.

Use **Continue with OpenAI** to authenticate through Sites. That fresh platform identity resolves to the linked SenderDeck account and its existing workspace permissions. This does not migrate accounts, credentials, conversations or policies. Existing Google and password sign-ins keep the same account. Retired cookies and MCP credentials stay revoked; reconnect an AI client to obtain fresh credentials. A missing or retired destination fails closed. Removing the hosting link revokes the linked route without deleting stored data or retirement markers.
