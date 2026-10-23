# Username and password sign-in

SenderDeck 0.4.16 lets an existing user add a username and password at `/settings/login` and use them at `/signin`. The credential belongs to the current SenderDeck user ID, so password login accesses the same mailbox records, customer memberships and brand permissions. A username never grants access through an email-address match.

Sign in with Google or Microsoft within 15 minutes before creating the first password. New users establish their account through a provider once; public password-only account registration is not provided. Updating credentials requires the existing SenderDeck password. Other browser sessions are revoked after a successful credential change. Existing MCP OAuth grants are unaffected.

Passwords require at least 15 characters, with a 1024-byte maximum. Store passwords in a password manager; they cannot be retrieved. Hashes use salted scrypt (N=16384, r=8, p=5), with constant-time comparison, generic failed-login errors, HTTPS-only same-origin submissions, bounded bodies, atomic per-username and per-IP attempt limits, and checks against retired accounts. Rate-limit rows contain hashed dimensions and expire after 15 minutes. Password login sessions expire after 24 hours.

## Reviewer setup

1. Sign into SenderDeck using the dedicated sample provider account, not a personal or company production account.
2. Open `/settings/login`, confirm the account shown, and set a dedicated username and long unique password.
3. Sign out, then test the username and password at `/signin`. Confirm that the expected sample mailbox and fixtures are present.
4. Enter that SenderDeck username/password and the `/signin` URL into the secure OpenAI review form. Never enter the provider password into the review form.

OAuth authorisation resumes through its original relative return path after password sign-in. Reviewers use the same authentication/session and permission checks as ordinary users. The older `/review-access` route remains for compatibility; this feature does not rotate, migrate or expose its separate environment credentials.

No reviewer username or password is embedded in source or release packages. Password recovery and a public registration flow are not part of this release; preserve access to the provider sign-in and password manager.

## Hosting-owner provisioning

The hosting owner can create a password login for one already verified provider identity using a short-lived `PASSWORD_PROVISION_PLAN` secret. It fixes the exact user ID, email, username, salted password hash, expiry (at most one hour), and a hash of a separate random bearer. `/api/password-login/provision` accepts only an empty JSON object over HTTPS with that bearer and no browser Origin header. It verifies the identity, rejects retired users, and cannot overwrite an existing username or credential. Matching repeats are idempotent. No password is sent to or returned by this maintenance endpoint.

Remove the plan immediately after provisioning and deploy the saved version with the new environment revision. With no plan configured, the endpoint returns 404. The resulting credential is an ordinary database password login; there is no privileged reviewer session or permission bypass.
