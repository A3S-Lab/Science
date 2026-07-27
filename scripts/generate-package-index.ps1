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
$dataPath = Join-Path $repositoryRoot "site/data"
$outputPath = Join-Path $dataPath "packages.jsonl"
$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)

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

function Get-TaxonomyNames {
    param(
        [Parameter(Mandatory = $true)][object[]]$Ids,
        [Parameter(Mandatory = $true)][hashtable]$Lookup
    )

    return @(
        $Ids |
            ForEach-Object { $Lookup[[string]$_] } |
            Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }
    )
}

function ConvertFrom-JsonString {
    param([Parameter(Mandatory = $true)][string]$Value)
    return ('"' + $Value + '"' | ConvertFrom-Json)
}

$taxonomy = Get-Content -LiteralPath (Join-Path $dataPath "taxonomy.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$manifest = Get-Content -LiteralPath (Join-Path $dataPath "catalog-manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$resources = @(
    (Read-JsonLines (Join-Path $dataPath "native.jsonl")) +
    (Read-JsonLines (Join-Path $dataPath "ecosystem.jsonl")) +
    (Read-JsonLines (Join-Path $dataPath "sciencesoftware.jsonl"))
)

$disciplineNames = @{}
foreach ($entry in @($taxonomy.disciplines)) {
    $disciplineNames[[string]$entry.id] = [string]$entry.nameZh
}
$capabilityNames = @{}
foreach ($entry in @($taxonomy.capabilities)) {
    $capabilityNames[[string]$entry.id] = [string]$entry.nameZh
}

$kindLabels = '{"Skill":"\u79d1\u7814\u6280\u80fd","MCP":"MCP \u670d\u52a1","Software":"\u79d1\u7814\u8f6f\u4ef6","Agent":"\u79d1\u7814\u667a\u80fd\u4f53","Workbench":"\u79d1\u7814\u5de5\u4f5c\u53f0"}' | ConvertFrom-Json
$ideographicComma = ConvertFrom-JsonString "\u3001"
$fullStop = ConvertFrom-JsonString "\u3002"
$multidisciplinary = ConvertFrom-JsonString "\u591a\u5b66\u79d1\u7814\u7a76"
$researchWorkflow = ConvertFrom-JsonString "\u79d1\u7814\u5de5\u4f5c\u6d41"
$adapterRoleZh = ConvertFrom-JsonString "\u4e0a\u6e38\u9002\u914d\u5305"
$adapterContentZh = ConvertFrom-JsonString "\u7ecf\u7b5b\u9009\u7684\u4e0a\u6e38\u77e5\u8bc6\u5361\u3001\u9002\u914d\u8bf4\u660e\u4e0e\u8c03\u7528\u89c4\u8303"
$workflowRoleZh = ConvertFrom-JsonString "\u539f\u751f\u5de5\u4f5c\u6d41\u5305"
$workflowContentZh = ConvertFrom-JsonString "A3S \u539f\u751f\u79d1\u7814\u6280\u80fd\u53ca\u5176\u811a\u672c\u3001\u53c2\u8003\u8d44\u6599\u4e0e\u8f7b\u91cf\u5de5\u4f5c\u6d41\u8d44\u4ea7"
$interfaceRoleZh = ConvertFrom-JsonString "MCP \u5165\u53e3\u5305"
$interfaceContentZh = ConvertFrom-JsonString "MCP \u670d\u52a1\u77e5\u8bc6\u5361\u3001\u63a5\u53e3\u5951\u7ea6\u4e0e\u6e90\u9879\u76ee\u5165\u53e3\uff1b\u670d\u52a1\u8fd0\u884c\u65f6\u4ecd\u6309\u4e0a\u6e38\u8981\u6c42\u51c6\u5907"
$referenceRoleZh = ConvertFrom-JsonString "\u76ee\u5f55\u8d44\u6599\u5305"
$referenceContentZh = ConvertFrom-JsonString "\u8f6f\u4ef6\u76ee\u5f55\u4fe1\u606f\u3001\u5206\u7c7b\u4e0e\u6765\u6e90\u94fe\u63a5\uff1b\u4e0d\u5305\u542b\u539f\u8f6f\u4ef6\u5b89\u88c5\u7a0b\u5e8f"
$adapterSummaryTemplate = ConvertFrom-JsonString "{0} \u662f\u9762\u5411{1}\u7684{2}\u5957\u4ef6\uff0c\u4e3b\u8981\u8986\u76d6{3}\u3002"
$workflowSummaryTemplate = ConvertFrom-JsonString "{0} \u662f A3S Science \u9762\u5411{1}\u63d0\u4f9b\u7684{2}\u5957\u4ef6\uff0c\u4e3b\u8981\u8986\u76d6{3}\u3002"
$referenceSummaryTemplate = ConvertFrom-JsonString "{0}\u3002\u672c\u5305\u4fdd\u5b58\u76ee\u5f55\u4fe1\u606f\u3001\u5206\u7c7b\u4e0e\u6765\u6e90\u94fe\u63a5\u3002"

$lines = [System.Collections.Generic.List[string]]::new()
$packageIds = [System.Collections.Generic.HashSet[string]]::new()

foreach ($resource in ($resources | Sort-Object -Property id)) {
    $resourceId = [string]$resource.id
    if ($resourceId -notmatch "^[a-z][a-z0-9-]*$") {
        throw "Resource '$resourceId' cannot be used as an A3S package segment."
    }

    $packageId = "a3s/$resourceId"
    if (-not $packageIds.Add($packageId)) {
        throw "Duplicate package identifier '$packageId'."
    }

    $disciplines = @(Get-TaxonomyNames @($resource.disciplines) $disciplineNames)
    $capabilities = @(Get-TaxonomyNames @($resource.capabilities) $capabilityNames)
    $disciplineText = if ($disciplines.Count -gt 0) { ($disciplines | Select-Object -First 2) -join $ideographicComma } else { $multidisciplinary }
    $capabilityText = if ($capabilities.Count -gt 0) { ($capabilities | Select-Object -First 2) -join $ideographicComma } else { $researchWorkflow }
    $kindZh = [string]$kindLabels.([string]$resource.kind)

    $version = "0.1.0"
    $packageRole = "adapter"
    $packageRoleZh = $adapterRoleZh
    $installContentZh = $adapterContentZh
    $summaryZh = $adapterSummaryTemplate -f $resource.name, $disciplineText, $kindZh, $capabilityText

    if ([string]$resource.origin -eq "native" -and [string]$resource.kind -eq "Skill") {
        $version = "1.0.0"
        $packageRole = "workflow"
        $packageRoleZh = $workflowRoleZh
        $installContentZh = $workflowContentZh
        $summaryZh = $workflowSummaryTemplate -f $resource.name, $disciplineText, $kindZh, $capabilityText
    } elseif ([string]$resource.origin -eq "native") {
        $packageRole = "interface"
        $packageRoleZh = $interfaceRoleZh
        $installContentZh = $interfaceContentZh
        $summaryZh = $workflowSummaryTemplate -f $resource.name, $disciplineText, $kindZh, $capabilityText
    } elseif ([string]$resource.origin -eq "sciencesoftware") {
        $packageRole = "reference"
        $packageRoleZh = $referenceRoleZh
        $installContentZh = $referenceContentZh
        $description = ([string]$resource.description).Trim().TrimEnd($fullStop)
        $summaryZh = $referenceSummaryTemplate -f $description
    }

    $record = [ordered]@{
        schemaVersion = 1
        resourceId = $resourceId
        name = [string]$resource.name
        kind = [string]$resource.kind
        origin = [string]$resource.origin
        sourceId = [string]$resource.sourceId
        packageName = "@a3s-science/$resourceId"
        packageId = $packageId
        componentId = "use/$packageId"
        version = $version
        channel = "stable"
        target = "any"
        status = "available"
        packageRole = $packageRole
        packageRoleZh = $packageRoleZh
        installContentZh = $installContentZh
        summaryZh = $summaryZh
        installCommand = "a3s install use/$packageId"
        upgradeCommand = "a3s upgrade use/$packageId"
        uninstallCommand = "a3s uninstall use/$packageId"
        sourceUrl = [string]$resource.url
        publishedAt = [string]$manifest.snapshotDate
    }
    $lines.Add(($record | ConvertTo-Json -Depth 8 -Compress))
}

[System.IO.File]::WriteAllLines($outputPath, $lines, $utf8WithoutBom)
Write-Host "Generated $($lines.Count) A3S Science package records at '$outputPath'."
