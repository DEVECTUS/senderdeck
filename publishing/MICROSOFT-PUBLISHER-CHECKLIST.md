# SenderDeck Microsoft publisher verification

Prepared 31 July 2026.

## Completed in the application

- Product name: SenderDeck by DEVECTUS
- DEVECTUS tenant ID: `5e9ed388-da7a-49ac-86b7-e94355b4507a`
- Application (client) ID: `78ceb14c-c25a-4105-b703-84426acf7f1f`
- Multitenant audience: Microsoft Entra organisations and personal Microsoft accounts
- Delegated Microsoft Graph permissions: `User.Read`, `Mail.ReadWrite`, `Mail.Send`
- Redirect URI: `https://senderdeck.devectus.com.au/oauth/microsoft/callback`
- Application home page: `https://senderdeck.devectus.com.au/`
- Privacy statement: `https://senderdeck.devectus.com.au/privacy`
- Terms of service: `https://senderdeck.devectus.com.au/terms`
- Support page: `https://senderdeck.devectus.com.au/support`
- Security page: `https://senderdeck.devectus.com.au/security`
- Publisher-domain association file prepared in `publishing/microsoft-identity-association.json`
- Microsoft Publisher Agreement and Microsoft AI Cloud Partner Program Agreement accepted by the authorised DEVECTUS representative
- Partner Center legal-business verification submitted; status was `Pending` on 31 July 2026
- New client credential stored only in Sites-managed secrets and deployed privately

## Business and domain steps requiring an authorised DEVECTUS administrator

1. Complete any business, employment, domain, or identity checks requested while Partner Center verification is pending.
2. Record the PartnerGlobal Partner One ID. A location Partner ID cannot be used for publisher verification.
3. Associate the application’s Entra tenant with the DEVECTUS Partner Global Account.
4. Add and DNS-verify `devectus.com.au` as a custom domain in that Entra tenant, or host the supplied association JSON at:
   `https://devectus.com.au/.well-known/microsoft-identity-association.json`
5. Set the app registration publisher domain to `devectus.com.au`.
6. Sign in with MFA as a user who is an Application Administrator or Cloud Application Administrator in Entra and a Partner Admin or Account Admin in Partner Center.
7. Open App registrations → SenderDeck by DEVECTUS → Branding & properties → Add Partner ID to verify publisher.
8. Enter the PartnerGlobal Partner One ID, accept the Microsoft identity platform terms and save.
9. Confirm that the consent screen displays the verified DEVECTUS publisher badge.

## Before public launch

- Obtain legal review of the SenderDeck-specific privacy statement and terms.
- Make the legal and support URLs publicly accessible.
- Keep the original Sites callback URI registered temporarily for rollback compatibility.
- Rotate the Microsoft client secret before expiry on 27 January 2027.
- Complete an external security review.
- Test consent with an administrator and a standard user in a tenant other than the publisher tenant.
- Document the user-data deletion and incident-response procedures.
