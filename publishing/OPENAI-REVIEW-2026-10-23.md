# SenderDeck review preparation — 23 October 2026

The owner deleted the rejected migrated listing and uploaded a new package.

- Current plugin: `plugin_asdk_app_6adb16055850819189d3575452c391c9`
- Current submission: `appsub_6adb160558848191bb26aff36feff2a3`
- Package identity: `senderdeck`
- Display name: SenderDeck
- Publisher: DEVECTUS Pty Ltd
- Endpoint: `https://senderdeck.devectus.com.au/api/mcp`
- Screenshot evidence: configured, OAuth authorised, domain verified; a rescan after annotation fixes showed no MCP findings. This is a scan result, not review approval.
- Last visible review state: Not submitted. Publication: Not published.

## Reviewer login

- Sign-in URL: `https://senderdeck.devectus.com.au/signin`
- Username requested by owner: `testuser`
- Password: enter the owner-supplied password only in the secure portal. It is intentionally excluded from this file and all ZIPs.
- Target: the ordinary isolated SenderDeck identity whose connected mailbox is `ebayservice2013@gmail.com`.
- Reviewers use the same session, mailbox ownership and workspace permission checks as other users. They do not need the Gmail password or provider sign-in after this login is provisioned.
- On the normal sign-in page, enter the SenderDeck username and password and select Sign in. In an OAuth connection, retain the return URL, then approve access when prompted.

The five positive and three negative email test cases are imported by the package. Use the actual IDs returned by account/draft/search tools. Never send during setup or validation. The existing email walkthrough is `/demo/senderdeck-review-0.3.3.mp4`; it does not demonstrate the new password flow, live social access or native mobile testing. An updated walkthrough is still needed before claiming those flows are demonstrated.

## Package refresh

0.4.17 uses the new `senderdeck` package identity by default, retains the icons and skills, and removes references to other AI platforms from OpenAI listing name/description fields. The legacy package identity requires an explicit `--legacy` flag and must not be used for this new listing.

Update this existing plugin, rather than creating another listing. Verify the selected package version, latest metadata findings, reviewer details, cases and supporting recording before final submission. Approval and legal attestations are not implied by preparation.

Direct installation from `/install` is separate from public directory publication. It includes instructions for ChatGPT custom MCP, the Codex repository marketplace, Claude custom connectors and Claude Code. Client plan and workspace policies still apply.
