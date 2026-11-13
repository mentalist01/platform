$ErrorActionPreference = 'Stop'
$assistantRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$assistantNode = (Get-Command node -ErrorAction Stop).Source
$assistantEntry = Join-Path $assistantRoot 'desktop.mjs'
if (!(Test-Path -LiteralPath $assistantEntry) -or !(Test-Path -LiteralPath $assistantNode)) { throw 'Assistant or Node is missing.' }
$assistantStartup = [Environment]::GetFolderPath('Startup')
$assistantLauncher = Join-Path $assistantStartup 'IVAN100-ReplyAssistant.vbs'
$assistantMarker = "' IVAN100 student reply assistant - local drafts only"
if ((Test-Path -LiteralPath $assistantLauncher) -and !(Get-Content -LiteralPath $assistantLauncher -Raw).StartsWith($assistantMarker)) { throw 'An unrelated startup file already exists.' }
$assistantCommand = '"' + $assistantNode + '" "' + $assistantEntry + '"'
$assistantVbs = $assistantMarker + "`r`n" + 'Set assistantShell = CreateObject("WScript.Shell")' + "`r`n" + 'assistantShell.Run "' + $assistantCommand.Replace('"','""') + '", 0, False' + "`r`n"
[IO.File]::WriteAllText($assistantLauncher, $assistantVbs, [Text.Encoding]::Unicode)
Write-Output 'Installed current-user startup for local drafts receiver. No credentials are in the launcher.'
