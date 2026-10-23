# Comment discovery repair — 24 October 2026

The connected-tool retest reported 156 Instagram roots after 58.9 seconds and 167 Facebook roots after 123.9 seconds. These were post lists without comment previews. Directly reading the correct organic Instagram post returned a previously missed comment, so the evidence does not establish ad exclusion as its cause. The remaining differences from Meta Business Suite are unverified.

Version 0.4.20 retrieves one root page (default 10, maximum 20), adds five top-level comment previews per root, and returns a scoped, encrypted fifteen-minute nextCursor. Follow that cursor with the same brand/account/kind. Previews and ordering describe only the current page; they are not an exhaustive recent-comment search. Instagram does not support result ordering. Ad/promoted and unpublished-post coverage is explicitly unverified; native Suite review remains necessary for gaps. Provider reference: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api .

Comment history reads return at most twelve collection pages per segment under a shared twenty-second provider-read budget. nextCursor continues queued comment/reply pages. Continued segments and partial reads remain incomplete snapshots and cannot authorise sending. Post captions have role post_context and the selected asset as sender; neither captions nor unknown senders determine lastInboundAt. Actual provider sender names and comment parent IDs are retained when available. Social inbox/thread MCP responses carry one full text payload, avoiding the duplicate structured payload. The website includes pagination controls and previews.

The budget applies to provider reads in inbox discovery and comment history, not OAuth/account revalidation, local DB writes, connector overhead or message-detail reads. Validation can add latency. Complete native-Suite parity and globally sorted recent-comment discovery across every post are not claimed. Brand rules, sending switches and exact approval gates were not changed.

Validation before publication: TypeScript, production build, 20 rendered-page checks and 196 unit tests passed, including cursor scoping/token removal, preview activity, caption exclusion, parent identity, bounded history with continuation and shared time-budget exhaustion. Provider tests use synthetic SQLite fixtures and mocked Meta responses; live verification must be recorded separately after deployment.

Retest: social_inbox({brandId,accountId,kind:"comment"}) should return no more than ten roots, previews, explicit coverage and nextCursor. Pass that cursor unchanged to continue. social_thread_read({brandId,accountId,threadId}) should label the post caption as context, use only known external comments for lastInboundAt, and expose nextCursor if bounded. The known organic Donova thread is 464eb005-c859-422a-ade6-abbe345f71d2. No social reply is part of verification.

## Initial live verification

Sites deployment appgdep_6adb5d71658c8191ace3a68eddecc688 succeeded for source d9bdbc0c1c43bed3c06e38763d4d49151213333f. The custom-domain health endpoint reported 0.4.20. Connected-tool Facebook discovery returned ten roots with a cursor in 12.1 seconds; Instagram returned ten roots with a cursor and Donova comment previews in 25.1 seconds (including connector/DB overhead). Neither response duplicated structured content.

The known organic Donova thread returned twelve items in 7.8 seconds, including comment 17898994713395187 and actual lastInboundAt 1792760018000; its own caption was labelled post_context. A second root with no comments returned only post_context and lastInboundAt null in 10.0 seconds. Instagram native-Suite uncertainty remained explicit. No social reply was sent.

Live verification identified legacy saved caption timestamps being reused in inbox output. The follow-up fix reports only actual preview activity, labels its scope, and clears stored activity for roots whose complete top-level comment list is empty. A regression test covers this correction. Full TypeScript/build/rendered/unit checks passed again.
