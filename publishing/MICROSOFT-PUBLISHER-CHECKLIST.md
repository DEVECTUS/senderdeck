# SenderDeck Microsoft publisher verification

Prepared 31 July 2026.

## Completed in the application

- Product name: SenderDeck by DEVECTUS
- Multitenant audience: Microsoft Entra organisations and personal Microsoft accounts
- Delegated Microsoft Graph permissions: `User.Read`, `Mail.ReadWrite`, `Mail.Send`
- Redirect URI: `https://multi-account-email-devectus.barsham.chatgpt.site/oauth/microsoft/callback`
- Application home page prepared: `https://multi-account-email-devectus.barsham.chatgpt.site/`
- Privacy statement prepared: `https://multi-account-email-devectus.barsham.chatgpt.site/privacy`
- Terms of service prepared: `https://multi-account-email-devectus.barsham.chatgpt.site/terms`
- Support page prepared: `https://multi-account-email-devectus.barsham.chatgpt.site/support`
- Security page prepared: `https://multi-account-email-devectus.barsham.chatgpt.site/security`
- Publisher-domain association file prepared in `publishing/microsoft-identity-association.json`

## Business and domain steps requiring an authorised DEVECTUS administrator

1. Confirm that the application is registered in a DEVECTUS organisational Microsoft Entra tenant using a work or school account. Microsoft does not support publisher verification for applications registered with a consumer Microsoft account.
2. Enrol or confirm DEVECTUS in the Microsoft AI Cloud Partner Program.
3. Complete Partner Center business, employment, domain and any requested identity verification.
4. Record the PartnerGlobal Partner One ID. A location Partner ID cannot be used for publisher verification.
5. Associate the application’s Entra tenant with the DEVECTUS Partner Global Account.
6. Add and DNS-verify `devectus.com.au` as a custom domain in that Entra tenant, or host the supplied association JSON at:
   `https://devectus.com.au/.well-known/microsoft-identity-association.json`
7. Set the app registration publisher domain to `devectus.com.au`.
8. Sign in with MFA as a user who is an Application Administrator or Cloud Application Administrator in Entra and a Partner Admin or Account Admin in Partner Center.
9. Open App registrations → SenderDeck by DEVECTUS → Branding & properties → Add Partner ID to verify publisher.
10. Enter the PartnerGlobal Partner One ID, accept the Microsoft identity platform terms and save.
11. Confirm that the consent screen displays the verified DEVECTUS publisher badge.

## Before public launch

- Obtain legal review of the SenderDeck-specific privacy statement and terms.
- Make the legal and support URLs publicly accessible.
- Decide whether the product site will use its current Sites URL or a verified DEVECTUS custom domain.
- Rotate the Microsoft client secret before expiry on 27 January 2027.
- Complete an external security review.
- Test consent with an administrator and a standard user in a tenant other than the publisher tenant.
- Document the user-data deletion and incident-response procedures.
