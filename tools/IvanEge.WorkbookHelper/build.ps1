param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release',

    [ValidateSet('StoreMsix', 'SignedExe', 'All')]
    [string]$Target = 'StoreMsix',

    [string]$PackageIdentityName = 'IvanNaSotku.WorkbookHelper.Dev',
    [string]$PackagePublisher = 'CN=Ivan na sotku',
    [string]$PublisherDisplayName = 'Иван на сотку',
    [string]$PackageVersion = '1.3.0.0',

    [string]$CertificateThumbprint = '',
    [string]$TimestampUrl = 'http://timestamp.digicert.com',
    [switch]$PublishDownload
)

$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = (Resolve-Path (Join-Path $projectDirectory '..\..')).Path
$projectFile = Join-Path $projectDirectory 'IvanEge.WorkbookHelper.csproj'
$manifestTemplate = Join-Path $projectDirectory 'Package.appxmanifest.template'
$artifactsDirectory = Join-Path $projectDirectory 'artifacts'
$downloadsDirectory = Join-Path $repositoryRoot 'public\downloads'
$downloadExecutable = Join-Path $downloadsDirectory 'IvanEgeWorkbookHelper.exe'
$selfTestReport = Join-Path ([System.IO.Path]::GetTempPath()) 'IvanEgeWorkbookHelper-selftest.txt'
$sourceLogo = Join-Path $repositoryRoot 'public\logo1.png'

if ($PublishDownload -and $Target -eq 'StoreMsix') {
    throw 'PublishDownload applies only to Target SignedExe or All.'
}
if ($PublishDownload -and [string]::IsNullOrWhiteSpace($CertificateThumbprint)) {
    throw 'Refusing to publish an unsigned EXE. Pass CertificateThumbprint for a trusted code-signing certificate.'
}

function Assert-ChildPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $root = [System.IO.Path]::GetFullPath($projectDirectory).TrimEnd('\') + '\'
    $candidate = [System.IO.Path]::GetFullPath($Path)
    if (-not $candidate.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify a path outside the helper project: $candidate"
    }
    return $candidate
}

function Reset-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    $safePath = Assert-ChildPath -Path $Path
    if (Test-Path -LiteralPath $safePath) {
        Remove-Item -LiteralPath $safePath -Recurse -Force
    }
    New-Item -ItemType Directory -Path $safePath -Force | Out-Null
    return $safePath
}

function Find-WindowsSdkTool {
    param([Parameter(Mandatory = $true)][string]$Name)

    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) {
        return $command.Source
    }

    $sdkBin = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
    if (Test-Path -LiteralPath $sdkBin) {
        $match = Get-ChildItem -LiteralPath $sdkBin -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            ForEach-Object { Join-Path $_.FullName "x64\$Name" } |
            Where-Object { Test-Path -LiteralPath $_ } |
            Select-Object -First 1
        if ($match) {
            return $match
        }
    }
    throw "$Name was not found. Install the Windows SDK."
}

function Invoke-SelfTest {
    param([Parameter(Mandatory = $true)][string]$Executable)

    $selfTest = Start-Process -FilePath $Executable -ArgumentList '--self-test' -Wait -PassThru -WindowStyle Hidden
    if ($selfTest.ExitCode -eq 0) {
        return
    }
    $details = if (Test-Path -LiteralPath $selfTestReport) {
        Get-Content -LiteralPath $selfTestReport -Raw
    } else {
        'Self-test did not create an error report.'
    }
    throw "Workbook helper self-test failed with exit code $($selfTest.ExitCode).`n$details"
}

function Invoke-CodeSigning {
    param([Parameter(Mandatory = $true)][string]$Path)

    $thumbprint = ($CertificateThumbprint -replace '\s', '').ToUpperInvariant()
    if (-not $thumbprint) {
        return $false
    }
    if ($thumbprint -notmatch '^[0-9A-F]{40}$') {
        throw 'CertificateThumbprint must contain the 40-character SHA-1 certificate thumbprint used by SignTool.'
    }

    $signTool = Find-WindowsSdkTool -Name 'signtool.exe'
    & $signTool sign /fd SHA256 /sha1 $thumbprint /tr $TimestampUrl /td SHA256 $Path
    if ($LASTEXITCODE -ne 0) {
        throw "SignTool failed for $Path with exit code $LASTEXITCODE."
    }

    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
        throw "Authenticode verification failed for ${Path}: $($signature.StatusMessage)"
    }
    return $true
}

function New-LogoAsset {
    param(
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][int]$Width,
        [Parameter(Mandatory = $true)][int]$Height,
        [Parameter(Mandatory = $true)][int]$LogoSize
    )

    Add-Type -AssemblyName System.Drawing
    $source = [System.Drawing.Image]::FromFile($sourceLogo)
    try {
        $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.Clear([System.Drawing.Color]::Transparent)
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $x = [Math]::Floor(($Width - $LogoSize) / 2)
                $y = [Math]::Floor(($Height - $LogoSize) / 2)
                $graphics.DrawImage($source, $x, $y, $LogoSize, $LogoSize)
            } finally {
                $graphics.Dispose()
            }
            $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $bitmap.Dispose()
        }
    } finally {
        $source.Dispose()
    }
}

function Get-XmlEscapedValue {
    param([AllowEmptyString()][string]$Value)
    return [System.Security.SecurityElement]::Escape($Value)
}

function Build-SignedExecutable {
    $publishDirectory = Reset-Directory -Path (Join-Path $projectDirectory 'bin\publish\signed-exe\win-x64')
    dotnet publish $projectFile `
        --configuration $Configuration `
        --runtime win-x64 `
        --self-contained true `
        --output $publishDirectory `
        -p:PublishSingleFile=true `
        -p:EnableCompressionInSingleFile=false `
        -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:PublishReadyToRun=false `
        -p:PublishTrimmed=false
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet publish failed with exit code $LASTEXITCODE."
    }

    $executable = Join-Path $publishDirectory 'IvanEgeWorkbookHelper.exe'
    if (-not (Test-Path -LiteralPath $executable)) {
        throw "Publish succeeded but the executable was not found: $executable"
    }
    Invoke-SelfTest -Executable $executable
    $signed = Invoke-CodeSigning -Path $executable

    if ($PublishDownload) {
        if (-not $signed) {
            throw 'Refusing to publish an unsigned EXE. Pass CertificateThumbprint for a trusted code-signing certificate.'
        }
        New-Item -ItemType Directory -Path $downloadsDirectory -Force | Out-Null
        Copy-Item -LiteralPath $executable -Destination $downloadExecutable -Force
    }

    $file = Get-Item -LiteralPath $executable
    $hash = Get-FileHash -LiteralPath $executable -Algorithm SHA256
    [PSCustomObject]@{
        Target = 'SignedExe'
        Path = $file.FullName
        PublishedPath = if ($PublishDownload) { $downloadExecutable } else { $null }
        Signed = $signed
        SizeMB = [Math]::Round($file.Length / 1MB, 2)
        SHA256 = $hash.Hash.ToLowerInvariant()
    }
}

function Build-StoreMsix {
    if (-not (Test-Path -LiteralPath $manifestTemplate)) {
        throw "MSIX manifest template was not found: $manifestTemplate"
    }
    if (-not (Test-Path -LiteralPath $sourceLogo)) {
        throw "Logo was not found: $sourceLogo"
    }
    if ($PackageVersion -notmatch '^\d+\.\d+\.\d+\.\d+$') {
        throw 'PackageVersion must contain four numeric components, for example 1.3.0.0.'
    }

    $layout = Reset-Directory -Path (Join-Path $projectDirectory 'bin\publish\store-msix\layout')
    dotnet publish $projectFile `
        --configuration $Configuration `
        --runtime win-x64 `
        --self-contained true `
        --output $layout `
        -p:PublishSingleFile=false `
        -p:PublishReadyToRun=false `
        -p:PublishTrimmed=false
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet publish failed with exit code $LASTEXITCODE."
    }

    $executable = Join-Path $layout 'IvanEgeWorkbookHelper.exe'
    if (-not (Test-Path -LiteralPath $executable)) {
        throw "Publish succeeded but the executable was not found: $executable"
    }
    Invoke-SelfTest -Executable $executable
    [void](Invoke-CodeSigning -Path $executable)

    $assets = Join-Path $layout 'Assets'
    New-Item -ItemType Directory -Path $assets -Force | Out-Null
    New-LogoAsset -Destination (Join-Path $assets 'StoreLogo.png') -Width 50 -Height 50 -LogoSize 50
    New-LogoAsset -Destination (Join-Path $assets 'Square44x44Logo.png') -Width 44 -Height 44 -LogoSize 44
    New-LogoAsset -Destination (Join-Path $assets 'Square150x150Logo.png') -Width 150 -Height 150 -LogoSize 150
    New-LogoAsset -Destination (Join-Path $assets 'Wide310x150Logo.png') -Width 310 -Height 150 -LogoSize 128

    $manifest = Get-Content -LiteralPath $manifestTemplate -Raw
    $manifest = $manifest.Replace('__PACKAGE_IDENTITY_NAME__', (Get-XmlEscapedValue $PackageIdentityName))
    $manifest = $manifest.Replace('__PACKAGE_PUBLISHER__', (Get-XmlEscapedValue $PackagePublisher))
    $manifest = $manifest.Replace('__PACKAGE_VERSION__', (Get-XmlEscapedValue $PackageVersion))
    $manifest = $manifest.Replace('__PUBLISHER_DISPLAY_NAME__', (Get-XmlEscapedValue $PublisherDisplayName))
    Set-Content -LiteralPath (Join-Path $layout 'AppxManifest.xml') -Value $manifest -Encoding utf8NoBOM

    New-Item -ItemType Directory -Path $artifactsDirectory -Force | Out-Null
    $packagePath = Join-Path $artifactsDirectory "IvanEgeWorkbookHelper_$($PackageVersion)_x64.msix"
    if (Test-Path -LiteralPath $packagePath) {
        Remove-Item -LiteralPath (Assert-ChildPath -Path $packagePath) -Force
    }
    $makeAppx = Find-WindowsSdkTool -Name 'makeappx.exe'
    $makeAppxOutput = @(& $makeAppx pack /d $layout /p $packagePath /o 2>&1)
    $makeAppxExitCode = $LASTEXITCODE
    if ($makeAppxExitCode -ne 0) {
        throw "MakeAppx failed with exit code $makeAppxExitCode.`n$($makeAppxOutput -join [Environment]::NewLine)"
    }

    $signed = Invoke-CodeSigning -Path $packagePath
    $file = Get-Item -LiteralPath $packagePath
    $hash = Get-FileHash -LiteralPath $packagePath -Algorithm SHA256
    [PSCustomObject]@{
        Target = 'StoreMsix'
        Path = $file.FullName
        Signed = $signed
        StoreSubmissionReady = $PackageIdentityName -ne 'IvanNaSotku.WorkbookHelper.Dev'
        DirectInstallReady = $signed
        SizeMB = [Math]::Round($file.Length / 1MB, 2)
        SHA256 = $hash.Hash.ToLowerInvariant()
        IdentityName = $PackageIdentityName
        Publisher = $PackagePublisher
        Version = $PackageVersion
    }
}

$results = @()
if ($Target -in @('StoreMsix', 'All')) {
    $results += Build-StoreMsix
}
if ($Target -in @('SignedExe', 'All')) {
    $results += Build-SignedExecutable
}
$results
