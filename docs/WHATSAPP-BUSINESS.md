# WhatsApp Business

SenderDeck supports existing WhatsApp Business Platform Cloud API numbers and gated Business app Coexistence onboarding through the social draft and approval workflow. Provider-mocked tests do not establish live access, provider approval, deployment or delivery.

## Platform configuration

1. Apply `drizzle/0010_hesitant_hydra.sql` before deploying this code.
2. Use the platform `META_APP_ID` and `META_APP_SECRET`. Set `WHATSAPP_LOGIN_CONFIG_ID` to a Facebook Login for Business configuration granting `whatsapp_business_management` and `whatsapp_business_messaging`. Register `${SOCIAL_PUBLIC_ORIGIN}/oauth/social/whatsapp/callback` as a redirect URI.
3. Complete Meta's business verification and access requirements for external customers. `META_ACCESS_TIER=advanced` is a local gate, not proof of approval.
4. Configure the app's `whatsapp_business_account` subscription, field `messages`, to `/api/social/webhooks/meta`, with `META_WEBHOOK_VERIFY_TOKEN`. Subscribe each WABA to the app through Meta's `/{WABA_ID}/subscribed_apps` API with an authorised management grant. This release verifies the WABA subscription but does not install it. App and account subscriptions are both required; actual delivery must be tested separately.
5. Keep hosted maintenance running for encrypted message expiry and brand retention cleanup. Disconnect and brand/customer deletion cascade to retained messages. Meta deauthorisation/deletion also includes WhatsApp accounts.

Customers open Conversations > Connections > WhatsApp Business, choose a brand, authorise Meta, enter the WhatsApp Business Account ID and select a verified number. Connections cannot move another brand's number. Tokens never enter browser forms or MCP arguments/results.

This connects already provisioned Cloud API numbers. Phone registration, deregistration and migration are never performed. Business app Coexistence uses the separate flow described below.

## Review and delivery

Signed inbound messages create customer threads and encrypted, expiring message records. WABA and phone ID must both match. Duplicate events are deduplicated. Incoming media/unsupported types display a native-review marker and block sending.

`social_inbox` returns up to 200 retained customer threads. `social_thread_read` returns up to 200 retained messages with `coverage.complete=false` and the explicit gap `whatsapp_history_limited_to_retained_signed_webhooks`. Pre-connection, missed and expired messages cannot be fetched. Reconciliation reports that limitation; there is no provider history polling or backfill. Delivery/read-status events are not surfaced.

`social_draft_create` requires `acknowledgeHistoryGap=true` for a sendable WhatsApp reply. The Conversations checkbox offers the same acknowledgement. It is bound to the immutable draft revision and displayed during inspection. It only accepts this specific webhook-history limitation: truncation, empty history, attachments, escalation and unapproved wording remain blocked. Full-history coverage remains false in read results.

Inspect with `social_draft_inspect`, then obtain separate explicit human approval of the exact revision before `social_reply_send`. Existing reviewer membership, brand rules/revision, expiring approval token, unchanged history digest, platform/brand send switches and single-use send claim apply. Sending revalidates the token's app, granting identity, permissions, phone membership and WABA subscription. The inbound timestamp must be within 24 hours, checked again immediately before calling Meta.

Outbound text is stored encrypted and changes later history digests. Ambiguous delivery becomes `delivery_unknown` and cannot be retried automatically. Provider acceptance does not establish delivery or read status.

Templates, business-initiated outreach outside the response window, media sending/download, calls, groups and personal WhatsApp inboxes are unavailable. WhatsApp's [Business Messaging Policy](https://whatsappbusiness.com/policy/) requires approved templates outside the 24-hour window; this implementation blocks that case.

## Live acceptance

Use a test business number and consenting recipient. Verify OAuth, account/tenant isolation, actual signed inbound delivery, encrypted retention, visible history limitations and acknowledgement, exact approval and one reply. Confirm receipt separately. Verify blocked sends for changed history, expired windows, media, disabled switches and revoked grants/subscriptions. Test ambiguous delivery, retention cleanup and disconnect deletion before customer activation.

## Business app Coexistence

The connection wizard offers a separate **Keep the existing WhatsApp Business phone app** option. This uses Meta Embedded Signup v4 rather than the ordinary Cloud API OAuth redirect. It stays disabled until `WHATSAPP_COEXISTENCE_CONFIG_ID`, the platform app ID and its secret are configured. A saved configuration does not prove platform or phone eligibility.

The operator must complete Meta Tech Provider (or Solution Partner) eligibility, the required permission reviews and app publication requirements. Create a separate **WhatsApp Embedded Signup** configuration with the WhatsApp Cloud API product and appropriate business integration token permissions. Enable Facebook Login's JavaScript SDK login and allow the exact hosted SenderDeck domain. Do not substitute the existing general-login configuration or weaken HTTPS / strict redirect settings. Follow the current [Meta implementation guide](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation) for the configuration's supported version and token settings.

On the existing `whatsapp_business_account` callback subscribe **messages**, **account_update**, **history**, **smb_app_state_sync** and **smb_message_echoes**. The server checks the callback, active subscription and all five fields before starting or completing onboarding. Registering new sensitive data subscriptions or creating persistent access requires the owner's explicit approval when performed by an assistant in the dashboard.

The brand administrator enters the exact Business app phone number and acknowledges Meta's phone-app feature changes and permitted initial sync. The SDK launches only on the explicit connect action. Code and session event delivery can arrive in either order; the browser accepts only exact Facebook origins and the Coexistence-specific finish event. The server consumes a ten-minute user/brand-bound state once, exchanges the code server-side, re-discovers phone membership, matches the exact phone and verifies `is_on_biz_app=true` plus `platform_type=CLOUD_API`. It never calls register, deregister or migration APIs. The authorization code is absent from URLs, MCP arguments and logs; provider tokens remain encrypted server-side.

After the local account is saved, the server subscribes its exact Messaging account to the app and initiates Meta's one-time contacts and history synchronization requests within 24 hours. Each request has an atomic claim. A lost response becomes `delivery_unknown` and is never retried. The repair action can revalidate the account subscription and start only steps still marked `not_requested`; it cannot repeat a possibly accepted synchronization request or silently offboard the phone. Provider request IDs are kept for support. Keep WhatsApp Business open during synchronization and follow Meta's in-app confirmation steps yourself.

Signed history batches are split into bounded encrypted queue records before acknowledging the webhook and processed by the existing queue/maintenance workflow. Contact sync is acknowledged without persisting contact names or importing a phone address book. Message content obeys the brand retention cutoff. Declined history sharing is respected. Provider progress, receipt state and queued work are shown separately; request acceptance is not completion, and no result claims complete native history.

Phone-app replies appear as outgoing context and change the conversation digest. Imported historical incoming messages and phone-app outgoing messages never open an API response window. Pending sync/queue work, unsupported identities, attachments and media/edit/revoke review markers block sending. Native edit/revoke events remove stale saved text from the affected retained message and require phone-app review. A phone-side disconnect revokes the local connection and outstanding draft approvals; ordinary validation cannot revive it. A new owner-authorized Coexistence flow can reconnect it without automatic offboarding.

Meta's [Coexistence requirements and feature changes](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users) include eligibility, companion-device effects and changes to some Business app features. These must be reviewed before phone confirmation. Personal WhatsApp Messenger numbers are not supported by this flow.

Live acceptance must verify the exact existing Business app number, correct finish event, token/asset isolation, simultaneous-app/API state, all sync outcomes, actual signed phone-app echoes, phone replies invalidating approval, history retention, declined sharing, native edits/revocation, phone-side disconnect and continued normal phone-app use. Mocked tests are not evidence that a particular business or number is eligible.
