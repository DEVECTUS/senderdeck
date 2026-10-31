$ErrorActionPreference = 'Stop'
$taskName = 'SenderDeck Maintenance Backup'
$taskFolder = Join-Path $env:LOCALAPPDATA 'SenderDeck\maintenance'
New-Item -ItemType Directory -Path $taskFolder -Force | Out-Null
$installedScript = Join-Path $taskFolder 'dispatch-social-maintenance.ps1'
$shellPath = (Get-Process -Id $PID).Path
$taskArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $installedScript + '"'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and ($existing.Actions.Execute -ne $shellPath -or $existing.Actions.Arguments -ne $taskArguments)) {
    throw 'A different task already uses this name. No task was changed.'
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'dispatch-social-maintenance.ps1') -Destination $installedScript -Force
$taskAction = New-ScheduledTaskAction -Execute $shellPath -Argument $taskArguments
$taskTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
$taskSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$taskPrincipal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Principal $taskPrincipal -Description 'Dispatch SenderDeck hosted maintenance every ten minutes while the owner is signed in. No messages are sent. GitHub stores the hosting secret.' -Force | Out-Null
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName,State
