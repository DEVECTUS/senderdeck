# Changelog

## 0.4.22 · 24 October 2026

- Implement read-only ad-creative mapping from an explicitly approved advertising account to verified Facebook stories and Instagram media. Recheck granting identity, live advertising scopes, account access and actual root authorship before exposing content.
- Add owner-bound advertising asset discovery and separately confirmed account selection to the existing asset tools, without requesting scopes or changing campaigns or sending policy.
- Bound creative reads, deduplicate roots and preserve retry positions with scoped cursors. Report owner permission/selection blockers separately from implementation readiness.

## 0.4.21 · 24 October 2026

- Report actual provider post authorship separately from the legacy reply-authority gate. Missing permission verdicts are explicit gaps, and different/unknown Instagram owners never gain reply authority.
- Add separately scoped Facebook Page ads_posts discovery, precise ad-account/permission/webhook diagnostics, and explicit source/size options for continuation.
- Add a public metadata verification command and safe client refresh instructions; expose the live server version in social reads.

## 0.4.20 · 24 October 2026

- Bound social inbox discovery to one root page with comment previews, scoped expiring pagination and observed incoming timestamps. Report incomplete recent-comment and promoted/ad coverage explicitly.
- Separate post captions from incoming activity, retain sender names when provided and associate comments/replies with their parent. Bound comment history reads with resumable segments; partial snapshots cannot authorise sending.
- Avoid duplicating social inbox and thread payloads in MCP text and structured output. Preserve all sending and brand approval controls.

## 0.4.19 · 23 October 2026

- Describe MCP operations and enforced limits factually in tool metadata, keeping model workflow guidance in the bundled skills for Claude directory compatibility. Schemas and server-side approval checks are unchanged.

## 0.4.18 · 23 October 2026

- Bind Google and Microsoft sign-in and mailbox connection callbacks to a per-flow, host-only browser cookie. Consume state atomically and reject connection callbacks after the signed-in owner changes.
- Stop adopting an existing account merely because it has a matching connected mailbox. Owners can explicitly enable sign-in for a selected connection; an identity belonging to another account cannot be transferred.
- Remove a mailbox's sign-in identity in the same transaction as disconnecting it.
- Identify the registered requesting application on MCP consent, with escaped text, and include privacy/support/terms URLs in the Claude manifest.
- Add regression coverage for both providers, cross-browser callbacks, replay, account isolation, owner opt-in, disconnect and consent rendering.

## 0.4.13 · 22 October 2026

- Add an expiring, hosting-controlled operation to retire one duplicate legacy account and move its social connections into an explicitly selected, matching provider-owned brand.
- Revoke retired users' browser and MCP access while preserving other OpenAI sign-ins, retained mailbox credentials and unrelated workspaces.

## 0.4.12 · 22 October 2026

- Identify existing Meta account assignments during discovery. Show the existing brand only when the signed-in user has current membership; otherwise provide sign-in guidance without disclosing private workspace details.
- Replace misleading Connect actions and disconnect/restart advice for accounts assigned elsewhere. Preserve account credentials, conversations and workspace boundaries.


## 0.4.11 · 22 October 2026

- Simplify Meta connection to brand selection, Meta sign-in and account selection, with compact headings and plain account access summaries.
- Remove maintenance-heartbeat gates from OAuth and asset selection; keep user-bound, one-use state, grant expiry, role checks and live asset validation.
- Install and verify the selected Facebook Page event subscription during connection. Preserve saved connections if subscription setup fails and record an operator notice.
- Keep scheduler, subscription repair and detailed capability diagnostics in the protected operator area.
- Refresh the hosted maintenance workflow registration and retain separate evidence for manual and scheduled runs.


## 0.4.10 · 21 October 2026

- Group social accounts visibly beneath customer/organisation and brand, retaining empty and failed brand branches and search ancestors. Keep personal email accounts separate.
- Explain when no brands are available to the current sign-in instead of suggesting an unrelated search problem. Identify the OpenAI versus SenderDeck sign-in source and provide an intentional provider chooser without merging access by email.
- Display the packaged release version in workspace and public headers.
- Make the explicit Page event-install button call the protected operation directly, avoiding an additional browser confirmation dialog that can be suppressed by embedded browsers.

## 0.4.9 · 21 October 2026

- Add CSRF-protected operator Page callback registration with server-side credentials and encrypted verification-token generation that preserves existing values. Read subscriptions back and preserve unrelated fields/callbacks.
- Support owner clipboard handoff for Instagram dashboard verification; Meta explicitly excludes Instagram subscription configuration through Page/app subscription APIs. App and account access tokens are never copied.
- Install Page subscriptions for an explicitly selected, live-verified account with current ownership/tasks, without changing OAuth scopes or sending messages.
- Record signed message/comment delivery and completed polling separately for each account. Report coverage gaps independently of execution readiness.
- Allow scheduled user-authenticated reconciliation to skip disabled or not-yet-due accounts and prevent duplicate per-account work with a lease. Document the cloud writer authentication and live acceptance requirements.

## 0.4.8 · 21 October 2026

- Lead the signed-in workspace with a searchable email and social account overview, compact headings and shared navigation.
- Offer an explicit Update connection action for existing Meta assets after fresh consent, retaining account IDs, conversations and monitoring preferences.
- Report probe stage and safe reason codes for absent roots, missing message samples, invalid identities and provider failures. Empty message history does not prove message-detail access.
- Expose missing Page-task evidence separately from successful history reads. Preserve ownership checks, scope checks and all sending gates.

## 0.4.7 · 21 October 2026

- Verify a bounded sample of actual context, messages/comments and replies before advertising read capability; invalidate older root-only validation. Root listings explicitly do not establish history coverage.
- Return sanitised HTTP status, numeric Graph errors and recognised unsupported requested fields, never raw provider error bodies or credentials.
- Retry Facebook post context without can_comment only when Meta explicitly rejects that optional field. Keep write ownership unverified rather than inferring it from successful reads.
- Preserve Instagram native-Suite history uncertainty in each comment-history result.

## 0.4.6 · 21 October 2026

- Return expired, reused or mismatched OAuth attempts to a clean restart screen without exposing provider codes or weakening state validation.
- Refresh connection readiness automatically, reject future heartbeat timestamps, and distinguish recent manual maintenance from actual recurring execution. Add CSRF-protected operator maintenance on the hosted server with a shared run lease.
- Recover Page discovery only from Meta-verified granular Page targets, checking direct object identity and credential ownership. Preserve explicit asset selection and unknown-task restrictions.
- Show empty asset results, granted scopes, granular target IDs and bounded discovery findings to the authorised customer. No broader permission is granted automatically.

## 0.4.5 · 21 October 2026

- Run hosted social maintenance through a secret-authenticated GitHub Actions schedule, independent of a local computer; retain the recent-run activation gate.
- Fix Meta requests failing before network dispatch because Cloudflare does not accept the error redirect mode. Use manual redirects and explicitly reject redirect responses.
- Verify app secrets through a POST client-credentials exchange before reading app identity; public app metadata alone is insufficient proof.

## 0.4.4 · 21 October 2026

- Add masked write-only Meta secret entry for verified, hosting-allowlisted platform operators with session-bound CSRF, same-origin HTTPS JSON and bounded key/value validation.
- Encrypt the two supported secrets server-side, record metadata-only audit events, and apply the same configuration to social OAuth, MCP, webhooks and maintenance. Native hosting secrets take precedence; customer roles cannot alter platform credentials.
- Preserve email credentials, mailbox data and all sending gates.

## 0.4.3 · 21 October 2026

- Add a customer Meta connection wizard for choosing a private brand, continuing to native consent, selecting each authorised asset and checking actual capabilities.
- Return OAuth callbacks to the wizard without changing the registered callback route or its user/brand/state checks.
- Add a separately protected platform setup view with redacted native-secret status, exact callback/webhook routes, app credential checks and distinct review, delivery and scheduler evidence.
- Require a hosting-controlled operator allowlist; customer ownership cannot grant platform access. There is no tenant-facing global credential-write endpoint.

## 0.4.2 · 21 October 2026

- Remove customer-specific presets, public account IDs and brand examples from shared onboarding, policy defaults, skills and provider documentation.
- New brands start without verified facts, URLs, approved replies, account associations or an assumed identity. Language, punctuation and other brand rules are configured explicitly in the owning workspace.
- Reject retired preset requests with an explicit migration message rather than silently creating a brand without its former restrictions.
- Preserve existing saved workspace policies; no database migration or provider permission change is required.

## 0.4.1 · 21 October 2026

- Refresh the website, search/social metadata, plugin listings and repository overview for email and brand conversations.
- Distinguish available workspace/email features from provider capabilities awaiting activation; correct the homepage's old token-only retention claim.
- Add architecture, contribution, community and security-reporting guidance, plus issue and pull request templates.
- Align packaged listing descriptions and maintain the existing provider gates and send approval controls.
- Validate with 121 unit tests, 14 built-page tests, type checking, package metadata checks and an isolated browser review of the refreshed homepage.

This is a documentation, presentation and metadata patch. It does not activate social access or change provider permissions.

## 0.4.0 · 21 October 2026

- Add customer memberships, brand policies, explicit account associations, enquiry status/ownership and minimal activity records.
- Implement gated Meta OAuth, asset selection and validation, paginated message/comment adapters, expiring encrypted snapshots and drafts, exact revision approval and duplicate-send controls.
- Add signed webhook processing, deduplication, bounded retries, maintenance/reconciliation handlers and monitoring preferences. Hosted scheduling remains an activation requirement.
- Add 24 social/workspace MCP tools and a social-conversations skill. LinkedIn, Instagram mentions and social attachment sends remain unavailable pending approval/validation.
- Validate with 121 unit tests and 14 built-page tests, type checking, production build and isolated browser checks. No live social replies were sent.

## 0.3.7 · 21 October 2026

- Resolve Gmail downloads through account/message-scoped MIME part references when provider attachment tokens change between reads.
- Derive attachment presence from full transient MIME structure, correcting search metadata false negatives.
- Avoid duplicating base64 downloads across MCP response fields to keep large connector responses usable.
- Verify the original reported DOCX downloads through both connector paths and retain attachment type, size and scoping controls.

Earlier releases and their historical scope are available in [GitHub releases](https://github.com/DEVECTUS/senderdeck/releases) and the repository history.
