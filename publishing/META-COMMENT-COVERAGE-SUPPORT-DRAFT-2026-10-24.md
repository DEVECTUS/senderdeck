# Unsent Meta support draft: Instagram comments visible in Suite but absent from API

Prepared 24 October 2026, Australia/Sydney. Owner review and explicit authorization are required before sending. This draft contains no credentials or continuation state. No support request has been submitted.

## Subject

Instagram API with Facebook Login: two Suite entries missing from comments and ordered_comments on associated organic/ad media

## Report

Please investigate a discrepancy between Meta Business Suite and the Instagram API for a professional account we administer.

- Meta app: SenderDeck by DEVECTUS, 2213673322866707.
- Instagram professional asset: 17841473414427719 (devectus.au), linked Page 658901873971126 (DEVECTUS).
- Authorized advertising account: act_1286084226264225 (DEVECTUS Ads – AU).
- API: graph.facebook.com/v26.0, Facebook user access token with existing instagram_basic, instagram_manage_comments, pages_read_engagement and ads_read, with the original approved Page/Instagram permissions. No ads_management was requested.
- Organic dental Donova media: 17884553937619899, https://www.instagram.com/reel/DdJYoqAyVl2/.
- Associated ad media returned by effective_instagram_media_id: 18468308833184435, https://www.instagram.com/p/Dek63Vss-Y6/.
- Business Suite inbox selected item: 1389703307557642. We do not assume this internal Suite item is an API media or comment ID.

In a fresh native Suite view on 24 October, the dental Donova thread showed catherine_turner_ with the text Ai slop and kalan.da.fitter with a blank body. The Kalan row had no image/video in the rendered comment-body DOM inspected. We do not know either underlying API comment ID or the cause of their availability difference. We are not asserting deletion, hidden status, a private-account restriction or ad-only placement.

Standard comments reads before our ordered-comments correction and fresh ordered_comments reads on both media returned the same 13 comments/replies plus post context. Each fresh full read exhausted six collection pages with no next cursor. Other comments visible in Suite occur in the API, including true_ru_ comment 17898994713395187, brand reply 18132952627769454 and follow-up 18106719842184004. SenderDeck retains returned rows even when the provider omits author identity; it does not filter comments by sender name.

We exhausted the selected advertising account's available creative pagination: 111 successful pages for each selected social account, mapping 553 distinct Facebook roots and 474 distinct Instagram media. No additional matching dental Donova media or Catherine/Kalan preview was found. This is a creative inventory comparison, not a claim that every historical comment on all media has been read.

## Reproduction

Using the authorized Facebook user token for this app/account, issue these GET requests without copying credentials into a support message:

```text
/v26.0/17884553937619899/ordered_comments?fields=id,text,from,timestamp&limit=20
/v26.0/18468308833184435/ordered_comments?fields=id,text,from,timestamp&limit=20
```

Follow every provider next link, then retrieve every returned top-level comment's replies with id,text,from,timestamp and exhaust its next links. Compare exact IDs with the selected native Suite thread. The two media return shared comment IDs; top-level parent context in our client is the requested root, not independently verified originating ad placement.

Please identify the underlying comment IDs and media/placement for the Catherine and Kalan entries and explain whether their absence is expected under a documented availability rule, an app/access condition, a different supported endpoint requirement, or a provider defect. We would appreciate a precise supported way to retrieve them or an explicit limitation we can present to the owner.

During the larger inventory, Meta returned HTTP 400 / Graph 80004. We stopped and resumed in small hourly batches after cooldown. Both page chains are now exhausted. That earlier throttle explains interrupted discovery, but it does not explain the missing entries in successful, exhausted thread reads.

## Evidence available for owner review

- Native comparison screenshot: C:/Temp/senderdeck-missing-comments-native-2026-10-24.png. Review and redact any unrelated interface information before an authorized upload.
- Application investigation: publishing/COMMENT-COVERAGE-INVESTIGATION-2026-10-24.md.
- Final live application version: 0.4.24. Both known threads returned 13 comments/replies with no continuation on the completion check.

Never attach tokens, OAuth codes, passwords, cookie values, private hosting settings or local encrypted checkpoint values. No content was sent, hidden or deleted during this investigation.
