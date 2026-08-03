param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = (Resolve-Path (Join-Path $projectDirectory '..\..')).Path
$projectFile = Join-Path $projectDirectory 'IvanEge.WorkbookHelper.csproj'
$publishDirectory = Join-Path $projectDirectory 'bin\publish\win-x64'
$publishedExecutable = Join-Path $publishDirectory 'IvanEgeWorkbookHelper.exe'
$downloadsDirectory = Join-Path $repositoryRoot 'public\downloads'
$destinationExecutable = Join-Path $downloadsDirectory 'IvanEgeWorkbookHelper.exe'
$selfTestReport = Join-Path ([System.IO.Path]::GetTempPath()) 'IvanEgeWorkbookHelper-selftest.txt'

dotnet publish $projectFile `
    --configuration $Configuration `
    --runtime win-x64 `
    --self-contained true `
    --output $publishDirectory `
    -p:PublishSingleFile=true `
    -p:EnableCompressionInSingleFile=true `
    -p:PublishReadyToRun=false `
    -p:PublishTrimmed=false

if (-not (Test-Path -LiteralPath $publishedExecutable)) {
    throw "Publish succeeded but the executable was not found: $publishedExecutable"
}

$selfTest = Start-Process -FilePath $publishedExecutable -ArgumentList '--self-test' -Wait -PassThru -WindowStyle Hidden
if ($selfTest.ExitCode -ne 0) {
    $details = if (Test-Path -LiteralPath $selfTestReport) {
        Get-Content -LiteralPath $selfTestReport -Raw
    } else {
        'Self-test did not create an error report.'
    }
    throw "Workbook helper self-test failed with exit code $($selfTest.ExitCode).`n$details"
}

New-Item -ItemType Directory -Path $downloadsDirectory -Force | Out-Null
Copy-Item -LiteralPath $publishedExecutable -Destination $destinationExecutable -Force

$file = Get-Item -LiteralPath $destinationExecutable
$hash = Get-FileHash -LiteralPath $destinationExecutable -Algorithm SHA256
[PSCustomObject]@{
    Path = $file.FullName
    SizeMB = [Math]::Round($file.Length / 1MB, 2)
    SHA256 = $hash.Hash.ToLowerInvariant()
}
