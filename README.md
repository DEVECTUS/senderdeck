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

The service does not synchronize or index mailboxes, retain message bodies, run background jobs, send automatically, perform bulk email, or expose calendar/shared-mailbox functions.

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
