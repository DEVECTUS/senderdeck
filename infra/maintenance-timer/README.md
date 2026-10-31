# SenderDeck cloud maintenance timer

A dedicated Cloudflare Worker invokes SenderDeck maintenance every ten minutes without a PC, browser, agent run or GitHub scheduler. Only the timer is deployed into the owner's confirmed DEVECTUS Cloudflare account. The main application stays on Sites.

The timer calls only `https://senderdeck.devectus.com.au/api/social/maintenance/cloud`, using its `MAINTENANCE_TOKEN` secret. The application verifies the independent `SOCIAL_CLOUD_MAINTENANCE_TOKEN`. Neither token can be substituted for the existing GitHub/PC maintenance token. The timer has no customer/provider credentials, incoming public URL, data storage or messaging tool. Requests never follow redirects. A successful result requires a validated receipt with `source:cloud_cron`.

Cloudflare Cron runs at minutes3,13,23,33,43,53 UTC. This is managed infrastructure, subject to Cloudflare availability; it removes the PC/GitHub scheduling dependency, without promising perfect delivery. SenderDeck retains its twenty-minute freshness threshold and GitHub fallback. A stalled run retains existing lease/uncertain-completion safeguards. Confirmed busy leases retry twice with30/60second waits; other errors fail visibly for investigation/next scheduled execution.

## Deployment through SenderDeck Publisher

1. Confirm the signed-in Cloudflare identity and exact DEVECTUS account. Check for an existing Worker with this exact name before creating or changing it. Do not touch other accounts or Workers. Do not activate a paid plan.
2. Generate a new cryptographically random timer key in session memory. Store matching values in Sites `SOCIAL_CLOUD_MAINTENANCE_TOKEN` and Cloudflare Worker `MAINTENANCE_TOKEN` through supported secret inputs. Never store it in source, prompts, task definitions, arguments, logs or files. Keep the existing maintenance token unchanged.
3. Publish the matching SenderDeck release and deploy `wrangler deploy --config infra/maintenance-timer/wrangler.jsonc` with the explicit confirmed account. Use `wrangler secret put MAINTENANCE_TOKEN --config infra/maintenance-timer/wrangler.jsonc` via protected stdin. Do not enable the cron until the paired secret is installed and the application's route is deployed. No public HTTP trigger is required for testing.
4. Read the installed Cloudflare cron configuration and observe an actual scheduled execution. Read SenderDeck's `social_runtime.maintenance_cloud` and `maintenance_scheduled` records through the supported read-only database tools. A deployment receipt or submitted trigger alone is insufficient evidence of completed work.
5. Once unattended cloud completion is verified, disable **SenderDeck Maintenance Backup** in Windows Task Scheduler. Keep its logs for audit and retain GitHub's existing cloud fallback. Verify a later cloud execution after disabling the PC task when possible.

## Recovery and rollback

If cloud authentication fails, rotate only the paired timer key, leaving GitHub/PC keys untouched. If a completion is uncertain, inspect runtime/Cloudflare logs before any manual retry. Never enable message sending as a recovery step.

To pause the timer, deploy this Worker's config with an empty `triggers.crons` array in the confirmed account; preserve the source version and logs. Remove only this timer's paired secrets if retiring it. Re-enable the existing Windows task only as a temporary explicitly labelled device-dependent fallback, then investigate cloud failures. Main-app rollback to saved77 makes the dedicated cloud route unavailable; pause the timer first. No data migration is required.
