param(
    [string]$ManifestUrl = '',
    [string]$DownloadUrl = ''
)
$ErrorActionPreference = 'Stop'
if ([bool]$ManifestUrl -ne [bool]$DownloadUrl) {
    throw 'Provide both -ManifestUrl and -DownloadUrl for Manifest URL installation.'
}
foreach ($address in @($ManifestUrl, $DownloadUrl)) {
    if ($address) {
        $parsedAddress = $null
        if (-not [Uri]::TryCreate($address, [UriKind]::Absolute, [ref]$parsedAddress) -or $parsedAddress.Scheme -notin @('http', 'https') -or $parsedAddress.UserInfo) {
            throw 'Release URLs must be absolute HTTP(S) URLs without embedded credentials.'
        }
    }
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseDirectory = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Force -Path $releaseDirectory | Out-Null
$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'module.json') -Raw | ConvertFrom-Json
if ($ManifestUrl) {
    $manifest | Add-Member -NotePropertyName manifest -NotePropertyValue $ManifestUrl -Force
    $manifest | Add-Member -NotePropertyName download -NotePropertyValue $DownloadUrl -Force
}
$manifestJson = $manifest | ConvertTo-Json -Depth 20
$manifestPath = Join-Path $releaseDirectory 'module.json'
[IO.File]::WriteAllText($manifestPath, $manifestJson, [Text.UTF8Encoding]::new($false))
$packagePath = Join-Path $releaseDirectory ('goodneighbor-slots-' + $manifest.version + '.zip')
# Write the exact same manifest into the archive and the standalone JSON.
# Forward-slash entry names also work on Linux-hosted Foundry servers.
$archiveStream = [IO.File]::Open($packagePath, [IO.FileMode]::Create)
$archive = [IO.Compression.ZipArchive]::new($archiveStream, [IO.Compression.ZipArchiveMode]::Create)
try {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $manifestPath, 'module.json') | Out-Null
    foreach ($relativePath in @('package.json', 'scripts', 'styles', 'preview', 'tests', 'README.md', 'FOUNDRY-INSTALL.md', 'CHANGELOG.md', 'LICENSE')) {
        $inputPath = Join-Path $projectRoot $relativePath
        $inputItem = Get-Item -LiteralPath $inputPath
        $inputFiles = if ($inputItem.PSIsContainer) { Get-ChildItem -LiteralPath $inputPath -Recurse -File } else { @($inputItem) }
        foreach ($inputFile in $inputFiles) {
            $entryName = [IO.Path]::GetRelativePath($projectRoot, $inputFile.FullName).Replace('\', '/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $inputFile.FullName, $entryName) | Out-Null
        }
    }
} finally {
    $archive.Dispose()
    $archiveStream.Dispose()
}
Write-Output $manifestPath
Write-Output $packagePath
if ($manifest.manifest -and $manifest.download) {
    Write-Output ('Configured manifest URL: ' + $manifest.manifest)
    Write-Output 'Publish both generated files as release assets before using Manifest URL installation.'
} else { Write-Output 'Local package ready. Hosted manifest/download URLs are still required for Manifest URL installation.' }
