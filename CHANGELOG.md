# Changelog

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
