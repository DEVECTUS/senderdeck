# SenderDeck WhatsApp review instructions

Prepared 31 October 2026 for app 2213673322866707, submission 2213804016186971.

SenderDeck is free, open-source software. The submitted permission demonstrations are attached to the existing review. These instructions are ready for a follow-up request; the submitted review has not been edited.

## Access and test setup

Open https://senderdeck.devectus.com.au/conversations. Use only a dedicated reviewer identity provisioned for the **SenderDeck WhatsApp Review** brand. Reviewer credentials are not included here. No reviewer login has yet been provisioned or verified for this WhatsApp workspace. If interactive access is requested, the owner must arrange that isolated identity and provide credentials through Meta's secure review fields. Do not use the owner's login or another application's review account.

Test sender: **+1 555 168 1965**, Test Messaging Account **957296627055310**, phone number ID **1433044106557621**. The existing consenting test recipient is **+61 493 091 392**. A reviewer cannot substitute a different recipient without first arranging its Meta test-recipient authorisation and exact SenderDeck scope.

The previous test-send allowance has expired. Before an assisted live test, the operator must validate the test account's current permissions/subscription, enable a time-limited allowance for only this brand, sender and consenting recipient, and verify the reviewer membership. No real customer workspace, real-number connection or general sending should be enabled for review. No password, access token or verification code belongs in this document.

## WhatsApp management demonstration

1. Open **Conversations**, select **SenderDeck WhatsApp Review**, then **Connections**.
2. Select the connected WhatsApp test account and inspect its displayed access and validation results. The operator should refresh validation before the session.
3. Confirm that the selected phone belongs to the authorised WhatsApp Business Account and the app has its required webhook subscription. These are the account discovery, verification and subscription functions demonstrated by `whatsapp_business_management`.
4. Refer to the submitted management video for the demonstrated connection and Meta WhatsApp Manager views. Meta's template manager is a separate Meta interface; SenderDeck does not create templates, register/deregister phones or migrate phone registrations.

## WhatsApp messaging and approval demonstration

1. From the authorised recipient's WhatsApp chat, send a fresh, harmless test message to **+1 555 168 1965**. This creates the 24-hour reply window. A received inbound message does not trigger an automatic response.
2. In SenderDeck, choose **SenderDeck WhatsApp Review → Inbox**, select the WhatsApp test account, then **Check messages**. Open the new conversation.
3. Review the messages and the **History has gaps** notice. Only retained, signed webhook messages are available; older or missed messages cannot be retrieved. The acknowledgement must reflect the reviewer's actual understanding of that limitation.
4. In **Reply text**, enter the approved test wording:

   > SenderDeck test received. This reply was reviewed and approved by Barsham before sending.

   This wording is for the owner-assisted test: Barsham must actually review and approve it. Do not claim Barsham approved an independently changed reply.

5. Check the displayed WhatsApp history acknowledgement after reading it, then click **Save draft**. Saving a draft does not send anything.
6. Click **Inspect exact reply**. Check the brand, sender/account, recipient, text, attachments (**None**) and revision. Resolve any displayed blocker; a disabled send button is not a successful send.
7. Only after Barsham approves that exact inspected reply, type the displayed confirmation and click **Approve and send now** within five minutes. Changed history, expired approval or changed wording requires a fresh inspection and approval.
8. Verify **Reply sent and recorded** and receipt in the recipient's WhatsApp chat. Record the receipt; do not resend an uncertain delivery. If no receipt appears, inspect the native chat and activity before any recovery.

Templates, outgoing media, cold outreach and unattended replies are unavailable in this demonstration. The submitted messaging video already shows an actual test reply received in WhatsApp Web; it does not claim a phone screen recording.

## After Meta grants Advanced Access

Approval does not itself connect a real number. The owner must start **Connect existing WhatsApp Business app** for DEVECTUS and **+61 485 040 099**, complete Meta's Coexistence consent, and verify eligibility. Stop if Meta asks to remove, delete or migrate the phone-app account. Keep Twilio voice/SMS configuration intact.

Before enabling real-brand sending, verify: current permissions and account membership; recent recurring maintenance; signed inbound delivery; sync/history-sharing state; phone-app message echoes without duplicates; a freshly approved reply; and continued phone-app, voice and SMS operation. Disconnect/deletion behaviour must match the documented scope without deregistering the phone.
