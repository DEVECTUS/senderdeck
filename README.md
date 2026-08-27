# SenderDeck by DEVECTUS

A production-candidate Streamable HTTP MCP server for Codex and Claude that works with up to 10 Gmail, Google Workspace, Outlook.com, and Microsoft 365 accounts per user.

## What is implemented

- Per-user connect, label, list, route, and disconnect account tools.
- Google and Microsoft multi-account OAuth with PKCE and encrypted token storage.
- Cross-account search and on-demand message reading.
- Provider-hosted new drafts and reply drafts.
- Exact sender, recipient, subject, and attachment confirmation before sending.
- On-demand attachment listing and base64 download with configurable size, extension, and MIME-type controls.
- D1 storage for encrypted tokens, account preferences, and short-lived OAuth state only.
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

The current production identity bootstrap is supplied by the hosting platform's ChatGPT sign-in. It can be used while testing Claude, but a vendor-neutral SenderDeck sign-in is a release gate before broad Claude directory submission so Claude-only customers are not required to hold a separate ChatGPT account.
