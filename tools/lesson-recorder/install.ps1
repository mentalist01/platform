param([switch]$NoStartup)
$ErrorActionPreference = 'Stop'
$sourceDirectory = $PSScriptRoot
$recorderDirectory = Join-Path $env:USERPROFILE 'Ivan100Recorder'
$installDirectory = Join-Path $recorderDirectory 'app'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$recorderPage = $null
try { $recorderPage = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:18765/' -TimeoutSec 2 } catch { }
if ($recorderPage) {
  $recorderKey = [regex]::Match($recorderPage.Content, "const key='([^']+)'").Groups[1].Value
  if (-not $recorderKey) { throw 'Порт 18765 занят другой программой' }
  try {
    Invoke-RestMethod 'http://127.0.0.1:18765/shutdown' -Method Post -Headers @{'X-Recorder-Key'=$recorderKey} -ContentType 'application/json' -Body '{}' | Out-Null
  } catch { throw 'Пульт занят записью или загрузкой. Дождитесь окончания перед обновлением.' }
  Start-Sleep -Seconds 2
}
New-Item -ItemType Directory -Force $installDirectory | Out-Null
# AppData writes can be virtualized by an MSIX host. Keep the standalone helper
# outside AppData so Task Scheduler and Explorer see the same files.
$legacyDirectory = Join-Path $env:LOCALAPPDATA 'Ivan100Recorder'
foreach ($dataName in @('state.json', 'rutube-browser')) {
  $oldData = Join-Path $legacyDirectory $dataName
  $newData = Join-Path $recorderDirectory $dataName
  if ((Test-Path -LiteralPath $oldData) -and -not (Test-Path -LiteralPath $newData)) {
    Copy-Item -LiteralPath $oldData -Destination $newData -Recurse
  }
}
$files = @('app.mjs','obs.mjs','engine.mjs','storage.mjs','rutube.mjs','panel.html','hotkeys.ps1','background.vbs','README.md','package.json','package-lock.json')
foreach ($fileName in $files) { Copy-Item -LiteralPath (Join-Path $sourceDirectory $fileName) -Destination (Join-Path $installDirectory $fileName) -Force }
Copy-Item -LiteralPath $nodePath -Destination (Join-Path $installDirectory 'node.exe') -Force
Push-Location $installDirectory
try { & npm.cmd ci --omit=dev --no-audit --no-fund; if($LASTEXITCODE -ne 0){throw 'Не установились зависимости Rutube'} } finally { Pop-Location }
$launcher = @'
Option Explicit
Dim shell, fso, folder, http, running
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
running = False
On Error Resume Next
Set http = CreateObject("MSXML2.XMLHTTP")
http.open "GET", "http://127.0.0.1:18765/", False
http.send
running = (http.status = 200)
On Error GoTo 0
If Not running Then
  shell.CurrentDirectory = folder
  shell.Run Chr(34) & folder & "\node.exe" & Chr(34) & " " & Chr(34) & folder & "\app.mjs" & Chr(34), 0, False
End If
If WScript.Arguments.Count = 0 Then
  WScript.Sleep 1500
  shell.Run "http://127.0.0.1:18765/", 1, False
End If
'@
[System.IO.File]::WriteAllText((Join-Path $installDirectory 'start.vbs'), $launcher, [System.Text.Encoding]::ASCII)
$shell = New-Object -ComObject WScript.Shell
$desktopShortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'IVAN100 - Запись уроков.lnk'))
$desktopShortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$desktopShortcut.Arguments = '"' + (Join-Path $installDirectory 'start.vbs') + '"'
$desktopShortcut.WorkingDirectory = $installDirectory
$desktopShortcut.Description = 'Пульт OBS, Телемост и загрузка записей в Rutube'
$desktopShortcut.Save()
if (-not $NoStartup) {
  $startupShortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'IVAN100 Recorder.lnk'))
  $startupShortcut.TargetPath = $desktopShortcut.TargetPath
  $startupShortcut.Arguments = $desktopShortcut.Arguments + ' background'
  $startupShortcut.WorkingDirectory = $installDirectory
  $startupShortcut.Save()
  try {
    $recorderUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $recorderTaskAction = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\wscript.exe') -Argument ('"' + (Join-Path $installDirectory 'background.vbs') + '"')
    $recorderTaskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $recorderUser
    $recorderTaskPrincipal = New-ScheduledTaskPrincipal -UserId $recorderUser -LogonType Interactive -RunLevel Limited
    $recorderTaskSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName 'IVAN100 Lesson Recorder' -Action $recorderTaskAction -Trigger $recorderTaskTrigger -Principal $recorderTaskPrincipal -Settings $recorderTaskSettings -Description 'Local OBS lesson recorder for ivan100.ru' -Force | Out-Null
    Start-ScheduledTask -TaskName 'IVAN100 Lesson Recorder'
  } catch { Write-Warning 'Запуск через планировщик недоступен. Ярлык в автозагрузке сохранён.' }
}
Write-Output "Установлено: $installDirectory"
Write-Output 'Ярлык: IVAN100 - Запись уроков. Пульт: http://127.0.0.1:18765/'
