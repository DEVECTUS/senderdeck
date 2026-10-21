# Security reporting

Report suspected vulnerabilities privately to **support@devectus.com.au** with the subject **SenderDeck security report**. For a suspected privacy incident, contact **privacy@devectus.com.au**. These are the same channels published on the [hosted security page](https://senderdeck.devectus.com.au/security).

Include the affected version or commit, feature/URL, reproducible steps using synthetic data, potential impact and a safe way to contact you. Do not include passwords, OAuth tokens, authentication codes, private message bodies, attachments or other people's personal information in a public issue or pull request. If a secret was exposed, describe where and when rather than repeating it.

Use accounts and test assets you own or are authorised to test. Do not access another customer's data, disrupt service, attempt social engineering or send messages to other people to demonstrate a flaw. Coordinate sensitive disclosure with the maintainers before publishing exploit details.

The latest release on the default branch is the primary maintenance target. Report issues affecting older versions too, with the exact version and reproduction. No fixed response time, bug bounty, external audit certification or support SLA is promised by this policy.

## Boundaries worth reviewing

Review account and customer isolation, OAuth state/session handling, token encryption, provider asset validation, raw webhook signatures, pagination/coverage claims, retention/deletion and exact draft approval. The MIT licence does not grant access to the hosted service, provider credentials or customer data.

The social module remains gated pending provider and operational validation. A configuration flag or passing mock test is not proof of authorised live access. See [ARCHITECTURE.md](docs/ARCHITECTURE.md) and [SOCIAL-ACTIVATION.md](docs/SOCIAL-ACTIVATION.md) for implementation and activation limits.
