# Hosted monitoring setup and verification

## Owner actions

1. A verified hosting-allowlisted operator opens `/operator/social` and selects **Register Page callback**. The server reuses the existing app credentials, generates an encrypted verification token only when missing, and verifies Meta's registration and readback. A different existing callback is preserved and reported for review.
2. In `/connect/meta`, connecting a selected Facebook Page automatically installs its event subscription using the existing grant. An operator who is also an administrator of that brand can retry through **Account diagnostics → Repair Page event subscription** in `/operator/social`. This adds `messages` and `feed`, preserves other existing fields, and reads the subscription back. It sends no messages and requests no additional OAuth permissions.
3. Instagram app webhook registration must be completed in Meta's dashboard. Meta's v26 Application Subscriptions and Page Subscribed Apps references explicitly exclude Instagram configuration through those APIs. The operator can select **Copy verification token**, then the owner pastes it into Meta with the canonical callback and selects `messages` and `comments`. The page never renders or logs the value; the operator clipboard receives only the verification token. The app secret and account access tokens remain server-side.
4. Produce a fresh incoming test message and comment for each selected account using authorised test identities. Check each account's signed message and comment delivery timestamps. A dashboard test, subscription setting, successful callback challenge or one account's event does not prove delivery for the other account.

## Connection and maintenance

Meta sign-in and asset selection do not depend on a maintenance heartbeat. Their database queries enforce expiry and current membership independently. Scheduled processing, cleanup and monitoring still require a real background runner. Customer connection screens show account access in plain language; `/operator/social` retains scheduler evidence and account diagnostics. A manual recovery run must never be described as recurring execution.

### Maintenance runner recovery

The GitHub runner makes at most three attempts for network failures, request timeouts and HTTP 502/503/504 responses, waiting five then ten seconds. Each attempt has a 60-second deadline including the completion body; the job allows five minutes including checkout. It keeps the same fixed HTTPS endpoint, bearer authentication and scheduled/manual source on every attempt and never follows redirects or logs response bodies.

Authentication failures, overlapping-run responses (409), other HTTP errors and invalid completion data still fail the job immediately. Only a validated completion counts as success. The server lease prevents overlapping maintenance; a retry that encounters an active lease fails visibly rather than claiming completion. Persistent gateway/network failures still fail after three attempts. Inspect the failed Actions step and hosting health, restore service or configuration, then rerun the failed job. Confirm the completion result and operator heartbeat; a manual dispatch does not prove recurring execution. Retries cannot repair an ongoing hosting outage or GitHub scheduling delays.

### Account validation and connection status

Successful live read checks remain current for one hour. At exactly 60 minutes, the account can remain connected while its read capabilities require validation again. Connections and the brand account table show **Needs validation**, with the last check time in the status tooltip. This warning does not mean another brand replaced its credentials or that Meta revoked access. Use **Recheck access**, then the exact account's **Manage → Recheck access** control. Owners/admins may validate only accounts in brands they administer; failed requests remain visible for diagnosis.

**Reconnect** identifies revoked or expired authorisation; **Validation failed**, **Limited access** and **Access unavailable** identify different validation or capability results. A missing permission or failed history probe requires reviewing the exact account's diagnostics. Do not reconnect merely to clear an old check. Webhook delivery, provider permissions, sending enablement and exact reply approval remain separate checks; a current read check does not prove any of those.

Refreshing Connections reloads saved results; it does not validate every account. Hosted maintenance revalidates only monitoring-enabled, due accounts when scheduling is enabled. Disabled monitoring does not refresh validation automatically. Keep current checks and observed webhook delivery separate from background scheduling health.

## Cloud task writer contract

The existing OAuth-authenticated `social_reconcile` MCP tool is the supported scoped writer. Do not use the public callback, Sites service-bypass token, operator cookies or global maintenance secret as a substitute for the brand owner's authenticated connector.

The setup chat owns schedule creation. Create only one schedule after confirming no existing equivalent task. Use the requested ten-minute cadence and Australia/Sydney timezone. Keep the private brand and account IDs in the private task prompt, never in public source. The future cloud task must have its own working SenderDeck connection for the authorised owner. A local installed plugin or a successful call from the setup chat does not prove a fresh cloud task has that connection.

Each run must:

1. Call `social_account_list` for the exact authorised brand. Verify the configured account IDs and providers remain present. Stop and report a connection or membership mismatch; never recreate a brand, substitute another account or start consent automatically.
2. Call `social_reconcile` for each explicitly selected account with `monitoringOnly=true`. The server independently checks current membership and administrator role, current account permissions/tasks, monitoring preference and due time. Disabled or not-yet-due accounts are skipped. A per-account lease prevents concurrent checks.
3. Read the returned errors, coverage and monitoring evidence. Keep provider history and ownership gaps visible. Never describe an empty response or an exhausted cursor as proof that the native inbox is clear.
4. Use `social_activity_list` for the same brand when needed. Notify only about new enquiries, changed failures, or required owner action. Deduplication is maintained in the hosted database. Do not create drafts, approve replies or send anything.

Exercise a fresh cloud run and read back the per-account `monitoringReadiness.lastPollAt` through `social_account_list`. Verify later scheduled run history in the native scheduler. A saved schedule is not a completed run. GitHub manual runs do not establish its cron execution. The API's recurring-execution flag currently recognises actual GitHub scheduled/native cron runs; cloud-task execution must also be verified in the native task history and is not relabelled as native Worker cron.

No duplicate cloud schedule is created by the implementation chat. There is no local polling fallback. Actual cloud writer authentication, signed delivery and observed cadence remain acceptance requirements.

## Technical data inventory for review

These are implementation facts, not business-policy attestations, certifications, contractual commitments or a claim of Meta approval.

| Data | Storage and retention behaviour |
| --- | --- |
| Email bodies and attachments | Fetched from the selected provider on demand; not retained as a SenderDeck mailbox mirror. Provider-hosted drafts and mail remain with the provider. |
| OAuth credentials and platform secrets | Encrypted server-side with the hosting encryption key in D1, or held as native hosting secrets. Customer APIs exclude tokens. Credentials remain until disconnect, deletion, expiry/revocation handling or authorised replacement. |
| Social history snapshots | Encrypted, scoped to the reader/thread, logically expire after 15 minutes; maintenance deletes expired rows. |
| Social drafts | Encrypted, expire after 24 hours; maintenance deletes expired non-sending rows. Approval is bound to an exact revision and expires after five minutes. Stalled sending attempts become delivery-unknown for native review. |
| Webhook payloads | Accepted only with a valid Meta app-secret signature and an exact mapped account. Encrypted while queued; cleared after processing. Expired payloads are cleared by maintenance after their 24-hour processing expiry. Empty deduplication metadata can remain for 30 additional days. |
| Enquiries, notices, activity and identity links | Brand retention defaults to 30 days and is configurable from 1 to 90 days. Maintenance removes old records using the configured retention. Names are not used for automatic cross-channel identity merging. |
| Monitoring evidence | Account IDs, signed-delivery timestamps, last completed poll and safe coverage reason codes. No message body or access token is stored in this table. Removed when the account/customer is deleted. |
| Account/customer deletion | Removes local social accounts and cascading local records and credentials. Provider mailboxes are preserved. Meta deauthorisation/deletion callbacks require verified signed requests. Provider-side access can also be revoked in Meta. |

Expiry checks and physical deletion are separate. Physical cleanup depends on successful hosted maintenance; do not attest to an unconditional deletion deadline while scheduling is unverified. This repository does not establish backup retention, data residency, incident response practices, access-request procedures, contracts or every processor's onward recipients. The authorised business owner must verify those facts before answering review forms.

The deployed application uses OpenAI Sites hosting, Cloudflare Workers and D1, and the selected Google/Microsoft/Meta provider APIs. Optional GitHub Actions maintenance is configured but its schedule must be verified independently. AI-client and connected-platform processing depends on the owner's chosen integration and applicable agreements; inspect those agreements before making legal claims.

## Official Meta references

- [Application Subscriptions, v26](https://developers.facebook.com/docs/graph-api/reference/v26.0/app/subscriptions)
- [Page Subscribed Apps](https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps)

Both references were checked on 21 October 2026. The Page and application endpoints do not configure Instagram subscriptions; use the owner dashboard flow described above.

## Organic content is a separate workflow

Maintenance and inbox reconciliation do not publish daily content. See [Social publishing](SOCIAL-PUBLISHING.md) for the separately scoped standing policy, exact provider gates, actual daily task invocation and destination receipts. The new media expiry cleanup uses this existing maintenance runner and does not install another scheduler.
