# Claude review follow-up — 23 October 2026

Existing plugin: `5a677931-1197-4a4e-a9c1-1588d5da313b`.

The portal showed version 0.3.3 at commit 926529d as Needs changes, with an Anthropic decision dated 9 October. The reviewer identified unbound provider callbacks, implicit connected-mailbox sign-in adoption, persistent sign-in links after disconnect, missing manifest privacy URL and an unnamed MCP consent requester.

Version 0.4.18 addresses these paths. Provider flows require per-flow host-only browser cookies; mailbox linking also checks the current owner. Server state consumption is atomic. Sign-in resolves only an existing registered identity or creates a separate user, never adopting a connected mailbox's owner. A same-origin, authenticated and explicitly confirmed owner action can enable sign-in for an existing owned connection without transferring another user's identity. Disconnect removes the exact sign-in link in the same transaction. The consent page escapes and displays the registered client name, and the Claude manifest includes privacyPolicyUrl.

Tests use synthetic SQLite fixtures and mocked provider APIs. They cover both providers, missing and incorrect browser cookies, unchanged state after rejected callbacks, successful normal completion, replay, changed owner, mailbox isolation, explicit opt-in, ownership and origin checks, disconnect/re-login and escaped consent names. These tests are not evidence of an independent security review, live Claude OAuth or a new Claude-specific video.

Existing identities created before this patch are retained; the patch does not audit historical account ownership or establish that no prior misuse occurred. Password credentials, provider tokens, mailboxes and unrelated user/workspace records are not migrated.

Publication and resubmission status must be recorded from the portal after deployment; preparing this file is not evidence of submission or approval. The OpenAI v0.4.17 submission remains a separate review.

Validation: TypeScript passed; the full production build, 20 rendered-page checks and all 191 unit tests passed. Anthropic CLI validation passed for the plugin folder and repository marketplace. The Sites build helper failed to locate npm through the Windows shim; the standard repository npm test command built and tested the same source successfully.
