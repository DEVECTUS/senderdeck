# Changelog

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
