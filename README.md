# SenderDeck by DEVECTUS

A production-candidate Streamable HTTP MCP server for Codex and Claude that works with up to 10 Gmail, Google Workspace, Outlook.com, and Microsoft 365 accounts per user.

## What is implemented

- Per-user connect, label, list, route, and disconnect account tools.
- Google and Microsoft multi-account OAuth with PKCE and encrypted token storage.
- Cross-account search and on-demand message reading.
- Provider-hosted new drafts and reply drafts.
- Exact sender, recipient, subject, and attachment confirmation before sending.
- On-demand attachment listing and base64 download with configurable size, extension, and MIME-type controls.
- D1 storage for encrypted tokens, account preferences, provider identity links, opaque sessions, and short-lived OAuth state.
- Dual Codex and Claude plugin manifests plus a shared sender-routing skill in `plugins/senderdeck/`.
- Repository marketplaces for Codex in `.agents/plugins/marketplace.json` and Claude in `.claude-plugin/marketplace.json`.

The email service does not synchronize or index mailboxes, retain email message bodies, send automatically, perform bulk email, or expose calendar/shared-mailbox functions. Optional social storage and monitoring are described below.

## Social workspace (0.4.0)

`/conversations` adds customers, role-based memberships, brands, configurable policies, explicit account routing, enquiry review and an activity feed. Email tools and their contracts are preserved; linking an email account to a brand does not delegate its owner's mailbox access.

The optional Meta module implements hosted OAuth, verified asset selection, encrypted tokens, current permission/task checks, paginated message and comment reads, expiring encrypted drafts, exact revision approval, 24-hour private reply windows and atomic send claims. Signed webhooks enter a durable deduplicated queue. A scheduled handler and authenticated maintenance endpoint support reconciliation and cleanup. Notifications are local workspace/MCP records, not external messages.

**Activation is gated.** No provider credentials, customer grants or live social coverage are included in the release. Meta external-customer access requires a DEVECTUS platform app and Advanced Access. Social sending defaults off. A real hosted maintenance run is required before OAuth activation. LinkedIn community APIs, Page messaging, Instagram mentions and social attachment sends remain explicitly unavailable pending approval/validation. Existing browser monitoring must continue until actual API coverage is established.

The plugin adds 24 `social_*` tools and the `social-conversations` skill alongside the existing 14 email tools. See [activation and verification requirements](docs/SOCIAL-ACTIVATION.md) and the [hosted setup guide](https://senderdeck.devectus.com.au/social-setup).

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

Run `npm run db:generate`, `npm run typecheck`, and `npm run build`. For local MCP calls without Sites identity forwarding, set `ALLOW_DEV_AUTH=true` and send an `x-dev-user-email` request header.

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

Google requests OpenID email identity plus `gmail.readonly` and `gmail.compose`. Microsoft requests OpenID identity plus `Mail.ReadWrite` and `Mail.Send`, with `offline_access`.

Public submission materials are maintained in `publishing/OPENAI-PLUGIN-SUBMISSION.md` and `publishing/CLAUDE-PUBLISHING-PLAN.md`. Provider verification, publisher verification, reviewer credentials, external security review and legal approval remain account-bound release gates.

## Claude testing

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
  `DEVECTUS/senderdeck` to 0.3.4, reload the plugin/MCP connection or restart Codex,
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
