# Google and Microsoft sign-in permissions

24 October 2026.

## Application change

Previously `/auth/google/start` and `/auth/microsoft/start` requested mailbox scopes and saved a mailbox connection at sign-in. Sign-in now requests only Google `openid email`, or Microsoft `openid profile email User.Read`. Microsoft uses User.Read for its existing Graph `/me` identity lookup, preserving the provider IDs used by current accounts. Neither sign-in requests offline access or persists provider tokens. Existing identities, workspace ownership and mailbox credentials are preserved. New users connect mailboxes separately in Settings.

Google sign-in uses `access_type=online`, `include_granted_scopes=false` and `prompt=select_account`. Mailbox connection keeps its separate Gmail scopes, offline access and consent prompt. Microsoft authorization-code exchange uses the scopes of the selected flow rather than expanding identity sign-in to mail access. Microsoft mailbox connection also explicitly requests User.Read for its Graph profile lookup.

## Provider configuration still required

The supplied Google screenshot establishes that the observed authorization flow showed an unverified testing app warning. It does not establish the current console configuration. The other screenshot is Google's ordinary returning-user confirmation. App branding and domain text are controlled by Google, not the website.

For the actual Google Cloud project behind the hosted client ID, inspect Google Auth Platform → Branding, Audience, Data Access and Verification Center. Set the accurate SenderDeck product name, support email, homepage, privacy/terms URLs and verified owned domain. Production Gmail access requires production publication and approval for the exact requested Gmail scopes; publishing alone does not remove restricted-scope verification requirements. Complete any security assessment Google requires for server-side restricted Gmail access. Basic identity-only sign-in does not require sensitive/restricted scopes, but its displayed branding still depends on provider verification.

For Microsoft, inspect the existing application `78ceb14c-c25a-4105-b703-84426acf7f1f` in tenant `5e9ed388-da7a-49ac-86b7-e94355b4507a`, its publisher domain, Branding & properties, and Partner Center business verification. The saved July checklist is historical, not a live status check. Finish business verification and associate the PartnerGlobal Partner One ID to obtain the verified publisher badge. Domain association alone does not establish publisher verification. Tenant admin-consent policies can still require administrator approval even after verification. Follow [the existing Microsoft checklist](MICROSOFT-PUBLISHER-CHECKLIST.md).

## Validation boundaries

Regression tests exercise both start/callback flows with SQLite and mocked provider responses: identity-only scopes, matching Microsoft token-exchange scopes, unchanged saved mailbox credentials, no automatic mailbox connection, existing account ownership, browser binding, one-use state and retained mailbox permissions. Live provider console status and real Google/Microsoft consent completion must be checked separately; automated provider mocks do not establish a warning-free live consent screen.

References: [Google app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), [Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies), [Google authorization parameters](https://developers.google.com/identity/protocols/oauth2/web-server), [Microsoft Graph identity permissions](https://learn.microsoft.com/en-us/graph/api/user-get?view=graph-rest-1.0), [Microsoft publisher domains](https://learn.microsoft.com/en-us/entra/identity-platform/howto-configure-publisher-domain), [Microsoft publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview).
