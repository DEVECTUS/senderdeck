# Maintenance readiness release

31 October 2026. Direct owner request: fix background maintenance failures and prepare reviewer instructions. Version 0.4.38 is reserved by the SenderDeck Publisher chat.

## Findings and changes

GitHub schedules requested every ten minutes have run hours apart. GitHub documents delayed/dropped schedule events: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule. Recent scheduled jobs complete successfully; older jobs returned bare HTTP409. Their logs do not establish the original409 cause. A prior main-branch timeout fix is included: wait up to four minutes for actual completion and never retry an uncertain timeout. Live base is saved76 / 714937292ee5611f102138af6175defab8a545db. This release also includes main fb6f1a7's completion-timeout fix.

The server now marks only authenticated lease contention with a dedicated busy header. The runner retries that response after30/60seconds, at most three total attempts inside the existing overall deadline. Auth failures, unmarked409, redirects, invalid receipts and uncertain completion remain errors. A busy response is never completion.

The deterministic Windows task dispatches the existing GitHub workflow every ten minutes using the owner's existing gh credential store. Hosting credentials remain in GitHub secrets. Dispatch acceptance is logged separately from hosted completion. The workflow passes an explicit backup source; the server records recurring freshness only after two successful backup completions5–15minutes apart. Immediate manual dispatches cannot establish cadence. These observations prove only the observed interval, not future uptime or independently authenticated provenance. The existing twenty-minute stale threshold is unchanged.

## Installation and verification

1. Deploy this Worker through Publisher and update GitHub main with the corresponding workflow/script before installing the task.
2. Run `scripts/install-maintenance-backup.ps1` in the owner's PowerShell session. It copies the dispatcher into `%LOCALAPPDATA%\SenderDeck\maintenance`, registers **SenderDeck Maintenance Backup**, starts after one minute and repeats every ten minutes. The principal is the current Windows user, interactive logon, limited privileges. It needs no password or copied token. Existing tasks with different actions are not overwritten.
3. Task settings: IgnoreNew overlapping invocations, two-minute task limit, catch up when available, run on battery. PowerShell starts hidden. The hosted GitHub job separately limits itself to five minutes and uses its existing concurrency/lease protections.
4. Verify Task Scheduler last result and `%LOCALAPPDATA%\SenderDeck\maintenance\dispatch.log`; then inspect the specific GitHub jobs and their `processed:true` receipts. Finally inspect SenderDeck operator runtime for completed maintenance and scheduled freshness. An accepted dispatch or successful installer alone is insufficient.
5. Observe at least two genuine task-triggered completions ten minutes apart before reporting the backup cadence verified. Inspect current account validation/subscription separately from scheduler health.

The backup requires this PC awake with the owner signed in and network/GitHub authentication available. Locked sessions can run; powered-off/sleeping/signed-out sessions cannot. GitHub's cloud schedule remains enabled but is best effort. GitHub outage or expired gh auth is logged as failed dispatch and retried only at the next scheduled occurrence. Logs rotate at1MiB without message bodies or command error content. No reliable24/7 cloud-only cadence is claimed. Sites tools currently expose no supported native cron configuration; do not infer a cron installation from the source scheduled() handler.

## Reviewer preparation

See WHATSAPP-REVIEWER-TEST-INSTRUCTIONS.md. No reviewer identity is provisioned, no credential is reused, and no test allowance is renewed by this release. If Meta asks for live access, arrange the dedicated WhatsApp reviewer workspace and time-limited exact test scope. Existing submitted videos and review remain intact.

## Deployment and rollback

No schema migration, runtime environment or audience changes. Preserve environment revision30 settings, enabled organic publishing, reply approval controls and expired WhatsApp allowance. No customer sends, posts, phone registration changes or Twilio changes are part of this release.

Rollback: disable **SenderDeck Maintenance Backup** with `Disable-ScheduledTask -TaskName 'SenderDeck Maintenance Backup'`. Retain logs and runtime records for audit. Publisher can redeploy saved76; keep GitHub's original scheduled workflow. If rolling back Worker source before removing the workflow input, backup source is treated as external and cannot establish recurring freshness. The backup task can be removed after disabling with `Unregister-ScheduledTask -TaskName 'SenderDeck Maintenance Backup' -Confirm:$false`; retain its audit folder. Do not weaken freshness or enable sending to conceal a failure.
