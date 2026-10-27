# Public-authority data requests

DEVECTUS PTY LTD, Australia · Proposed procedure v0.1 · 27 October 2026

**Status: prepared for adoption; not yet an operating-policy attestation.** The owner nominated themselves as primary privacy officer in chat on 27 October 2026. The request-records folder and blank templates are now in `DEVECTUS Leadership > Business > Policies > DEVECTUS - Restricted Authority Requests`, following the owner's explicit approval of the shared-drive transfer. DEVECTUS Leadership owns the package. The folder's sharing UI lists only barsham.sotoudeh@devectus.com.au and Barsham@gmail.com, both Managers, with General access Restricted. Future shared-drive membership changes can change inherited access. The owner has attested to mailbox monitoring, MFA, recovery and an unauthorised-account access check; these attestations are not independent technical verification. Backup cover, a confirmed urgent legal-referral arrangement, completed legal review, audit verification and formal adoption remain pending. Follow the [adoption checklist and exercise](ADOPTION-AND-EXERCISE.md) before describing all four controls as operational to Meta.

## Purpose and responsibility

This procedure covers requests by police, regulators, courts, intelligence bodies and other public authorities for personal information held or controlled by DEVECTUS, including SenderDeck Meta data. It covers informal, compulsory, domestic, overseas, emergency and preservation requests. It is separate from an individual's access/deletion request and the [security incident channel](../../SECURITY.md); misdirected requests must be routed appropriately.

The primary privacy officer is **the DEVECTUS owner, as nominated on 27 October 2026**. They own intake, deadlines, identity checks, legal referral, approval and records. A technical custodian performs only the authorised search/export/preservation steps. A solicitor assesses applicable law, instrument validity, secrecy, preservation and challenge options. One person may hold business and technical roles; do not invent independent approval. Seek an independent legal review for a proposed disclosure. If the owner is unavailable, only an appointed backup may take over; establish cover during adoption.

This is an operational draft for Australian solicitor review, not an opinion that a particular demand is valid or that any particular Privacy Act exemption applies to DEVECTUS. Counsel must assess applicability and the specific request. Internal approvals must not cause unlawful delay or disobedience of a binding deadline or order.

## Staff quick instructions

1. Do not send data, confirm whether an account/person exists, click an unverified upload link, or promise a result.
2. Privately alert the primary privacy officer immediately; urgency, a deadline or a claimed secrecy restriction must be highlighted.
3. Preserve the original request securely. Do not put real requests, documents, identifiers or legal advice in Git, public issues, broad chat channels or AI conversations.
4. Do not delete or alter potentially relevant records to avoid a request. Do not perform a broad export or change normal retention yourself.
5. Use the case reference, not private case details, in ordinary task tracking. Contact the verified backup if the primary is unavailable. Escalate emergencies immediately.

The published privacy contact is `privacy@devectus.com.au`. Adoption must verify who monitors it and how that person reaches the owner/backup. Nothing here changes email forwarding, mailbox permissions or monitoring automatically.

## 1. Receive, log and authenticate

- Give the request a unique case ID, for example `PAR-YYYY-NNN`; record actual receipt time, timezone, claimed deadline and responsible person in a **restricted** copy of the [register template](templates/authority-request-register.csv). A blank template is not proof of complete historical records.
- Create a restricted [case record](templates/authority-request-case.md). Preserve the original request, delivery metadata, attachments and any later amendments without overwriting the original. Isolate suspicious files and involve security staff as appropriate.
- Independently verify the officer/agency through an official directory or established verified contact, not just the phone number, email domain or link in the request. Record the verification method and outcome. Obtain the written request/instrument and relevant reference where appropriate; do not insist on a warrant if another lawful basis can apply.
- Route any secrecy or non-notification condition to counsel before acknowledging, forwarding or notifying others. Restrict knowledge to those legally permitted and necessary. Record only what may lawfully be recorded.
- Same-business-day triage is a proposed internal target, not a statutory deadline. An earlier legal deadline or immediate danger takes priority; assign a specific next action and time for every open case.

## 2. Review legality and scope

Before producing data, the privacy officer obtains a written legal assessment addressing: requesting body's powers and identity; instrument and service validity; entity/addressee; jurisdiction; whether compliance is required, permitted or unsupported; exact people/accounts, fields and dates; deadline; secrecy/notification; privilege/confidentiality; applicable privacy obligations; provider/customer contracts; and preservation duties. Record the legal basis and reasoning, not just “legal approved”. Keep potentially privileged advice separately with solicitor-directed access; copying a lawyer does not itself establish privilege.

For overseas demands, assess Australian disclosure and cross-border requirements as well as the claimed foreign power. An overseas demand is not automatically invalid or automatically sufficient. For requests about provider-held records, determine what DEVECTUS actually holds/controls and what the provider must handle; never claim authority to release provider data or grant investigators direct mailbox, database or API access.

Counsel's decision must distinguish **compulsory compliance** from **a lawful discretionary disclosure**. The owner separately decides any discretionary disclosure with its justification recorded. While authority is unresolved, do not volunteer data; seek clarification and urgent advice without missing an applicable binding obligation.

## 3. Clarify, narrow or challenge where appropriate

Assess every request for defects, excessive breadth, wrong identity/entity, missing specificity, improper service, lack of power, secrecy issues, disproportionate data demands and available lawful objection/review grounds.

Where warranted and legally available, ask counsel to seek clarification, narrow accounts/date ranges/fields, request an extension, object, negotiate safeguards or bring a formal challenge. Record the issue, advice, chosen action, correspondence, response, outcome and reasons if a challenge is unavailable or not pursued. An informal objection does **not** itself suspend an order or deadline; counsel must confirm any stay/extension. Comply with final binding requirements as advised. Do not promise to challenge every demand irrespective of legal grounds.

## 4. Preserve carefully; minimise collection and disclosure

SenderDeck has **no implemented case-specific legal-hold feature**. Its snapshots, drafts, queued content and retained social messages can expire; physical cleanup depends on maintenance. A preservation request therefore requires immediate legal/technical assessment. Never claim a hold is active until a custodian has implemented and verified the precise, lawful scope and recorded its limits. Do not silently disable deletion globally or extend every customer's retention. Any necessary runtime/storage change needs its own scoped authorisation. If implementation or preservation may miss a deadline, escalate the limitation immediately rather than promise compliance. Release a hold only on a documented lawful decision.

The custodian prepares a field-by-field disclosure manifest: exact source/account, fields, date interval/timezone, selection reason, exclusions, redactions and item count. Search only the approved scope. Keep unrelated brands, people's conversations and non-responsive records out. Provide relevant extracts rather than whole databases when lawful and sufficient. Check attachments, nested fields and hidden document metadata; simple visual covering is not irreversible redaction. Avoid collecting more data merely to make an export easier.

Tokens, passwords and encryption keys are not routine response material. Any demand involving credentials or surveillance/system access must return to counsel and the owner for separate review; do not modify the service or provide access through this process alone. State accurately when data is unavailable, expired, not held or only partially retained. Do not fetch entire provider histories to fill a gap unless specifically lawful and authorised.

## 5. Approve and transfer

Before release, record the legal decision, scope/manifest, minimisation check, exact recipient, transmission channel, owner approval, reviewer and date. Obtain independent review where practicable, including legal review for a sole-operator disclosure; document any unavailable review and urgent lawful decision. Do not let internal review requirements defeat a binding legal deadline.

Verify the recipient and transfer destination independently. Use an approved encrypted, access-restricted transfer with a verified recipient and appropriate expiry; send any access secret through a separate verified channel. Do not create a public link. Record package version/hash, item count, recipient, transfer time and receipt confirmation. Notification of customers, affected people or providers occurs only after counsel determines it is permitted/required and the owner authorises the exact communication. Do not publish or confirm a case subject to secrecy restrictions.

If an incorrect or excessive disclosure occurs, stop further transfer, restrict/revoke access where possible, preserve evidence and activate incident response with counsel. Assess any applicable notification obligations; do not quietly delete the record or assume recall succeeded.

## 6. Close, retain and review

Record the final disposition (including no disclosure), legal reasoning, challenge result, data categories actually disclosed, decision makers, retention/hold status and any required follow-up. Maintain a minimal register separate from restricted case documents and legal advice. Limit case access to named necessary people; enable access history and review permissions. Never place operational case records in this repository.

Counsel and the owner set a justified case-specific retention/review date, including any applicable recordkeeping requirement, dispute period or secrecy restriction. No universal statutory retention term is asserted here. Review at that date, preserve if legally required, otherwise securely remove unnecessary copies and document disposal. Account for controlled copies and backup limitations. Do not promise immediate deletion from third-party backups without verification.

After each case, review errors and procedure gaps. Review this procedure at least annually and after a material legal/product change. Run and record a synthetic exercise before initial activation and after a material workflow change; no automatic scheduler is created by this policy.

## Evidence for Meta's four controls

| Meta control | Operating evidence needed |
| --- | --- |
| Review legality | Adopted review requirement, responsible owner, accessible solicitor-referral path, completed legal-decision section in real cases or a recorded staff exercise. |
| Challenge unlawful requests | Adopted objection/escalation route; records of clarification/challenge decisions and outcomes, including reasoned decisions not to challenge. |
| Data minimisation | Completed scope/manifest and reviewer checks, exclusions/redactions, verified transfer instructions. |
| Document requests and responses | Restricted register/case storage with verified access controls; original request, correspondence, reasoning, decision makers, transfer/disposal evidence. |

Draft files alone do not establish implementation. Until the [activation checklist](ADOPTION-AND-EXERCISE.md) is completed, leave the Meta process answer pending; do not mark all four merely because this document exists. Owner confirmation of no past disclosure remains a separate historical answer.

## Sources and implementation context

Official OAIC sources consulted 27 October 2026:

- [APP 6 guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-6-app-6-use-or-disclosure-of-personal-information): assess a lawful disclosure basis; minimise enforcement-related disclosures; APP 6.5 requires a written note for APP 6.2(e) disclosures, subject to legal recording prohibitions.
- [APP 8 guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information): cross-border disclosure needs its own analysis; foreign compulsion does not generally displace APPs 6 and 8 for acts in Australia.
- [APP 11 guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information): safeguard held information and assess necessary retention versus destruction/de-identification, including legally required retention.

DEVECTUS should have an Australian solicitor review application of these principles and the final procedure. The detailed routing, roles, approval sequence, templates and exercise are proposed DEVECTUS operating controls, not legal requirements attributed to OAIC.

For actual SenderDeck storage limits see [technical data inventory](../HOSTED-MONITORING.md#technical-data-inventory-for-review) and [WhatsApp retention and coverage](../WHATSAPP-BUSINESS.md). This procedure does not change the public privacy statement, application access, retention settings or provider permissions.
