# Invoked by the owner's Windows task. No hosting tokens are read or copied.
$ErrorActionPreference = 'Stop'
$auditFolder = Join-Path $env:LOCALAPPDATA 'SenderDeck\maintenance'
New-Item -ItemType Directory -Path $auditFolder -Force | Out-Null
$auditFile = Join-Path $auditFolder 'dispatch.log'
if ((Test-Path -LiteralPath $auditFile) -and (Get-Item -LiteralPath $auditFile).Length -gt 1048576) {
    Move-Item -LiteralPath $auditFile -Destination (Join-Path $auditFolder 'dispatch.previous.log') -Force
}
# Use the existing user's gh credential store; never log command output or secrets.
$ghPath = Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe'
& $ghPath workflow run social-maintenance.yml --repo DEVECTUS/senderdeck --ref main --field unattended=true *> $null
$dispatchExit = $LASTEXITCODE
$receipt = if ($dispatchExit -eq 0) { 'dispatch accepted; completion not yet verified' } else { "dispatch failed (exit $dispatchExit); next scheduled attempt will retry" }
Add-Content -LiteralPath $auditFile -Value "$([DateTimeOffset]::Now.ToString('o')) $receipt"
exit $dispatchExit
