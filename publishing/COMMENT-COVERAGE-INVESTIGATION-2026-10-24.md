# Catherine and Kalan comment investigation

24 October 2026, Australia/Sydney. Available ad-creative pagination is now exhausted on both accounts. The specific provider reason for the missing comments remains unresolved. Do not claim full Suite parity, deletion, hidden status or recovery.

## Completed inventory and final live check

The bounded hourly continuation finished on 24 October: Facebook 111 successful pages and 553 distinct roots; Instagram 111 successful pages and 474 distinct media roots. Both returned no further discovery cursor. No Catherine/Kalan preview or additional matching dental Donova media appeared in the remaining pages. This exhausts the selected account's returned creative inventory, not every possible Meta placement or every historical comment on every root.

The final authenticated v0.4.24 ordered_comments checks of both known dental Donova roots again returned the same 13 comment/reply IDs plus post context, six collection pages each, verified selected-asset ownership and no history continuation. Catherine and Kalan were still absent. Existing explicit native-Suite and media-placement uncertainty remains material. The native evidence records their earlier Suite appearance; this completion check did not re-inspect the browser or assert their current moderation status.

No further pagination remains to explain this discrepancy. The remaining investigation needs Meta to correlate the Suite-only entries with underlying comment IDs/placements and explain their API availability. A reviewable, unsent report is in META-COMMENT-COVERAGE-SUPPORT-DRAFT-2026-10-24.md. No support request, social reply, permission or sending-policy change was made. The inventory continuation automation is no longer needed after this completion.

## Verified findings

- Continued approved DEVECTUS Ads – AU discovery to 99 successful Facebook pages (495 distinct roots) and 92 successful Instagram pages (412 returned roots, 392 distinct). Both still had continuation cursors when the next requests failed with HTTP 400 / Graph 80004. These are partial inventories, not exhausted ad accounts.
- Page 13 exposed Instagram ad media 18468308833184435, permalink https://www.instagram.com/p/Dek63Vss-Y6/, thread efce25e7-3f9f-49f1-a17a-f62684231e19. It has the matching dental Donova caption and October 17 date. Its comments share exact IDs with organic media 17884553937619899, permalink https://www.instagram.com/reel/DdJYoqAyVl2/, thread 464eb005-c859-422a-ade6-abbe345f71d2.
- Standard comments and subsequent ordered_comments full reads on both roots returned the same 13 comment/reply items plus post context, six collection pages and no remaining history cursor. Neither Catherine nor Kalan occurred. true_ru_'s original 17898994713395187, existing brand reply 18132952627769454 and follow-up 18106719842184004 were present.
- A fresh native Business Suite view for selected_item_id 1389703307557642 showed catherine_turner_ with Ai slop, and kalan.da.fitter with a blank body. The latter had no image/video in the rendered comment-body DOM inspected. This does not prove deletion or any other cause. The Suite selected-item ID is not itself a verified API media/comment ID.
- Source inspection confirmed every provider comment row is retained, including rows with unknown author IDs. Later Facebook discovery actually returned one such unknown-author comment. No local sender-name filter removes Catherine or Kalan.

## Corrected and deployed

Meta's official Comments reference, updated October 20, documents ordered_comments for combined ad-media placements. Version 0.4.23 changed Instagram previews/history to ordered_comments and corrected full collection/reply reads to use the Facebook user grant consistently. Previously only root context used that grant while full collections used the Page token. Live ordered reads succeeded but did not recover either missing entry, so these corrections are not a demonstrated explanation or complete fix for the missing comments. Aggregated top-level parent IDs denote requested context, not independently verified media placement. Reply parent comment IDs remain explicit.

Version 0.4.24 recognizes Marketing API quota codes and preserves ad discovery positions for 24 hours, including when throttled; history cursors and encrypted draft snapshots remain fifteen minutes. Every resumed discovery still rechecks current granting identity/scope, exact approved ad account, and each root's actual owner. No access or sending policy was widened. Unit regression verifies a throttled cursor resumes the exact position after thirty minutes with live checks and remains bound to its account/selection.

v0.4.24 source c443d489183bb51156aa49a5edd775f0e1cb8a2a, Sites version 62, deployment appgdep_6adb7b31cee08191a5eef7b3ac34a49a succeeded. TypeScript, 213 unit tests and 20 rendered checks passed. Public contract verified 0.4.24. Authenticated live checks returned explicit provider_ad_account_rate_limit_retry_saved_cursor_after_cooldown and retained cursors on both accounts. No social message, campaign, scope or approval policy was changed.

## Remaining investigation and Meta support reproduction

Resume the exact saved account-bound ad cursors after cooldown, in smaller batches. Positions are in a local temporary checkpoint, not committed credentials or OAuth grants. Do not repeatedly retry 80004, infer a quota reset time, or restart from page one unnecessarily. Exhaust remaining roots and read any new matching dental Donova variants fully. Keep the earlier inventory distinct from new pages using ordered_comments.

If the completed inventory still excludes the entries, the reproducible support question is why the authenticated API returns a subset of the same comments visible in Suite. Request Meta to identify the underlying comment IDs and placement for catherine_turner_ and kalan.da.fitter, and explain any API filtering/availability rule. Send no support request without the owner's explicit authorization. Never send tokens, authorization codes, passwords or encrypted local checkpoint values to support.

Reproduction: configured SenderDeck app 2213673322866707, selected IG asset 17841473414427719, owner-approved advertising account act_1286084226264225 with existing ads_read and original Instagram comment scopes; no ads_management. GET /v26.0/18468308833184435/ordered_comments?fields=id,text,from,timestamp&limit=20 with the authorized Facebook user token, exhaust next links, then each returned comment's /replies. Repeat for 17884553937619899. Compare exact IDs with Suite, without claiming that its internal selected-item ID is an API root. No credential values belong in the report.

Official references: [Comments and ordered_comments](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-media/comments), [Marketing API rate limiting](https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/rate-limiting). Both were read in the signed-in browser because the web fetch returned 429. Meta documents 80004 among ad-account throttling codes. This throttle explains why further discovery stopped, not why Catherine/Kalan were absent from successful reads.
