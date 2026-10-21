# Retire one duplicate legacy account

OpenAI hosting sign-in remains supported. An individually retired user is denied
browser/session and MCP access by a durable hashed marker in `social_runtime`.
Markers are access-control records and must never be expired as runtime leases.

The optional hosting maintenance endpoint is unavailable unless the site owner
configures `ACCOUNT_RETIREMENT_PLAN` as a secret. It accepts one exact plan with
`sourceUserId`, `targetUserId`, `sourceBrandId`, `targetBrandId`, `tokenHash` and
`expiresAt`. The expiry must be within one hour. `tokenHash` is the base64url
SHA-256 of a separately generated random bearer of at least 32 random bytes.
Never save the bearer, plan or production identifiers in source or logs.

Use server-to-server HTTPS POST requests with JSON and that bearer:

1. `/api/account-retirement/preview`, body `{}`. Inspect the exact mailbox
   removals, retained identity and social connections before applying.
2. `/api/account-retirement/apply`, body containing only `confirmed: true` and
   the returned `revision`. A changed plan or metadata requires a fresh preview.
3. Verify database ownership, retained connections, and rejected legacy access.
4. Remove the temporary hosting secret and deploy the saved version again to
   remove it from the running environment. A completed plan cannot run twice.

The source must have no Google/Microsoft sign-in, exactly one solely owned
customer and brand, and a mailbox with the same provider subject as the retained
user's verified identity. The target must own a separate empty brand with an
identical policy. Other members, additional source brands, linked email assets,
in-progress sending and uncertain deliveries block the operation.

The D1 batch checks the preview metadata again inside the transaction, then
moves existing social connections and activity, invalidates pending approvals,
deletes only source mailbox credentials/workspace records and OAuth sessions,
and records access revocation and an operator audit. The retained mailbox
credentials and unrelated customers are unchanged. No provider permission is
revoked and no message is sent. AI clients using the retired identity must
reconnect through the retained Google/Microsoft sign-in.
