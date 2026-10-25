# Instagram comment visibility

Released in 0.4.27. Supported through the existing Facebook Login user grant and Graph v26.0. No additional provider scopes are requested. Existing reply sending gates are unchanged; moderation is a separate owner/admin operation.

The authenticated `/comments/moderate` page exposes the same inspection/application service. Select a brand and Instagram account, enter one exact comment ID, inspect, verify the displayed full text and media, then approve that exact action. This is the supported fallback when an older MCP client has not refreshed its tool schema; it requires no credential extraction or direct provider calls.

1. Select the exact brand and Instagram account from workspace/account tools.
2. Call `social_comment_inspect` with `brandId`, `accountId`, the exact provider `commentId`, and `action` (`hide` or `unhide`). This reads the actual comment and its media, verifies current token identity, app, scopes, asset discovery, Page moderation task and media ownership, then returns full text, author, media ID, current `hidden`, operation ID, revision, approval token and exact confirmation string. Inspection never changes provider content.
3. Verify the full comment text, actual media and selected account against the human's exact approval. An approval token is not human consent. Obtain approval if the exact comment and action are not already authorised.
4. Call `social_comment_moderate` with the same `brandId`/`accountId`, returned `operationId`, `revision`, `approvalToken`, `confirmed: true`, and returned `requiredConfirmation` as `confirmation`. Approvals expire after five minutes and are bound to the actor, account asset, brand revision, action and exact inspected comment state. The tool rechecks live authority and unchanged text/media/author/visibility, atomically consumes approval and audits the attempt before writing.
5. Report success only for `verified: true` with the desired `hidden` state, read back from Meta. The write uses `POST /{commentId}` with form parameter `hide=true` or `hide=false` and the media owner's user grant. It never uses DELETE. A failed or uncertain write/readback is recorded as `result_unknown`; never retry automatically. Inspect the exact comment visibility or check the native provider first.

Only Instagram comments on verified owned FEED, REELS or STORY media are supported. Live media, owner comments, missing author/visibility/ownership, missing permissions or unverified moderation tasks remain blocked. Reviewer permission to approve replies does not grant moderation access. Ordered comment results can mix placements, so the requested thread/root is never used as proof of actual comment ownership. Each comment gets a separate approval; no broad keyword or bulk operation is exposed.

Approvals store provider text encrypted for at most five minutes until maintenance cleanup; verified approvals erase content immediately. Audit records contain operation/revision/account/comment/media/action and outcome, not raw comment text or credentials, and follow existing brand retention. The added table references accounts with cascade cleanup; mailbox and conversation tables are unchanged.

Official reference: https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-comment

After upgrading the marketplace, restart the client/start a new session if the two tools are absent. The server's public `tools/list` verifies deployment but does not prove that an existing client has refreshed discovery or that a specific account has live provider access.
