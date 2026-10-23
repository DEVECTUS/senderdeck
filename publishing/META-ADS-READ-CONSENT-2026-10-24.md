# Meta ads_read configuration and consent — 24 October 2026

The owner explicitly approved adding only ads_read to SenderDeck's Meta login configuration and requesting fresh DEVECTUS consent. Advertising-account selection, ads_management, campaign changes and social sending were excluded from that approval.

The signed-in developer dashboard for SenderDeck by DEVECTUS app 2213673322866707 initially offered only the existing ten permissions in configuration 1772051498254531 (SenderDeck Social Inbox). Added the Measure ad performance data with Marketing API use case to make ads_read available. Meta's use-case capability table also lists ads_management as available for testing; it was not selected in the login configuration and was not requested or present in the verified fresh consent grant.

Saved the same configuration with ads_read plus the original ten permissions: business_management, instagram_basic, instagram_manage_comments, instagram_manage_messages, pages_manage_engagement, pages_manage_metadata, pages_messaging, pages_read_engagement, pages_read_user_content and pages_show_list. Configuration name, ID, General login variation and user-access-token type were preserved. The expanded saved configuration was inspected after saving and showed exactly those eleven permissions.

Started a new consent flow from the authenticated SenderDeck owner session for DEVECTUS brand 48da196a-d80a-4a1a-ad1f-ae65c89f9b82. Meta showed Barsham Sotoudeh. Existing Page, Instagram and business choices were left unchanged. The final review added access to Facebook ads and related stats; it did not request ads management. Meta confirmed the connection and the callback returned to SenderDeck successfully.

The token-free social_asset_list response from that fresh owner-bound grant independently confirmed ads_read present, ads_management absent and the original social permissions retained. Read-only advertising asset discovery also succeeded and returned DEVECTUS Ads – AU, act_1286084226264225, among the accessible accounts. Listing is not selection. No advertising account was selected or linked to either DEVECTUS social account; no campaign, sending switch, approval policy or social reply was changed. No credential, access token, authorization code, ephemeral OAuth state or grant ID is recorded here.

Production remains v0.4.22, deployed source e1ea84b9075ac9bacc8dcc575003049636c74f20. This was a Meta configuration change; it did not require a website deployment. The fresh grant is short-lived and is not installed into a social account until a separately approved advertising selection; if it expires, repeat consent with the same approved permissions before selection. Catherine/Kalan comment coverage remains unverified.

After consent, revalidated the existing DEVECTUS Facebook and Instagram connections using their existing credentials. Both succeeded with messages/comments available, ads_read present, ads_management absent, no advertising selection and sendMessages/replyComments false. The Meta grant expansion was visible to those existing token validations as well; no new token was manually exposed or copied. Presented the exact provider-returned DEVECTUS Ads – AU account for a separate owner decision. The following section records the later explicit approval and completed selection.

## Approved advertising-account mapping and live retest

The owner subsequently explicitly approved linking DEVECTUS Ads – AU (act_1286084226264225) to both DEVECTUS social accounts for read-only comment discovery. The earlier short-lived selection grant had expired; refreshed the owner's existing Meta authorization with the same settings. Re-listed advertising assets and verified the exact account again before selecting it.

Both social_asset_select calls succeeded with readOnlyMapping true and sendingPolicyChanged false:

- Facebook DEVECTUS: cd183795-1730-425a-89b5-7a6c6d17de8a.
- Instagram devectus.au: 1290d059-4bfa-4c72-9d75-ccb763eaa6c8.

A subsequent social_account_list confirmed the persisted advertisingAccount mapping on both, ads_read present, ads_management absent, sendMessages false, replyComments false and platform sending disabled. No campaigns, provider content, social drafts or reply approvals were changed.

Ad-creative discovery for cd183795-1730-425a-89b5-7a6c6d17de8a: 12 sequential pages at limit 5; 60 distinct provider roots. Every inspected preview was empty. A further nextCursor remains available; this is a bounded inventory, not exhaustive discovery. Runtime diagnostics reported configured true, hasReadScope true, verifiedAdAccount true, selectedAdAccountId act_1286084226264225 and blockers [].

Ad-creative discovery for 1290d059-4bfa-4c72-9d75-ccb763eaa6c8: 12 sequential pages at limit 5; 53 distinct provider roots. Every inspected preview was empty. A further nextCursor remains available; this is a bounded inventory, not exhaustive discovery. Runtime diagnostics reported configured true, hasReadScope true, verifiedAdAccount true, selectedAdAccountId act_1286084226264225 and blockers [].

Full-history samples for the first returned Facebook and Instagram ad roots verified their actual selected-asset owners and returned post context only, with no comment/reply items and no continuation. Facebook reply authority remains unverified because can_comment is unavailable; Instagram's general native Suite coverage gap remains explicit.

Organic feed discovery at limit 5 succeeded on both accounts. The full known Donova Instagram thread 464eb005-c859-422a-ade6-abbe345f71d2 returned 14 items (one post context plus 13 comments/replies), six collection pages and no continuation, including true_ru_ comment 17898994713395187, the existing devectus.au reply 18132952627769454, and newer true_ru_ follow-up 18106719842184004 at 1792765219000. No reply was sent during this retest.

Catherine/Kalan were not recovered in these reads. Their cause remains undetermined. The Business Suite selected-item ID 1389703307557642 has not been verified as a particular API root; identify the exact placement and post/media permalink before claiming parity or attributing absence to deletion, hiding or ad-only placement. More creative pages remain uninspected. Instagram comments webhook signed delivery remains unverified. A diagnostics wording limitation remains: ownerAction still describes initial consent/selection even when mapping is configured and blockers are empty.

Production is still v0.4.22, source e1ea84b9075ac9bacc8dcc575003049636c74f20. Public scripts/check-social-contract.mjs passed and advertises cursor/limit/source plus advertising-selection fields. The other chat independently reported that refreshed connected tool schemas now work. Its independent test is separate from the results above.

Retest: social_inbox with brandId 48da196a-d80a-4a1a-ad1f-ae65c89f9b82, exact accountId above, kind comments, source ad_creatives, limit 5; preserve source/account and pass returned nextCursor for each continuation. For full history use social_thread_read with the returned thread ID and continue its own nextCursor until absent. Coverage flags still govern interpretation.

