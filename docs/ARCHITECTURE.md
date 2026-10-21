# Architecture and data handling

SenderDeck exposes a web portal and a Streamable HTTP MCP server over shared TypeScript backend services. The portal manages identity, connections and brand workspaces; Codex or Claude invokes the MCP tools. Provider capabilities remain specific to each channel and account.

## Code map

| Location | Responsibility |
| --- | --- |
| `app/` | React pages, account configuration, conversation review and public documentation |
| `worker/index.ts` | Cloudflare request routing, health and scheduled entry point |
| `worker/identity-auth.ts`, `worker/auth.ts` | SenderDeck sign-in, sessions and trusted hosting identity |
| `worker/mcp-auth.ts`, `worker/mcp.ts` | Client OAuth, bearer authentication, tool discovery and dispatch |
| `worker/accounts.ts`, `worker/providers/` | Per-user email accounts and Google/Microsoft operations |
| `worker/social/` | Customer roles, brand policy, Meta onboarding, capability checks, conversations, drafts, queue processing and monitoring preferences |
| `db/schema.ts`, `drizzle/` | D1 schema and append-only migration history |
| `plugins/senderdeck/` | Codex/Claude manifests, remote MCP configuration and reusable skills |
| `tests/` | Provider-mocked workflows, authorisation regressions and built-page checks |
| `publishing/` | Listing source copy, package preparation and dated review evidence |

The application uses React/Next.js through Vinext and Vite on Cloudflare Workers. D1 stores account and application records; Drizzle generates migrations. The existing Sites build packages the worker and migrations for deployment. A fork must provision its own hosting, encryption key and provider apps.

## Identity and scope

Google or Microsoft sign-in establishes the SenderDeck user and an opaque browser session. Compatible hosting identity is supported separately. MCP clients use SenderDeck OAuth with PKCE, short-lived bearer tokens and rotating refresh tokens. A browser development header is not a replacement for MCP bearer authentication.

Email account queries are scoped to their owner. Gmail aliases belong to that same account; a matching domain or name does not establish send permission. Connecting an email account to a social brand associates it without delegating mailbox credentials to other customer members.

Social access follows customer membership, role, brand, account and thread checks in backend code. Owners/admins manage brand policy and connections; editors prepare drafts; reviewers approve replies; viewers read permitted records. Provider tokens and selected business assets are validated separately from customer membership. Caller-supplied IDs and model prompts never establish ownership.

## Draft delivery

Email drafts stay with Google or Microsoft. Inspection reads the current sender, recipients, subject, body, attachments and revision; a separate exact confirmation is required before sending. Edits invalidate prior approval.

Social drafts are local immutable records created from a fresh account-scoped history snapshot. Inspection exposes the exact brand, account, channel, target, text, attachments and revision. Sending requires a matching short-lived approval token, fresh membership/policy/history checks, validated capability and the provider response window. An atomic state transition prevents two requests from sending the same draft. Uncertain delivery is recorded and cannot be retried automatically.

The first social rollout permits only exact brand-approved wording, rejects unsupported attachments and blocks sensitive or incomplete-history responses. Keyword checks supplement human judgement; they do not prove a claim is true or replace an owner's escalation decision. Social sending is disabled in the current deployment.

## Storage and expiry

| Data | Handling |
| --- | --- |
| Provider tokens | Encrypted server-side using the configured AES-GCM key |
| Email bodies and downloaded files | Fetched on demand and processed transiently; whole mailboxes are not indexed |
| Email drafts | Stored by the selected email provider |
| Social OAuth grants | Encrypted, short-lived selection records |
| Social history snapshots | Encrypted; expire after 15 minutes |
| Social drafts | Encrypted; expire after 24 hours |
| Webhook payloads | Signature-verified, encrypted and deduplicated; processed bodies removed; unprocessed content expires after 24 hours |
| Brand rules and enquiry/activity metadata | Stored for workspace operation; enquiry retention is configurable from 1 to 90 days |
| Contact links | Encrypted customer-confirmed identities; no automatic merging by name; LinkedIn API identities excluded |

Read paths enforce relevant expiry. Physical cleanup and reconciliation require hosted maintenance. OAuth activation requires a recent maintenance heartbeat so retention is not presented as operational merely because a preference was saved. Disconnect removes local account content/tokens; customer deletion cascades through the social workspace. Provider-hosted mailboxes and conversations are not deleted by local disconnect.

## Provider and monitoring boundaries

Meta OAuth is hosted and requires explicit verified Page/professional-account selection. Read capabilities are based on current tokens, scopes, Page tasks, endpoint checks and subscription visibility. All available cursors and relevant reply trees are traversed within reported work limits. History/attachment gaps remain explicit.

Signed Meta events enter a durable deduplicated D1 queue before processing. Queue claims, bounded retries and failure records support recovery. Reconciliation compares history digests and creates local notices for meaningful changes and failures. Unchanged access barriers are deduplicated. Notices are visible through the workspace and MCP; no external email/SMS/Slack transport is configured.

The scheduled worker handler and authenticated maintenance endpoint need an independently provisioned hosted trigger. No active social schedule, Meta grant or LinkedIn access is included in the current deployment. LinkedIn data ingestion remains blocked pending programme and data-use review; Page messaging is a separate restricted capability. See [SOCIAL-ACTIVATION.md](SOCIAL-ACTIVATION.md).

## Verification

`npm run typecheck` checks TypeScript; `npm test` builds and runs the rendered-page and unit suites. Tests use synthetic data and mocked provider calls. Passing tests establish the implemented controls under those conditions, not provider approval or live channel coverage. The live acceptance steps in the activation guide require owner-authorised test assets and separate approval before any real send.
