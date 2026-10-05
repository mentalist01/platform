param([switch]$ExistingOnly)
$ErrorActionPreference = 'Stop'
$recorderTaskName = 'IVAN100 Lesson Recorder'
$recorderStarter = Join-Path $PSScriptRoot 'background.vbs'
$recorderExisting = Get-ScheduledTask -TaskName $recorderTaskName -ErrorAction SilentlyContinue
if ($ExistingOnly -and -not $recorderExisting) { exit 2 }
if ($recorderExisting) {
  # Never change a task owned by another program or another installation.
  if ($recorderExisting.Actions.Count -ne 1 -or $recorderExisting.Actions[0].Arguments -ne ('"' + $recorderStarter + '"')) { throw 'The recorder task belongs to another installation' }
  if ($recorderExisting.Triggers | Where-Object { $_.Repetition.Interval -eq 'PT1M' }) { exit 0 }
}
$recorderUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$recorderMinute = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
if ($recorderExisting) {
  Set-ScheduledTask -TaskName $recorderTaskName -Trigger @(@($recorderExisting.Triggers) + $recorderMinute) | Out-Null
} else {
  $recorderAction = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\wscript.exe') -Argument ('"' + $recorderStarter + '"')
  $recorderLogon = New-ScheduledTaskTrigger -AtLogOn -User $recorderUser
  $recorderPrincipal = New-ScheduledTaskPrincipal -UserId $recorderUser -LogonType Interactive -RunLevel Limited
  $recorderSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName $recorderTaskName -Action $recorderAction -Trigger @($recorderLogon, $recorderMinute) -Principal $recorderPrincipal -Settings $recorderSettings -Description 'Local OBS lesson recorder for ivan100.ru' | Out-Null
}
