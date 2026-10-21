# Listing source and publication status

Updated 21 October 2026 for the 0.4.1 description and documentation patch.

## Maintained descriptions

The source of the packaged Codex listing is `plugins/senderdeck/.codex-plugin/plugin.json`. The Claude package and marketplace mirror its product scope. `chatgpt-app-submission.json` and the two publishing plans carry the same current short and long descriptions. `prepare-openai-package.mjs` preserves that copy while retaining the existing migrated package identity.

The short description is **Email & brand conversations**. The long description explains the deployed email/workspace features, separate exact reply approvals, social retention and current provider gates. It does not imply active Facebook/Instagram monitoring or LinkedIn access.

## Distribution is separate from provider activation

The hosted website and remote MCP server are deployed separately from plugin packages and directory review. A GitHub release or website deployment does not update an already installed skill package, approve a directory submission, grant provider access or activate monitoring.

For a repository installation, update to the latest released package and reload the client connection to obtain the current metadata and skills. The remote MCP URL remains `https://senderdeck.devectus.com.au/api/mcp`.

For the OpenAI directory, metadata/skill changes require a new complete ZIP uploaded to the existing plugin, with review/publication handled by the portal. Keep the existing package identity and MCP connection. See [official submission guidance](https://developers.openai.com/plugins/deploy/submission). Do not create a duplicate plugin to work around an unavailable migrated connection.

Historical portal evidence is recorded in `OPENAI-PORTAL-SUPPORT-2026-10-06.md`. It described a rejected, unpublished legacy version and a blocked package update. That dated report must not be treated as a current successful submission or silently overwritten. Any new portal attempt needs its observed result recorded separately.

The [21 October 2026 attempt](OPENAI-LISTING-UPDATE-2026-10-21.md) rejected the 0.4.1 package because its MCP URL must match the existing app, while showing the existing endpoint as unavailable. The directory description therefore remains unchanged pending repair of that registration.

## Review boundaries

The existing demo and mailbox fixtures cover email workflows. They do not demonstrate live social access or native mobile testing. Before requesting review of activated social capabilities, update the demonstration and relevant test cases using verified owner-authorised assets. Never attest to provider permissions, tests, mobile support, terms or publication states that have not actually been verified.

Reviewer credentials belong only in the portal's secure fields. No support message, email, provider consent or legally binding attestation is authorised merely by preparing the package.
