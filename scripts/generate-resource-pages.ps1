[CmdletBinding()]
param(
    [string]$RepositoryPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepositoryPath)) {
    $RepositoryPath = Join-Path $PSScriptRoot ".."
}

$repositoryRoot = (Resolve-Path -LiteralPath $RepositoryPath).Path
$sitePath = Join-Path $repositoryRoot "site"
$dataPath = Join-Path $sitePath "data"
$outputPath = Join-Path $sitePath "resources"
$templatePath = Join-Path $PSScriptRoot "templates/resource-detail.html"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-JsonLines {
    param([Parameter(Mandatory = $true)][string]$Path)

    $records = [System.Collections.Generic.List[object]]::new()
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            $records.Add(($line | ConvertFrom-Json))
        }
    }
    return ,([object[]]$records.ToArray())
}

function Encode-Html {
    param([AllowNull()][object]$Value)
    return [System.Net.WebUtility]::HtmlEncode([string]$Value)
}

function Write-Utf8File {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

$template = Get-Content -LiteralPath $templatePath -Raw -Encoding UTF8
$manifest = Get-Content -LiteralPath (Join-Path $dataPath "catalog-manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$native = Read-JsonLines (Join-Path $dataPath "native.jsonl")
$ecosystem = Read-JsonLines (Join-Path $dataPath "ecosystem.jsonl")
$scienceSoftware = Read-JsonLines (Join-Path $dataPath "sciencesoftware.jsonl")
$resources = @($native) + @($ecosystem) + @($scienceSoftware)

if (-not (Test-Path -LiteralPath $outputPath -PathType Container)) {
    New-Item -ItemType Directory -Path $outputPath | Out-Null
}

$resourceIds = [System.Collections.Generic.HashSet[string]]::new()
$sitemapEntries = [System.Collections.Generic.List[string]]::new()
$sitemapEntries.Add("  <url><loc>https://a3s-lab.github.io/Science/</loc><lastmod>$($manifest.snapshotDate)</lastmod></url>")

foreach ($resource in $resources) {
    $resourceId = [string]$resource.id
    if ($resourceId -notmatch "^[a-z0-9][a-z0-9-]+$") {
        throw "Resource '$resourceId' cannot be used as a static page path."
    }
    if (-not $resourceIds.Add($resourceId)) {
        throw "Duplicate resource identifier '$resourceId'."
    }

    $resourceDirectory = Join-Path $outputPath $resourceId
    if (-not (Test-Path -LiteralPath $resourceDirectory -PathType Container)) {
        New-Item -ItemType Directory -Path $resourceDirectory | Out-Null
    }

    $canonicalUrl = "https://a3s-lab.github.io/Science/resources/$resourceId/"
    $page = $template
    $replacements = [ordered]@{
        "{{RESOURCE_ID}}" = (Encode-Html $resourceId)
        "{{RESOURCE_NAME}}" = (Encode-Html $resource.name)
        "{{RESOURCE_DESCRIPTION}}" = (Encode-Html $resource.description)
        "{{CANONICAL_URL}}" = (Encode-Html $canonicalUrl)
        "{{SOURCE_URL}}" = (Encode-Html $resource.url)
    }
    foreach ($replacement in $replacements.GetEnumerator()) {
        $page = $page.Replace($replacement.Key, $replacement.Value)
    }

    Write-Utf8File (Join-Path $resourceDirectory "index.html") $page
    $sitemapEntries.Add("  <url><loc>$canonicalUrl</loc><lastmod>$($manifest.snapshotDate)</lastmod></url>")
}

$unexpectedDirectories = @(
    Get-ChildItem -LiteralPath $outputPath -Directory |
        Where-Object { -not $resourceIds.Contains($_.Name) }
)
if ($unexpectedDirectories.Count -gt 0) {
    throw "Unexpected generated resource directories: $($unexpectedDirectories.Name -join ', ')"
}

$resourceIndex = @"
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0; url=../#catalog">
    <link rel="canonical" href="https://a3s-lab.github.io/Science/#catalog">
    <title>A3S Science</title>
  </head>
  <body><a href="../#catalog">A3S Science</a></body>
</html>
"@
Write-Utf8File (Join-Path $outputPath "index.html") $resourceIndex

$sitemap = @"
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
$($sitemapEntries -join "")
</urlset>
"@
Write-Utf8File (Join-Path $sitePath "sitemap.xml") $sitemap

Write-Host "Generated $($resources.Count) resource detail pages and sitemap.xml."
