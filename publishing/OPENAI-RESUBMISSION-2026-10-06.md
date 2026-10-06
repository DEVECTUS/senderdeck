# OpenAI resubmission work, 6 October 2026

The rejected v0.3.2 form contained five positive and three negative cases matching the previous `chatgpt-app-submission.json`. Several relied on missing fixtures: the Work label, August invoice messages, and the literal draft ID REVIEW-SEND-1. The sample account's Google refresh token also returned invalid_grant.

Version 0.3.3 was deployed from commit 8bb904d40f94cc7d800a5e8e498c1081ddf70ca1 as Sites version 26. The production MCP initialize response confirms 0.3.3. A live failed search now returns isError true, a per-account error, and an explicit instruction to reconnect the sample account. Successful empty searches and partial successes are covered separately by regression tests.

Validation: TypeScript checking, production build, 10 rendered endpoint tests and 51 TypeScript tests passed. No email was sent or replied to. The audit process prohibits email_send and account_disconnect.

The revised submission cases use the sample account's actual address, create an unsent fixture, search and read that fixture using returned IDs, and inspect its draft while waiting for separate approval. There is no claimed successful send. The maintained plugin package includes the product icon; a separate staging script preserves the migrated OpenAI package identity.

Remaining before submission:

- Complete the user-operated Google reconnect for ebayservice2013@gmail.com.
- Verify all mailbox cases against the restored sample workspace and retain their exact outputs.
- Verify ChatGPT web and mobile behavior; direct native mobile execution has not occurred.
- Check the demo recording against revised cases and update it if needed.
- Upload the corrected ZIP to the existing plugin, confirm imported review information, and submit after resolving any required findings or unverifiable attestations.

No corrected review has yet been submitted. Reviewer passwords are excluded from this file and the package.

The corrected ZIP upload is blocked by the portal: it requires publishing the existing MCP app before updating its ZIP, while that app is rejected and unpublished. The legacy rejected form is read-only. The migrated MCP association has no editable endpoint or available scan. The prepared support report records exact IDs and reproduction steps; no support message or email was sent.

## Reviewer reconnect verified

The refreshed isolated sample account successfully searched Gmail. Created unsent fixture draft r8253187920943818204, message 1a10f6f28092f0df, with the documented self-addressed subject and sample body. Search, read and draft inspection succeeded on two passes. Missing Work routing returned an error without choosing another account. Exact output evidence is retained privately beneath C:\Temp\senderdeck-resubmission. The updated narrated-text MCP walkthrough is published as /demo/senderdeck-review-0.3.3.mp4; it explicitly distinguishes production MCP checks from native ChatGPT mobile testing, which remains unperformed.

