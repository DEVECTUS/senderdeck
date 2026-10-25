# WhatsApp Business

SenderDeck supports existing WhatsApp Business Platform Cloud API numbers through the social draft and approval workflow. Provider-mocked tests do not establish live access, provider approval, deployment or delivery.

## Platform configuration

1. Apply `drizzle/0010_hesitant_hydra.sql` before deploying this code.
2. Use the platform `META_APP_ID` and `META_APP_SECRET`. Set `WHATSAPP_LOGIN_CONFIG_ID` to a Facebook Login for Business configuration granting `whatsapp_business_management` and `whatsapp_business_messaging`. Register `${SOCIAL_PUBLIC_ORIGIN}/oauth/social/whatsapp/callback` as a redirect URI.
3. Complete Meta's business verification and access requirements for external customers. `META_ACCESS_TIER=advanced` is a local gate, not proof of approval.
4. Configure the app's `whatsapp_business_account` subscription, field `messages`, to `/api/social/webhooks/meta`, with `META_WEBHOOK_VERIFY_TOKEN`. Subscribe each WABA to the app through Meta's `/{WABA_ID}/subscribed_apps` API with an authorised management grant. This release verifies the WABA subscription but does not install it. App and account subscriptions are both required; actual delivery must be tested separately.
5. Keep hosted maintenance running for encrypted message expiry and brand retention cleanup. Disconnect and brand/customer deletion cascade to retained messages. Meta deauthorisation/deletion also includes WhatsApp accounts.

Customers open Conversations > Connections > WhatsApp Business, choose a brand, authorise Meta, enter the WhatsApp Business Account ID and select a verified number. Connections cannot move another brand's number. Tokens never enter browser forms or MCP arguments/results.

This connects already provisioned Cloud API numbers. Phone registration, migration, Embedded Signup and Business App coexistence provisioning are outside this release.

## Review and delivery

Signed inbound messages create customer threads and encrypted, expiring message records. WABA and phone ID must both match. Duplicate events are deduplicated. Incoming media/unsupported types display a native-review marker and block sending.

`social_inbox` returns up to 200 retained customer threads. `social_thread_read` returns up to 200 retained messages with `coverage.complete=false` and the explicit gap `whatsapp_history_limited_to_retained_signed_webhooks`. Pre-connection, missed and expired messages cannot be fetched. Reconciliation reports that limitation; there is no provider history polling or backfill. Delivery/read-status events are not surfaced.

`social_draft_create` requires `acknowledgeHistoryGap=true` for a sendable WhatsApp reply. The Conversations checkbox offers the same acknowledgement. It is bound to the immutable draft revision and displayed during inspection. It only accepts this specific webhook-history limitation: truncation, empty history, attachments, escalation and unapproved wording remain blocked. Full-history coverage remains false in read results.

Inspect with `social_draft_inspect`, then obtain separate explicit human approval of the exact revision before `social_reply_send`. Existing reviewer membership, brand rules/revision, expiring approval token, unchanged history digest, platform/brand send switches and single-use send claim apply. Sending revalidates the token's app, granting identity, permissions, phone membership and WABA subscription. The inbound timestamp must be within 24 hours, checked again immediately before calling Meta.

Outbound text is stored encrypted and changes later history digests. Ambiguous delivery becomes `delivery_unknown` and cannot be retried automatically. Provider acceptance does not establish delivery or read status.

Templates, business-initiated outreach outside the response window, media sending/download, calls, groups and personal WhatsApp inboxes are unavailable. WhatsApp's [Business Messaging Policy](https://whatsappbusiness.com/policy/) requires approved templates outside the 24-hour window; this implementation blocks that case.

## Live acceptance

Use a test business number and consenting recipient. Verify OAuth, account/tenant isolation, actual signed inbound delivery, encrypted retention, visible history limitations and acknowledgement, exact approval and one reply. Confirm receipt separately. Verify blocked sends for changed history, expired windows, media, disabled switches and revoked grants/subscriptions. Test ambiguous delivery, retention cleanup and disconnect deletion before customer activation.
