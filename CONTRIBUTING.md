# Contributing to SenderDeck

SenderDeck is an MIT-licensed project maintained by DEVECTUS. Contributions to code, documentation, accessibility, provider compatibility and reproducible bug reports are welcome. Start with the [README](README.md) and [architecture](docs/ARCHITECTURE.md) so the proposed change matches the implemented capabilities.

## Choose the right channel

Use [GitHub issues](https://github.com/DEVECTUS/senderdeck/issues) for bugs and feature proposals. Describe the problem and intended outcome before a large implementation. Keep public reports free of message bodies, attachments, tokens, account addresses, customer identifiers and reviewer credentials. Report vulnerabilities and privacy incidents privately using [SECURITY.md](SECURITY.md).

Include the affected release, AI client, provider/channel, sanitised reproduction steps, expected result and actual result. An unavailable provider grant or pending approval is different from an empty inbox. Explain the observed coverage rather than assuming all accounts are affected.

## Development

Use Node.js 22.13 or later and npm. Install the locked dependencies with `npm ci`, then run:

```text
npm run typecheck
npm test
```

`npm test` builds the application and runs the rendered-page and unit suites. Provider tests use mocked APIs and the social suite uses an in-memory SQLite database. Do not run tests against real customer conversations or send live messages as a routine check.

Use `npm run dev` for local UI work. `.env.example` lists runtime variables; supply your own local values using the Cloudflare/Vite environment and local DB bindings. Never commit populated environment files. The production service uses Sites hosting and D1; deployment is an operator action, separate from contributing a pull request. See the runtime configuration in [README.md](README.md) and [social activation requirements](docs/SOCIAL-ACTIVATION.md).

## Change boundaries

- Keep existing email tool contracts compatible. Attribute every operation to the selected account; do not guess sender aliases or substitute an account after an error.
- Authorise every social customer, brand, account and thread in backend code. Prompt instructions and caller-supplied IDs are not an access boundary.
- Preserve exact draft inspection and separate human send approval. Do not introduce automatic sending or retries after uncertain delivery.
- Keep provider content untrusted, tokens encrypted and private data out of logs and audits. Document actual storage and expiry behaviour.
- Use official provider APIs. Mark capabilities unavailable when approval, permissions, history, attachments or live validation are missing. Do not scrape restricted endpoints.
- Keep provider credentials, consent, app review, subscriptions and hosted scheduler activation outside an ordinary code contribution. Mocks do not establish live provider coverage.
- Write documentation in Australian English and use the word "section" in full.

When changing `db/schema.ts`, run `npm run db:generate` and commit the new migration and Drizzle metadata. Do not edit migrations that have already been released. A description or UI copy edit does not need a database migration.

## Pull requests

Describe the concrete problem and resulting behaviour, include relevant validation and identify provider activation or compatibility limits. Update user-facing descriptions when scope or retention changes. Prefer focused changes and meaningful regression tests over tests that mirror implementation details. Use the pull request template to show what was checked.

Contributions are reviewed by maintainers. Submitting a contribution means it is offered under the repository's existing MIT licence. No separate contribution agreement is currently required. Follow the [community expectations](CODE_OF_CONDUCT.md).
