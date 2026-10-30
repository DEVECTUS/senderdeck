# SenderDeck 0.4.37 publishing release

## Request and release boundary

The owner directed Car Turntable to use SenderDeck and develop its missing five-destination publishing functionality, then get publishing working and publish the approved current daily topic. Originating chat: Plan daily social media posts, 01a17a65-72c6-7c83-b162-c81d8b1c3bd4, direct human request on 30 October 2026. Deployment enquiries route to senderdeck - Publisher under the direct owner instruction in Publisher turn 01a17f8b-243d-7870-b33a-a74b193f68a4. This artifact contains implementation and synthetic verification, not live publication evidence or consent.

The five intended destination kinds are instagram_feed, facebook_feed, linkedin_feed, instagram_story and facebook_story. Exact approved Car Turntable asset/account bindings and prepared artwork remain in the originating business project, outside the public repository. No other brand inherits that approval. No paid promotion, test post, backfill, scope expansion or customer reply approval bypass is performed by this release.

## Integration and verification

Base main f22660e4232317c72ad6e6bf9115763c95dc5395 includes production 336b6bf759fc6082902e9702390cc38c00325861 as an ancestor and preserves the consolidated branch history requested by the owner. The pre-existing difference from production includes bounded maintenance retry/recovery, WhatsApp setup explanation and navigation, governance/preflight documents and associated tests. These changes do not alter WhatsApp sending gates or renew the expired allowance. Review this inherited integration diff as well as the publishing change before deployment; do not silently drop it or overwrite newer production work.

Final verification on 30 October 2026: TypeScript passes; production build passes; 315 unit tests pass, including23 focused publishing tests;26 rendered tests pass, including the65-tool MCP contract and Publishing page. New publishing source/UI/tests lint passes. Repository lint retains the exact baseline14 errors/10 warnings in existing files; it is not reported as globally clean. Drizzle generation reports no schema differences. All provider calls in publishing tests are intercepted with synthetic responses. No actual provider consent or post was performed.

Coverage includes all five independent delivery receipts, exact asset/brand/actor bindings, preserved reply gates, scoped Meta/LinkedIn connection flows, one Sydney topic/date and09:00 boundary/DST, no backfill, cancellation during preparation, independent failures, concurrent delivery/revision claims, partial completion with immutable published receipts, bounded native scans, explicit LinkedIn planner limitations, uncertain response locks, known-ID read-only reconciliation, positive native-history import, Story expiry honesty, encrypted immutable chunk uploads, expiring signed image fetch and receipt survival after account disconnection.

## Deployment requirements

Apply additive0012_social_publishing.sql before running the new source. It creates six publishing tables and does not change existing account or reply policy data. Official Sites packaging includes the complete migration set. No production migration has been applied from DEV.

SOCIAL_PUBLISH_ENABLED defaults false. Enabling this independent runtime gate is not consent, a standing policy, or a scheduler. Existing reply/send flags, current environment revision29, expired WhatsApp scope and public audience must be preserved. No new production policy, account, provider grant or automation is installed by migration.

Meta publishing owner setup: Publishing → exact brand → exact existing destination → Owner publishing connection. Explicit owner consent uses the optional META_PUBLISH_LOGIN_CONFIG_ID or existing META_LOGIN_CONFIG_ID, with user-token Login for Business configuration permitting the displayed publishing scopes and preserving current permissions. Register the exact public-origin /oauth/social/publishing/meta/callback. Inspect returned access, then explicitly save only that account. The owner must review the actual provider consent screen; deployment does not modify its configuration or scopes.

LinkedIn requires an actually approved Community Management app, configured CLIENT_ID/CLIENT_SECRET and LINKEDIN_COMMUNITY_APPROVED=true; optional API_VERSION defaults202608. These names are prefixed LINKEDIN_. Callback is /oauth/social/linkedin/callback. Company selection requires the live approved organization role and r_organization_admin, r_organization_social and w_organization_social. LinkedIn messaging remains unsupported. Existing live capability diagnostics report missing Meta publishing scopes and LinkedIn not configured; no hosting-secret inspection was needed or performed. Exact runtime readiness must be checked after deployment.

## Limits and recovery

See [SOCIAL-PUBLISHING.md](../docs/SOCIAL-PUBLISHING.md) for full tool sequence, provider prerequisites, media/alt-text limits, native planner clearance and retention. Exact schemas are in social-publishing-tools-0.4.37.json. There are25 new tools. Public server discovery plus an updated client schema must be verified after deployment; stale client discovery is separate from actual missing grants.

No post may be reported published from preparation, consent, a Publish click, or successful deployment. The originating content chat must reconcile previous history and current native scheduled/published state, upload the actual approved assets, establish only the already authorized policy, and use independent actual receipts. Yesterday's content is never reposted; today's outstanding topic is not backfilled after its Sydney date.

Rollback: disable organic publishing first; preserve the new ledger, pause daily publication callers and redeploy saved v0.4.36 if necessary. Do not drop the new tables or retry unknown outcomes outside this ledger. Existing reply and WhatsApp flags remain unchanged. Expired media/checks use existing maintenance; unresolved publication records stay for explicit reconciliation.

The final commit, archive SHA256 and file provenance are supplied in the separate final handoff after commit, avoiding a self-referencing commit hash in this document. Publisher owns official hosting source synchronization, save, migration and deployment. DEV does not perform those hosting actions.
