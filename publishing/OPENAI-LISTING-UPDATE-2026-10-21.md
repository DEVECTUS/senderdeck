# OpenAI listing update attempt, 21 October 2026

The 0.4.1 package refreshes SenderDeck's email and brand conversation descriptions, includes both workflow skills and preserves the verified existing package name `app-6a87125f6b308191ac268739218eac27`. The maintained remote MCP endpoint remains `https://senderdeck.devectus.com.au/api/mcp`. The ZIP passed local package identity, version, skill-presence and listing text-length checks.

## Observed portal result

The [existing listing](https://platform.openai.com/plugins/manage/plugin_asdk_app_6a87125f6b308191ac268739218eac27) still displays metadata version 0.3.2, Changes required, Not published and MCP configuration Unavailable. Its current description remains email-only.

The portal now offers **Create draft from ZIP**. Using the existing **Business — DEVECTUS** publishing identity, the 0.4.1 ZIP upload was rejected with:

> Keep the existing MCP connection. The MCP URL must match the existing app. Restore its original URL and reupload.

The MCP panel shows **Endpoint unavailable**, **Authentication unavailable**, **MCP key Not specified** and **Scan unavailable**, with Rescan disabled. It does not expose the expected original URL. The previously downloaded rejected 0.3.2 release ZIP contains only a generated manifest and no MCP configuration, so it cannot establish a different URL to restore.

The source repository, hosted endpoint and refreshed package consistently use the current working HTTPS MCP URL. No alternate URL was guessed, existing connection removed, duplicate listing created, provider permission changed or review attestation accepted. No new metadata draft or successful directory update was confirmed.

## Required resolution

The existing migrated MCP registration needs its expected URL exposed or corrected by the portal owner/support before the package update can proceed. Preserve the existing listing and OAuth association. The updated ZIP is a prepared release asset; it is not evidence of successful import, review or publication.

After the association is repaired, upload the current complete directory ZIP, confirm the imported copy and skills, inspect automated findings and perform only review steps whose requirements have actually been verified. The old email demonstration is not evidence of live social access or native mobile testing.

No support message or email was sent. The screenshot of the unavailable MCP panel is retained privately under `C:\Temp`.
