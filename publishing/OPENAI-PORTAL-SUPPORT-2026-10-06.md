# OpenAI portal blocks resubmission of rejected legacy MCP app

Prepared support report only. No email or support message has been sent.

Organisation: DEVECTUS. Project: DEVECTUS Plugins. Verified developer: DEVECTUS Pty Ltd.

- Plugin: SenderDeck by DEVECTUS
- Migrated plugin ID: plugin_asdk_app_6a87125f6b308191ac268739218eac27
- Associated app ID: asdk_app_6a87125f6b308191ac268739218eac27
- Rejected app version: asdk_app_v_6a98dbae80788191a9dfa7bc9dfcbe8f
- Rejected package release: pluginrel_4da6ad9574f88191938b016632b5f13e
- Package name: app-6a87125f6b308191ac268739218eac27
- Existing version: 0.3.2; corrected version prepared: 0.3.3
- MCP endpoint: https://senderdeck.devectus.com.au/api/mcp

The 6 October rejection requested re-running and correcting submitted test cases. The sample Gmail refresh token has been restored; the production implementation has been fixed and deployed. Live account listing, draft creation/inspection, search and message reading work with isolated sample data. Typecheck, build and all 61 tests pass. The revised package contains exactly five positive and three negative tests, the correct product icon and an updated walkthrough. No send is claimed or performed, and native ChatGPT mobile testing is not claimed.

Reproduction:

1. Open the existing plugin at https://platform.openai.com/plugins/manage/plugin_asdk_app_6a87125f6b308191ac268739218eac27.
2. Review status is Changes required, Publication is Not published, and MCP configuration is Unavailable.
3. Choose Upload plugin to make changes, select the verified Business — DEVECTUS identity and attach the corrected ZIP retaining the exact existing package name and MCP URL.
4. Upload fails with: **Keep the existing MCP connection** — **Publish the existing MCP app before updating its plugin ZIP.** The issue points to `.codex-plugin/plugin.json`.
5. The legacy rejected form still opens but is read-only: **Viewing the rejected version. Only draft versions can be edited.** No resubmit/create-draft control is present.
6. The migrated MCP panel reports Endpoint unavailable, Authentication unavailable, MCP key Not specified and Scan unavailable. Connect opens a dialog with an empty read-only MCP Server URL, disabled No Auth selector and Settings unavailable. Rescan is disabled.

Please repair the migrated MCP association and enable creation of a corrected review draft for this existing rejected, unpublished app, preserving its OAuth connection and verified endpoint. The upload requirement to publish the rejected version prevents following the requested resubmission process. A duplicate plugin is not desired.

The corrected ZIP and captured portal screenshot are available for upload by the account owner. Dedicated reviewer credentials remain in the secure submission form and are intentionally excluded from this report and the ZIP.
