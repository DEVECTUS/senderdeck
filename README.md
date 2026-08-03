# SenderDeck by DEVECTUS

A private v1 proof of concept for a stateless Streamable HTTP MCP server that works with up to 10 Gmail, Google Workspace, Outlook.com, and Microsoft 365 accounts per ChatGPT/Codex user.

## What is implemented

- Per-user connect, label, list, route, and disconnect account tools.
- Google and Microsoft multi-account OAuth with PKCE and encrypted token storage.
- Cross-account search and on-demand message reading.
- Provider-hosted new drafts and reply drafts.
- Exact sender, recipient, subject, and attachment confirmation before sending.
- On-demand attachment listing and base64 download with configurable size, extension, and MIME-type controls.
- D1 storage for encrypted tokens, account preferences, and short-lived OAuth state only.
- A packaged Codex plugin and minimal sender-routing skill in `senderdeck/`.

The service does not synchronize or index mailboxes, retain message bodies, run background jobs, send automatically, perform bulk email, or expose calendar/shared-mailbox functions.

## Runtime configuration

Copy `.env.example` to `.env.local` for local work. Generate `TOKEN_ENCRYPTION_KEY` as 32 random bytes encoded with base64. Never commit real credentials or encryption keys.

Google OAuth redirect URI:

`https://<private-site-host>/oauth/google/callback`

Microsoft OAuth redirect URI:

`https://<private-site-host>/oauth/microsoft/callback`

Required hosted secrets:

- `TOKEN_ENCRYPTION_KEY`
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`

Optional configuration is documented in `.env.example`. The Microsoft tenant defaults to `common`, supporting personal Microsoft accounts and organizational tenants.

## Local validation

Run `npm run db:generate`, `npm run typecheck`, and `npm run build`. For local MCP calls without Sites identity forwarding, set `ALLOW_DEV_AUTH=true` and send an `x-dev-user-email` request header.

The packaged plugin points to the owner-only Sites deployment at `/api/mcp`. Sites reserves `/mcp` at its edge, so production MCP clients must use `/api/mcp`. Keep the site access policy private until provider credentials, legal URLs, external security review, and verified publisher metadata are approved.

## OAuth permissions

Google requests OpenID email identity plus `gmail.readonly` and `gmail.compose`. Microsoft requests OpenID identity plus `Mail.ReadWrite` and `Mail.Send`, with `offline_access`.

Provider production credentials, privacy/terms URLs, verified publisher metadata, and public marketplace submission are intentionally not created by this proof of concept.
