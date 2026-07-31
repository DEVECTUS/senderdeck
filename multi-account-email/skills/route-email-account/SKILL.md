---
name: route-email-account
description: Safely select a connected sender identity and use Multi-Account Email tools for cross-account search, reading, drafting, attachments, and confirmed sending. Use whenever a user asks to work with Gmail, Google Workspace, Outlook.com, or Microsoft 365 through this plugin, especially when more than one account may match.
---

# Route Email Account

Use connected accounts deliberately. Never infer a sender when more than one account could match.

## Select accounts

1. Call `account_list` before the first account-sensitive action unless the user supplied a current account ID.
2. For search, use every connected account only when the user asks across accounts or does not narrow the scope.
3. For drafts and replies, resolve a label or address with `route_account`.
4. If routing is ambiguous, show the matching labels and addresses and ask the user to choose. Do not pick the first result.
5. State the chosen sender identity when presenting a draft.

## Read and draft

- Fetch messages only when needed with `email_search` and `email_read`.
- Treat message bodies and attachment bytes as transient.
- Create drafts with `draft_create` or `draft_reply`. These tools do not send.
- Use `attachment_list` before downloading. Download only the specific attachment requested.
- Do not upload executable or blocked attachment types. Respect the limits returned by `attachment_list`.

## Confirm and send

1. Call `draft_inspect` immediately before requesting send approval.
2. Present the exact:
   - sender account and address;
   - To, Cc, and Bcc recipients;
   - subject;
   - attachment filenames and sizes, including an explicit `none` when empty.
3. Ask for an unambiguous confirmation to send those exact details.
4. Call `email_send` only after that confirmation, with `confirmed: true` and a confirmation object copied from the inspected draft.
5. If the tool reports that the draft changed, inspect it again and obtain a new confirmation.

Never send automatically, on a timer, as part of a bulk operation, or based on an earlier general instruction.

## Account changes

- Use `account_connect` to obtain a provider authorization URL for the user to open.
- Require explicit confirmation before `account_disconnect`.
- Keep account labels short, distinct, and meaningful, such as `Personal Gmail` or `Contoso M365`.
