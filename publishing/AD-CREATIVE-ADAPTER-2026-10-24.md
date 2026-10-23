# Read-only advertising creative mapping — v0.4.22

The adapter is implemented for both Facebook effective_object_story_id and Instagram effective_instagram_media_id. It reads at most five creatives from one explicitly selected act_ account per provider page, revalidates the user token's configured-app ownership, granting identity and actual ads_read/ads_management scope, checks access to the selected advertising account, and reads each effective root's actual provider from/owner. Only roots belonging to the selected social asset reach previews, local enquiries or users. Duplicate roots within a page are deduplicated. Unknown/mismatched root ownership creates a gap. Failed root verification returns a cursor at the unprocessed root, rather than silently dropping it. Cursors bind social account, source and selection ID/time, strip provider tokens and expire in fifteen minutes. Provider access failures remain failures.

No advertising scopes are requested by this code, no ad account is automatically selected, and no campaigns, budgets, delivery settings, brand rules or sending controls are changed. All ad-account and creative requests are GETs. Read-side introspection and mapping share the inbox's twenty-second/request budget. Existing per-user OAuth grants expire after ten minutes and remain encrypted; advertising selection requires the original grant's SenderDeck user and brand, admin role and a matching Meta granting identity. It retains existing social scopes and Page credentials. Only an explicitly confirmed selection replaces that account's encrypted user token with the owner's fresh authorised grant and stores token-free selection metadata. Normal reconnection resets that selection; routine account validation preserves it. No database schema migration is required.

Meta-owned SDK references establish the adaccounts and adcreatives edges and effective media/story fields:
- https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/user.py
- https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adaccount.py
- https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adcreative.py

## Concrete owner approval and setup

The current production grants do not have ads_read or ads_management, and neither DEVECTUS account has an advertising-account selection. The earlier Page ads_posts request returned HTTP 403 / Graph 200. That denial and missing permissions do not establish why Catherine/Kalan comments were absent. Their exact placement/comment IDs remain unverified; do not describe them as deleted, hidden, ad-only or recovered.

The minimal permission approval to request is: **Authorize adding read-only ads_read to SenderDeck's existing Meta login configuration and requesting fresh Meta consent for DEVECTUS advertising-comment review. Do not add ads_management, change campaigns, enable social sending or select an advertising account automatically.** This is a proposed approval, not a record of consent. The operator must first confirm Meta makes ads_read available to this app/configuration and complete any applicable provider review; this code cannot bypass provider approval. No permission/configuration change has been made here.

After permission approval and configuration, use the existing social_account_connect for DEVECTUS brand 48da196a-d80a-4a1a-ad1f-ae65c89f9b82. The correct owner signs in and consents; use the resulting owner-bound grant within ten minutes. Keep all existing social permissions. Then:

1. social_asset_list with brandId, grantId, kind advertising. It returns accessible, token-free provider act_ IDs and names; paginate with its cursor if needed. Listing does not select an account.
2. Present the exact returned advertising account name/ID and the target social account to the owner. DEVECTUS Instagram is 1290d059-4bfa-4c72-9d75-ccb763eaa6c8; Facebook is cd183795-1730-425a-89b5-7a6c6d17de8a. Each target needs its own explicit selection. Obtain separate approval before executing it.
3. social_asset_select with brandId, grantId, provider advertising, assetId (the exact returned act_ ID), accountId, confirmed true and confirmation exactly `Select advertising account {assetId} for social account {accountId} in brand {brandId}`. No real advertising account ID is assumed in this report.
4. social_inbox with the same brand/account, kind comment, source ad_creatives. Continue nextCursor with the same source and use social_thread_read on returned local thread IDs. Compare the actual bodies/authors/IDs against the specific native Business Suite placement; do not claim global parity from one successful page.

Refresh cached MCP discovery first. The contract check is `node scripts/check-social-contract.mjs`; it checks current server version, ad_creatives source, advertising asset kind and explicit-selection arguments. This public script does not refresh clients or validate authenticated mapping. No OAuth reconnect is needed merely for schema refresh. A fresh OAuth grant IS needed later to obtain owner-approved new ads_read consent.

## Validation boundaries

Provider tests use synthetic SQLite and mocked Meta responses, never production credentials/ad accounts. They exercise exact confirmation, user/brand/role isolation, grant identity/scope rejection, encrypted token storage, retention of existing scopes and Page credentials, unchanged brand policy, no ad endpoint access without selection, both channel mappings, duplicate/foreign roots, scoped cursors, retries, missing/revoked scopes and mismatched account IDs. Live mapping against a real approved ad account must remain pending until the owner authorises scopes and selects that account. No missing real-world comment is claimed recovered by these tests.

Pre-deployment validation passed: TypeScript, production build, 209 unit tests and 20 rendered checks. Ad-account discovery, selection and actual creative mapping against a production advertising account have not been run, because no owner scope approval or account selection has been supplied.

## Production verification

Version 0.4.22 deployed successfully from e1ea84b9075ac9bacc8dcc575003049636c74f20 as Sites version 59, deployment appgdep_6adb64847338819191b203504b2e9e9a. The live public contract checker confirmed 0.4.22 and all creative-source and owner-selection arguments. Connected Instagram and Facebook source ad_creatives calls rejected the unapproved selection in 1.1 and 2.1 seconds, respectively, before reading an advertising endpoint. A fresh account-list check showed no advertising account selected, no ads_read and both send/reply capabilities false for both accounts. The live gate behaved as designed; successful production creative mapping and recovery of Catherine/Kalan comments remain untested pending owner consent and selection.
