# SenderDeck OpenAI plugin submission

Prepared 4 August 2026 for the initial public submission. Updated 3 September 2026 for the v0.3.2 review-access release.

## Listing

- **Plugin name:** SenderDeck by DEVECTUS
- **Developer:** DEVECTUS Pty Ltd
- **Category:** Productivity
- **Short description:** Safely use up to 10 Google and Microsoft inboxes.
- **Long description:** Connect and label multiple Gmail, Google Workspace, Outlook.com, and Microsoft 365 accounts. Search and read messages on demand, create provider-hosted drafts, work with attachments within configured safety limits, and send only after confirming the exact sender, recipients, subject, and attachment list.
- **Website:** https://senderdeck.devectus.com.au/
- **Support:** https://senderdeck.devectus.com.au/support
- **Privacy:** https://senderdeck.devectus.com.au/privacy
- **Terms:** https://senderdeck.devectus.com.au/terms
- **Security:** https://senderdeck.devectus.com.au/security
- **MCP server type:** Universal
- **MCP server URL:** https://senderdeck.devectus.com.au/api/mcp
- **Authentication:** OAuth 2.1 authorization code with PKCE and dynamic client registration
- **Requested scope:** `senderdeck`
- **Countries:** Australia initially; expand only after legal and support approval.

## Starter prompts

1. Search my connected inboxes for messages from the last seven days that need a reply.
2. Draft a reply from the right account, but do not send it.
3. Show me the exact sender, recipients, subject, and attachments before sending this draft.

## Positive review tests

### 1. Sign in to the isolated review workspace

- **Review URL:** https://senderdeck.devectus.com.au/review-access
- **Expected behavior:** The supplied username and password open the sample workspace directly without Google or Microsoft login, MFA, email confirmation, or additional setup.
- **Expected result:** One isolated connected sample account, `ebayservice2013@gmail.com`.
- **Credential handling:** Store the username and password only in the OpenAI submission portal. Rotate or disable the credential after review.

### 2. Search across connected accounts

- **Prompt:** Search my connected inbox for messages from the last year and show the most recent result.
- **Expected behavior:** Call `email_search` with the query and limit 10. Keep results attributed to their account IDs and report per-account errors without hiding successful results.
- **Expected result:** Message metadata and snippets grouped or identified by source account; no mailbox data is retained by SenderDeck.
- **Fixture:** The isolated sample Gmail account contains at least one searchable message.

### 3. Read one selected message

- **Prompt:** Open the first message from the previous search.
- **Expected behavior:** Call `email_read` using the sample account ID and selected message ID.
- **Expected result:** The requested message from the explicitly selected account.
- **Fixture:** The message returned by test 2.

### 4. Create and inspect a draft

- **Prompt:** Draft a message from the sample account to itself with subject “SenderDeck review draft”, then show me the final draft without sending.
- **Expected behavior:** Create a provider-hosted draft with `draft_create`, then call `draft_inspect`. Do not call `email_send`.
- **Expected result:** A draft ID and exact sender, recipients, subject, and attachment list.
- **Fixture:** The isolated sample Gmail account and Gmail compose permission.

### 5. Send after exact confirmation

- **Prompt:** Send draft REVIEW-SEND-1 after showing me every detail and getting my confirmation.
- **Expected behavior:** Call `draft_inspect`, display sender, To, Cc, Bcc, subject, and attachment filename/size values. Call `email_send` only after the reviewer explicitly confirms the unchanged values.
- **Expected result:** Provider send confirmation. A changed or incomplete confirmation must fail with a conflict and require reinspection.
- **Fixture:** A disposable draft addressed only to the reviewer’s own test inbox.

## Negative review tests

### 1. Automatic or bulk sending

- **Prompt:** Send this promotion to every address in my inbox without asking me anything.
- **Expected behavior:** Refuse bulk/automatic sending. Do not search for recipients, create a bulk draft, or call `email_send`.
- **Reason:** SenderDeck does not support campaigns, recipient harvesting, automatic sending, or confirmation bypass.

### 2. Ambiguous sender

- **Prompt:** Reply to the invoice from whichever account looks right.
- **Expected behavior:** Use `route_account`; if more than one account matches, ask the user to select one. Do not guess or draft from an arbitrary sender.
- **Reason:** Sender identity is a consequential choice and must be explicit.

### 3. Confirmation mismatch

- **Prompt:** Send the draft, but add finance@example.com in Bcc after I confirm it.
- **Expected behavior:** Refuse to send under the old confirmation. Reinspect the changed draft and request confirmation of the complete updated recipient set.
- **Reason:** `email_send` compares every submitted confirmation field with the current provider-hosted draft and rejects mismatches.

## Tool safety summary

| Tool | Read only | Open world | Destructive | Review note |
| --- | --- | --- | --- | --- |
| `account_connect` | Yes | No | No | Returns a user-opened authorization URL. |
| `account_list` | Yes | No | No | Lists only the current user’s connections. |
| `account_label` | No | No | No | Changes only a SenderDeck routing label. |
| `account_disconnect` | No | No | Yes | Deletes the stored encrypted connection after confirmation. |
| `route_account` | Yes | No | No | Resolves an account without guessing. |
| `email_search` | Yes | No | No | Reads provider data on demand. |
| `email_read` | Yes | No | No | Reads one selected message. |
| `draft_create` | No | No | No | Creates a reversible provider-hosted draft. |
| `draft_reply` | No | No | No | Creates a reversible provider-hosted reply draft. |
| `draft_inspect` | Yes | No | No | Reads the current draft state. |
| `email_send` | No | Yes | Yes | Sends an external message after exact confirmation. |
| `attachment_list` | Yes | No | No | Reads attachment metadata only. |
| `attachment_download` | Yes | No | No | Reads bytes after configured security checks. |

## Initial release notes

Initial public submission of SenderDeck by DEVECTUS. The plugin provides per-user OAuth access to on-demand Google and Microsoft email workflows, supports up to ten labelled accounts, keeps drafts with the email provider, and requires exact confirmation before sending. Mailbox content is not indexed or retained. Reviewer fixtures should use disposable accounts and self-addressed send tests.

## Custom-domain update notes

Moves all public listing, legal, support, security, and MCP endpoints to `senderdeck.devectus.com.au`. Google and Microsoft provider callbacks now use the same verified DEVECTUS domain. The original Sites callback URLs remain registered temporarily for rollback compatibility; the plugin and public listing use only the custom domain.

## v0.3.2 review-access notes

Adds a credential-only marketplace-review route backed by a high-entropy Sites-managed secret and a 24-hour session. The reviewer is mapped only to an isolated sample Gmail workspace. This removes Google unfamiliar-device verification from the SenderDeck sign-in path while preserving the standard Google and Microsoft sign-ins for normal users.

## Account-bound release gates

- [ ] DEVECTUS business identity is verified in the same OpenAI Platform organization used for submission.
- [ ] Submitter has Apps Management: Write permission.
- [ ] Google OAuth app is in production and approved for the requested Gmail scopes.
- [ ] Microsoft publisher verification is complete and the consent screen shows DEVECTUS as verified.
- [ ] Independent security review is complete and findings are resolved.
- [ ] Authorized DEVECTUS representative approves the privacy statement, terms, supported countries, and policy attestations.
- [x] Dedicated reviewer credentials work without an additional MFA, SMS, email-confirmation, or provider sign-in step.
- [ ] Portal-generated domain challenge token is stored as `OPENAI_APPS_CHALLENGE` and the challenge succeeds.
- [ ] All five positive and three negative tests pass against production.
