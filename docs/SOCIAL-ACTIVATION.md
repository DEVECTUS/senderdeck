# Social activation and validation

Version 0.4.0 is a gated foundation. It is not evidence of a successful live social connection. The production deployment has no Meta/LinkedIn credentials, provider grants, subscriptions or active social scheduler at publication. No provider permissions are changed by deployment. Gmail/Microsoft and their exact send confirmation remain unchanged.

## Shipped and testable without provider grants

- Customer memberships (`owner`, `admin`, `editor`, `reviewer`, `viewer`), brands, optimistic policy revisions, per-request authorisation, deletion and minimal audit records.
- Brand language/tone/punctuation, source-labelled verified facts, exact approved wording, identity answer and escalation terms. Car Turntable is a preset; no business claims or assumed personal identity are seeded.
- Existing email-account association without sharing mailbox credentials. Confirmed cross-channel identity links never use names as proof; LinkedIn API identities are rejected.
- Meta OAuth state bound to current user/brand, single use and ten-minute expiry. Encrypted temporary grants, explicit selection, rediscovery and live task/permission validation. Asset assignment is unique across brands/customers.
- Paginated conversations and comment trees, bounded-work gaps, current recipient verification, source URLs where returned by provider, expiring encrypted snapshots and local immutable drafts.
- Exact inspection, five-minute approval token, current customer role/policy/history recheck, atomic send claim, closed-window rejection, uncertain-delivery state with no automatic resend. First rollout permits only exact brand-approved wording and no social attachments.
- Raw-body HMAC webhook verification, durable event deduplication, leased processing retries, silent echo/receipt/like handling, escalation notices, reconciliation with change digests and visible coverage limits.
- Hosted scheduled handler and secret-authenticated maintenance endpoint; ten-minute account preferences. Local/MCP notices only. Saving a preference does not activate a schedule.

## Meta operator prerequisites

Use a DEVECTUS-owned platform app and a verified DEVECTUS business portfolio. Do not reuse the customer's Car Turntable Ads API app automatically. For Business Integration System User configuration, the platform and customer portfolios must be distinct. The implementation currently discovers assets with `/me/accounts`; validate the chosen login/token configuration against this path before enabling customer onboarding. Unsupported token configurations remain blocked.

Set hosting secrets `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID`, `META_WEBHOOK_VERIFY_TOKEN` and `SOCIAL_PUBLIC_ORIGIN=https://senderdeck.devectus.com.au`. `META_ACCESS_TIER=advanced` is an operator assertion after App Review, not a permission grant. Token introspection, granted scopes, selected assets, Page tasks and live reads are checked separately.

Register these URLs:

| Purpose | URL |
| --- | --- |
| OAuth | `https://senderdeck.devectus.com.au/oauth/social/meta/callback` |
| Webhook | `https://senderdeck.devectus.com.au/api/social/webhooks/meta` |
| Deauthorisation | `https://senderdeck.devectus.com.au/api/social/meta/deauthorize` |
| Data deletion | `https://senderdeck.devectus.com.au/api/social/meta/delete` |
| Privacy | `https://senderdeck.devectus.com.au/privacy` |

Request the permissions for enabled features only: `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_metadata`, `pages_messaging`, `pages_manage_engagement`, `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`. The existing pilot's seven scopes omit `pages_manage_metadata` and `pages_manage_engagement`. External Facebook Login for Business also requires appropriate Advanced Access for `public_profile`. Business-manager-granted assets can have additional endpoint-specific requirements; do not request advertising permissions blindly.

Use Graph v26.0. Page tokens serve Facebook and linked-Page Instagram messages/comments; the granting User token is retained separately encrypted for Instagram media discovery. Subscribe the selected Page (not the Instagram ID) to the appropriate app fields. `social_account_validate` reads the installed subscription. Subscription installation and provider permission changes are owner-controlled and are not performed by this release. Application-level business integration event shapes require live validation; deauthorisation callbacks and regular token/asset revalidation are implemented.

Meta API limits are returned as gaps: only 20 recent message details; Instagram Requests inactive for 30 days can be absent; Instagram media excludes Stories and caps at 10,000 items. Unsupported attachments require native review. Mention notifications can create a manual-review notice, but mention ingestion/replies remain unavailable until the token type and endpoints are validated. Default private replies use 24 hours after a verified inbound message. No Human Agent exception, ad-origin extension or retired message tag is assumed.

## Hosted execution

Provision a recurring hosted trigger, independent of a user's computer. The worker exports `scheduled`; where the host does not provision worker cron triggers, invoke `POST /api/social/maintenance` from a trusted scheduler with a strong `SOCIAL_MAINTENANCE_TOKEN` in its secret store. Never put that token in an automation prompt, source, URL or logs. Set `SOCIAL_SCHEDULER_ENABLED=true` only after the scheduler exists. A successful run persists a heartbeat; OAuth activation requires a heartbeat less than 20 minutes old.

The existing Sites deployment does not automatically provision cron from this code. A configured schedule and observed execution remain an activation blocker. Do not claim background monitoring is active from a saved preference. Keep the existing browser monitor until signed webhook delivery and reconciliation prove actual account coverage. The workspace intentionally reports inactive until deployment-specific operational validation is completed.

Run maintenance at least every ten minutes, even when account monitoring is off, for expiry cleanup. Reconciliation has work limits (50 roots per channel, bounded page trees) that must remain visible on high-volume accounts; it is not a promise to cover arbitrary volume. Notification records represent new messages/comments, escalations, failures and changed coverage. Repeated unchanged barriers are deduplicated. No external notification transport is configured.

## Enable approved sending only after live acceptance

With owner-authorised test assets, verify OAuth, asset routing, permissions, renewal/revocation, every relevant page/reply edge, webhook signature/replay handling, deletion and scheduled runs. Test one approved reply for each enabled channel, native delivery confirmation, duplicate-request rejection and window expiry. Never perform this acceptance test on a real customer's conversation without their explicit final send approval.

Only after those checks may the operator enable `SOCIAL_SEND_ENABLED=true`; each brand must separately enable `sendEnabled`. Drafts must use owner-approved exact wording. Keyword escalation checks are conservative backstops, not semantic safety guarantees. Do not weaken policy to pass a draft. If delivery is unknown, inspect the native provider rather than retry.

## LinkedIn

No LinkedIn API content is ingested in this release. Community Management Development and Standard require approval. Standard is needed for production webhooks and capacity; development quotas do not support a blanket ten-minute polling promise. Page Messaging is separately restricted to partner access.

Review the assistant/MCP use case before activation: member activity generally has a 48-hour retention limit, profile data 24 hours, and restrictions on export and combining data into contact profiles. The generic social/contact model is not an authorisation to process LinkedIn member data. Implement the approved scope only after the programme and data-use review. No scraping, private endpoints or inbox-checked claim is permitted.

## Evidence

- [Meta business login](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business)
- [Meta conversation API](https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversations)
- [Meta Send API](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages)
- [Instagram comment moderation](https://developers.facebook.com/documentation/instagram-platform/comment-moderation)
- [LinkedIn Community Management](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-api-migration-guide)
- [LinkedIn restricted uses](https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases)
- [LinkedIn data storage](https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements)

Checked against official documentation on 21 October 2026. Provider access decisions remain external owner actions.
