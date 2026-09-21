param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
function Update-RecorderPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + $env:Path
}
function Find-RecorderProgram([string]$Name, [string[]]$Candidates = @()) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  foreach ($candidate in $Candidates) { if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate } }
  return $null
}
function Get-RecorderDependencies {
  $node = Find-RecorderProgram 'node.exe' @("$env:ProgramFiles\nodejs\node.exe")
  if ($node) { $major = & $node -p 'process.versions.node.split(String.fromCharCode(46))[0]'; if ([int]$major -lt 22) { $node = $null } }
  $obs = Find-RecorderProgram 'obs64.exe' @("$env:ProgramFiles\obs-studio\bin\64bit\obs64.exe", "$env:LOCALAPPDATA\Programs\obs-studio\bin\64bit\obs64.exe")
  if ($obs -and ([Diagnostics.FileVersionInfo]::GetVersionInfo($obs).FileMajorPart -lt 28)) { $obs = $null }
  return [ordered]@{
    'Node.js 22+' = @{ Id = 'OpenJS.NodeJS.LTS'; Path = $node }
    'OBS Studio 28+' = @{ Id = 'OBSProject.OBSStudio'; Path = $obs }
    'FFmpeg' = @{ Id = 'Gyan.FFmpeg'; Path = (Find-RecorderProgram 'ffmpeg.exe') }
    'Microsoft Edge' = @{ Id = 'Microsoft.Edge'; Path = (Find-RecorderProgram 'msedge.exe' @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe", "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe")) }
  }
}
Update-RecorderPath
$dependencies = Get-RecorderDependencies
foreach ($name in $dependencies.Keys) {
  if ($dependencies[$name].Path) { Write-Host "$name : OK"; continue }
  if ($CheckOnly) { Write-Host "$name : требуется установка"; continue }
  if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    throw 'Не найден WinGet. Установите «Установщик приложений» Microsoft из Microsoft Store (https://apps.microsoft.com/detail/9NBLGGH4NNS1), затем снова запустите Install.cmd.'
  }
  Write-Host "Устанавливаем $name. Следуйте запросам установщика."
  & winget.exe install --exact --id $dependencies[$name].Id --source winget
  if ($LASTEXITCODE -ne 0) { throw "Не удалось установить $name (код $LASTEXITCODE). Завершите установку компонента и снова запустите Install.cmd." }
  Update-RecorderPath
}
if (-not $CheckOnly) {
  $dependencies = Get-RecorderDependencies
  foreach ($name in $dependencies.Keys) {
    if (-not $dependencies[$name].Path) { throw "$name пока недоступен. Перезапустите Windows и снова запустите Install.cmd." }
  }
  $global:RecorderDependencyPaths = @{
    node = $dependencies['Node.js 22+'].Path
    obs = $dependencies['OBS Studio 28+'].Path
    ffmpeg = $dependencies['FFmpeg'].Path
  }
}
