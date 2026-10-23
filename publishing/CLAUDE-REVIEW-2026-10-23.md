# Claude review follow-up — 23 October 2026

Existing plugin: `5a677931-1197-4a4e-a9c1-1588d5da313b`.

The portal showed version 0.3.3 at commit 926529d as Needs changes, with an Anthropic decision dated 9 October. The reviewer identified unbound provider callbacks, implicit connected-mailbox sign-in adoption, persistent sign-in links after disconnect, missing manifest privacy URL and an unnamed MCP consent requester.

Version 0.4.18 addresses these paths. Provider flows require per-flow host-only browser cookies; mailbox linking also checks the current owner. Server state consumption is atomic. Sign-in resolves only an existing registered identity or creates a separate user, never adopting a connected mailbox's owner. A same-origin, authenticated and explicitly confirmed owner action can enable sign-in for an existing owned connection without transferring another user's identity. Disconnect removes the exact sign-in link in the same transaction. The consent page escapes and displays the registered client name, and the Claude manifest includes privacyPolicyUrl.

Tests use synthetic SQLite fixtures and mocked provider APIs. They cover both providers, missing and incorrect browser cookies, unchanged state after rejected callbacks, successful normal completion, replay, changed owner, mailbox isolation, explicit opt-in, ownership and origin checks, disconnect/re-login and escaped consent names. These tests are not evidence of an independent security review, live Claude OAuth or a new Claude-specific video.

Existing identities created before this patch are retained; the patch does not audit historical account ownership or establish that no prior misuse occurred. Password credentials, provider tokens, mailboxes and unrelated user/workspace records are not migrated.

Publication and resubmission status must be recorded from the portal after deployment; preparing this file is not evidence of submission or approval. The OpenAI v0.4.17 submission remains a separate review.

Validation: TypeScript passed; the full production build, 20 rendered-page checks and all 191 unit tests passed. Anthropic CLI validation passed for the plugin folder and repository marketplace. The Sites build helper failed to locate npm through the Windows shim; the standard repository npm test command built and tested the same source successfully.

## Observed publication outcome

The owner authorised Claude to use only the dedicated `testuser` review identity and confirmed the four Anthropic resubmission declarations. Claude OAuth showed the isolated sample mailbox before approval, completed successfully and discovered 38 tools. No email was sent.

- The security fixes were deployed as 0.4.18 at `3a6a3698eb2e7fd967477663cc9364fb56fc62e8`.
- 0.4.19 at `1b1c06fd00e41db91c361fc1b94811b675f21bf0` makes MCP descriptions factual while retaining workflow guidance in the skills. The live endpoint reports 0.4.19. TypeScript, build, 20 rendered-page checks, all 191 unit tests and Anthropic plugin validation passed.
- Existing plugin resubmitted: https://claude.ai/directory/manage/plugins/5a677931-1197-4a4e-a9c1-1588d5da313b . The portal fetched v0.4.19 at 1b1c06f; validation, directory policy and security scan passed with non-blocking notes. It explicitly says publication waits for an Anthropic reviewer. No reviewer decision is recorded for v0.4.19, and it is not live.
- Four manifest warnings concern documentationUrl, privacyPolicyUrl, supportUrl and termsOfServiceUrl. Expanded feedback says the directory reads them, Claude Code ignores them at load time, and no action is needed.
- Separate MCP connector submitted: https://claude.ai/directory/manage/senderdeck . The saved status is In review, with OAuth required and DCR configured, 38 tools, and Live not yet reached.
- The connector form disclosed third-party Google/Microsoft APIs, configurable mailbox health content, gated social capabilities and testing limits. The optional declaration that every tool was tested live through Claude/MCP Inspector remains unchecked. Dedicated credentials were entered only in secure review instructions and are excluded from this report and packages.

Publication is awaiting Anthropic approval. These results do not claim an independent security audit, every-tool live validation, or a new demonstration video. The prior OpenAI v0.4.17 submission remains a separate review; it was not replaced or withdrawn during this Claude work.
