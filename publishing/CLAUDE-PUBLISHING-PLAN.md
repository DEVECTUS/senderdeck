# SenderDeck Claude publishing plan

Prepared 27 August 2026 for Claude Code, Cowork, and the Claude Connectors Directory.

## Release targets

SenderDeck has two complementary Claude distribution paths:

1. **Claude plugin directory:** publishes the sender-routing skill together with the remote MCP configuration for Claude Code and Cowork.
2. **Claude Connectors Directory:** publishes the production remote MCP server for Claude.ai, Desktop, mobile, Cowork, Claude Code, and API-supported connector surfaces.

The plugin and connector should share the same production endpoint, safety behavior, listing language, legal URLs, and release version.

Current listing copy updated 21 October 2026 for 0.4.1. Historical review notes below remain dated evidence, not a claim of current directory approval. Read [listing status and publication boundaries](LISTING-STATUS.md) before a new submission.

## Listing

- **Name:** SenderDeck by DEVECTUS
- **Developer:** DEVECTUS Pty Ltd
- **Category:** Productivity
- **Short description:** Email & brand conversations
- **Long description:** SenderDeck is an MIT-licensed, open-source workspace for email and brand conversations through Codex or Claude. Connect up to 10 Gmail, Google Workspace, Outlook.com and Microsoft 365 accounts per user. Search and read on demand, download attachments, select authorised Gmail aliases and create, update and inspect provider-hosted drafts. Email sending requires a separate confirmation of the exact sender, recipients, subject, attachments and current revision. Customer and brand workspaces add role controls, language and tone settings, source-labelled verified facts, escalation rules, enquiry ownership and an activity feed. Social history snapshots and immutable local drafts are encrypted and expire. Replies require approval of the exact brand, account, target, text and revision. Facebook and Instagram adapters are implemented, but live access requires platform approval, owner consent, verified assets and subscriptions, and a working hosted scheduler. Social sending and hosted monitoring are not active in the current deployment. LinkedIn community access and Page messaging, Instagram mentions and social attachment sending remain unavailable pending approval or validation. Coverage gaps are reported explicitly.
- **Website:** https://senderdeck.devectus.com.au/
- **Support:** https://senderdeck.devectus.com.au/support
- **Privacy:** https://senderdeck.devectus.com.au/privacy
- **Terms:** https://senderdeck.devectus.com.au/terms
- **Security:** https://senderdeck.devectus.com.au/security
- **MCP URL:** https://senderdeck.devectus.com.au/api/mcp
- **Transport:** Streamable HTTP
- **Authentication:** OAuth 2.0/2.1 authorization code flow with DCR, PKCE S256, short-lived access tokens, and rotating refresh tokens
- **Hosted Claude callback:** https://claude.ai/api/mcp/auth_callback

## Starter prompts

1. Search my connected inboxes for messages from the last seven days that need a reply.
2. Draft a reply from the right account, but do not send it.
3. Show me the exact sender, recipients, subject, and attachments before sending this draft.

## Phase 1 — compatibility and private testing

- [x] Add `.claude-plugin/plugin.json` to the existing plugin package.
- [x] Add a Claude repository marketplace at `.claude-plugin/marketplace.json`.
- [x] Use one standards-based `.mcp.json` for both Claude and Codex.
- [x] Allow only Claude's documented hosted callback plus loopback callbacks used by native clients.
- [x] Return OAuth challenges as both HTTP `401`/`WWW-Authenticate` and MCP `_meta["mcp/www_authenticate"]`.
- [x] Make MCP consent and return pages client-neutral.
- [ ] Deploy version 0.3.2 to production.
- [ ] Smoke-test DCR, authorization, token exchange, refresh, and revocation in Claude Code.
- [ ] Add the MCP URL as a Claude.ai custom connector and repeat the full OAuth smoke test.
- [ ] Run the positive and negative review scenarios from the OpenAI submission plan in both Claude surfaces.

## Phase 2 — publication readiness

- [x] Implement a vendor-neutral SenderDeck sign-in using Google or Microsoft, while retaining the OpenAI-hosted identity as a compatibility fallback.
- [ ] Deploy and smoke-test identity linking, session expiry, sign-out, and first-mailbox connection from both Codex and Claude.
- [x] Update privacy, terms, account deletion, and support procedures for the vendor-neutral identity flow and Anthropic processing.
- [x] Decide and add an explicit source license. The repository and plugin manifest declare MIT.
- [x] Confirm the public GitHub repository URL: https://github.com/DEVECTUS/senderdeck.
- [x] Run `claude plugin validate .` and `claude plugin validate plugins/senderdeck`; both passed on 2 October 2026.
- [ ] Verify tool names are at most 64 characters and that every tool exposes accurate `title`, `readOnlyHint`, and `destructiveHint` annotations.
- [ ] Verify production error messages are actionable and tool results remain proportionate in size.
- [ ] Complete an independent security review, including OAuth redirect validation, token rotation, account isolation, attachment handling, and confirmation mismatch enforcement.
- [ ] Prepare reviewer Google and Microsoft accounts with stable credentials, seeded messages, drafts, and no out-of-band MFA step during review.
- [ ] Record a Claude-specific review video showing install, OAuth, search, draft, exact confirmation, send, and disconnect.

## Phase 3 — staged publication

1. **Repository pilot:** publish the marketplace in the public repository and test direct installs with internal users.
2. **Custom connector pilot:** test the production MCP URL with Pro/Max and Team/Enterprise Claude accounts.
3. **Connector submission:** submit the remote MCP server through Anthropic's connector review flow; request Anthropic-held credentials or CIMD only if review recommends moving away from DCR at directory scale.
4. **Plugin submission:** submit the public GitHub repository or plugin zip through Claude.ai or Console after `claude plugin validate .` passes.
5. **Limited rollout:** launch to a small supported-country cohort, monitor OAuth/token errors and provider rate limits, then expand after legal and support approval.

## Review evidence pack

- Production endpoint ownership and TLS/domain verification.
- Privacy, terms, security, and support URLs.
- Architecture and data-flow diagram showing Claude → SenderDeck MCP → Google/Microsoft.
- Tool inventory with annotations and permission rationale.
- OAuth metadata, DCR response, callback allowlist, PKCE, refresh rotation, and revocation evidence.
- Data retention statement and account deletion procedure.
- At least three working prompts plus positive and negative review test results.
- Standard reviewer account with sample data.
- Security review report and remediation record.

## Go/no-go gates

On 2 October 2026, the Claude directory submission portal at https://claude.ai/directory/manage/new required sign-in in the in-app browser. No public Claude submission or custom connector installation was completed in this inspection. Cross-surface OAuth tests, reviewer video, independent security review, and legal approval remain unverified gates.

Do not submit broadly until the vendor-neutral identity migration, legal approval, explicit source licensing decision, production deployment, cross-surface OAuth tests, and independent security review are complete. Do not publish a send-capable listing if the exact-confirmation negative tests fail on either Claude or Codex.
