# Coexistence webhook preparation — 26 October 2026

**Later update:** after specific owner approval, all five fields were verified subscribed on the unchanged SenderDeck callback and all four new fields passed Meta's synthetic callback tests. See [the configuration receipt](../publishing/WHATSAPP-META-CONFIGURED-2026-10-26.md). Real asset delivery and onboarding remain unverified; the plan below records the original preparation boundary.

This is a plan and test receipt, not authorisation to subscribe assets, change permissions or send messages.

## Configuration to approve

App `2213673322866707`, object `whatsapp_business_account`, callback `https://senderdeck.devectus.com.au/api/social/webhooks/meta`. Preserve the existing callback and verification token; never display the token or put it in chat/source/command arguments. Prior setup confirmed `messages` subscribed. The other fields have not been configured in this pass.

| Field | Purpose | SenderDeck treatment |
| --- | --- | --- |
| messages | Fresh customer messages and supported event metadata | Exact WABA + phone mapping; encrypted retention; fresh inbound text alone may establish response window. |
| account_update | Onboarding/lifecycle changes | Supported disconnect events revoke local connection/approvals; unknown events do not create access. |
| history | User-permitted initial Business app history | Encrypted chunks of up to 50 messages; retention filter; declined sharing respected; never opens response window. |
| smb_app_state_sync | Initial contacts synchronization | Acknowledge count/receipt only; no address-book names or contact import. |
| smb_message_echoes | Outgoing messages sent from the Business phone app | Outgoing conversation context changes the approval digest; never opens response window. |

Two levels are required: app callback field subscriptions and an authorised per-Messaging-account/WABA subscription. App subscription alone does not prove a customer's connection or actual delivery. The server checks active app subscription, exact callback and all five fields before starting/completing Coexistence. Account subscription must be read back for the exact account.

## Request and queue contract

- GET challenge requires the existing secret verification token; response is text, no-store. Do not test the positive challenge by exposing the real token in a URL/history/log.
- POST requires HMAC-SHA256 of the exact raw body with Meta app secret in `X-Hub-Signature-256`. Invalid signatures are rejected before processing. Maximum accepted body is 8 MiB.
- Route only mapped WABA + phone IDs; Coexistence-only payloads require enrolment. Lifecycle events have generation/time protection against stale disconnect replay after reconnect.
- Persist signed work as encrypted durable chunks before acknowledgement. Processing is idempotent; completed raw payloads are cleared. Queue failure is visible and blocks safe sending where context may be missing.
- The subsequent one-time `/{PHONE_ID}/smb_app_data` contacts/history requests are separate side effects after owner-authorised onboarding, within 24 hours. Request IDs mean accepted, not complete. Uncertain responses must not be retried; only never-requested steps may resume.
- No register, deregister, migration, credentials or sending operation is part of callback verification.

## Safe checks completed

On 26 October 2026, unauthenticated requests to the actual production callback returned:

| Check | Result | Meaning |
| --- | --- | --- |
| GET subscribe challenge without verification token | HTTP 403, Webhook verification failed | Verification secret is required. |
| POST empty-entry WhatsApp envelope with intentionally invalid signature | HTTP 403, Webhook signature failed | Forged delivery rejected; no mapped event or outbound message. |

These are negative boundary checks only. They do not establish positive delivery, provider eligibility or valid payload handling in production.

Local provider-mocked integration tests additionally verify exact-number/tenant isolation, one-use login state, rejection of absent fields/inactive or foreign callbacks, tampered Coexistence history/contact/echo/offboarding signatures, encrypted large history batches, no contact-name retention, declined history, stale approval invalidation, closed response windows, native edits, unsupported identities, offboarding and no register/deregister fallback. Test fixtures use synthetic credentials and intercepted Graph calls; they are not live Meta test calls.

Result: typecheck passed, social tests **123/123**, full unit suite **251/251**, and `git diff --check` passed. The two added tests are local and undeployed; runtime product code is unchanged.

## Future positive acceptance (requires specific approvals)

1. Approve the four additional field subscriptions, preserving callback/token and existing fields. Read back active status and all five names.
2. Use Meta's synthetic test facility for each configured field. Check HTTP success separately from mapped-event processing; synthetic example IDs will normally be ignored as unmapped. Do not connect production assets just to make a synthetic payload appear in an inbox.
3. With a separately authorised test business and Coexistence flow, verify exact finish event, correct token/phone membership and simultaneous phone/API use. Subscribe that exact Messaging account and verify readback.
4. Confirm contacts receipt without storing contact names. Test consented history completion and declined sharing on suitable disposable test setups; do not repeat an uncertain one-time sync or offboard the real phone to reset a test.
5. Confirm a real signed phone-app outgoing echo appears as outgoing context and invalidates a previously inspected draft. Confirm native edits/unsupported content require review. No outbound API send is needed for this echo test.
6. Test exact approved text sending and actual recipient receipt only after explicit approval. Verify a fresh inbound customer message controls the 24-hour window, not history import or phone echo.
7. Verify retention cleanup/maintenance and test-asset disconnect on a disposable setup. Do not disconnect the real target number to exercise revocation.

Current scope: the app field subscriptions, synthetic callback tests and dedicated Cloud API test account subscription are verified in the linked configuration receipt. Real Business app Coexistence delivery, number-level eligibility, full Coexistence onboarding and native delivery remain unverified. Preserve `+61 485 040 099` in the WhatsApp Business app throughout.

See [App Review preparation](../publishing/WHATSAPP-APP-REVIEW-2026-10-26.md) for evidence, permission descriptions, owner declarations and approval wording.
