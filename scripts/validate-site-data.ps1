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
$roadmapsPath = Join-Path $repositoryRoot "roadmaps"

function Assert-Condition {
    param(
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Read-JsonLines {
    param([Parameter(Mandatory = $true)][string]$Path)

    $records = [System.Collections.Generic.List[object]]::new()
    $lineNumber = 0
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $lineNumber++
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }
        try {
            $records.Add(($line | ConvertFrom-Json))
        } catch {
            throw "Invalid JSONL in '$Path' at line ${lineNumber}: $($_.Exception.Message)"
        }
    }
    return ,([object[]]$records.ToArray())
}

function Test-JsonArray {
    param([AllowNull()][object]$Value)
    return $Value -is [System.Array]
}

function Test-HttpsUrl {
    param([AllowNull()][object]$Value)
    $uri = $null
    return [System.Uri]::TryCreate([string]$Value, [System.UriKind]::Absolute, [ref]$uri) -and $uri.Scheme -eq "https"
}

$taxonomy = Get-Content -LiteralPath (Join-Path $dataPath "taxonomy.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$manifest = Get-Content -LiteralPath (Join-Path $dataPath "catalog-manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$filter = Get-Content -LiteralPath (Join-Path $repositoryRoot "config/sciencesoftware-filter.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$profileConfiguration = Get-Content -LiteralPath (Join-Path $repositoryRoot "config/modernization-profiles.json") -Raw -Encoding UTF8 | ConvertFrom-Json

$native = Read-JsonLines (Join-Path $dataPath "native.jsonl")
$ecosystem = Read-JsonLines (Join-Path $dataPath "ecosystem.jsonl")
$scienceSoftware = Read-JsonLines (Join-Path $dataPath "sciencesoftware.jsonl")
$roadmapRecords = Read-JsonLines (Join-Path $dataPath "roadmaps.jsonl")
$resources = @($native) + @($ecosystem) + @($scienceSoftware)

Assert-Condition ($native.Count -eq [int]$manifest.sources.native.included) "Native resource count does not match the manifest."
Assert-Condition ($ecosystem.Count -eq [int]$manifest.sources.ecosystem.included) "Ecosystem resource count does not match the manifest."
Assert-Condition ($scienceSoftware.Count -eq [int]$manifest.sources.sciencesoftware.included) "ScienceSoftware resource count does not match the manifest."
Assert-Condition ($resources.Count -eq [int]$manifest.totalResources) "Total resource count does not match the manifest."
Assert-Condition ($roadmapRecords.Count -eq [int]$manifest.roadmaps.count) "Roadmap mapping count does not match the manifest."

$disciplineIds = @($taxonomy.disciplines | ForEach-Object { [string]$_.id })
$capabilityIds = @($taxonomy.capabilities | ForEach-Object { [string]$_.id })
Assert-Condition (($disciplineIds | Select-Object -Unique).Count -eq $disciplineIds.Count) "Taxonomy contains duplicate discipline identifiers."
Assert-Condition (($capabilityIds | Select-Object -Unique).Count -eq $capabilityIds.Count) "Taxonomy contains duplicate capability identifiers."
Assert-Condition (Test-HttpsUrl $taxonomy.disciplineBasis.url) "Taxonomy basis URL must use HTTPS."

foreach ($discipline in @($taxonomy.disciplines)) {
    Assert-Condition (-not [string]::IsNullOrWhiteSpace([string]$discipline.code)) "Discipline '$($discipline.id)' has no industry classification code."
    Assert-Condition (-not [string]::IsNullOrWhiteSpace([string]$discipline.name)) "Discipline '$($discipline.id)' has no English name."
    Assert-Condition (-not [string]::IsNullOrWhiteSpace([string]$discipline.nameZh)) "Discipline '$($discipline.id)' has no Chinese name."
    Assert-Condition (-not [string]::IsNullOrWhiteSpace([string]$discipline.group)) "Discipline '$($discipline.id)' has no English group name."
    Assert-Condition (-not [string]::IsNullOrWhiteSpace([string]$discipline.groupZh)) "Discipline '$($discipline.id)' has no Chinese group name."
}
foreach ($capability in @($taxonomy.capabilities)) {
    Assert-Condition (-not [string]::IsNullOrWhiteSpace([string]$capability.name)) "Capability '$($capability.id)' has no English name."
    Assert-Condition (-not [string]::IsNullOrWhiteSpace([string]$capability.nameZh)) "Capability '$($capability.id)' has no Chinese name."
}

$requiredFields = @("id", "name", "kind", "disciplines", "capabilities", "description", "url", "origin", "status", "featured", "tags", "language", "source", "sourceId")
$allowedKinds = @("Skill", "MCP", "Software", "Agent", "Workbench")
$allowedOrigins = @("native", "ecosystem", "sciencesoftware")
$resourceIds = [System.Collections.Generic.HashSet[string]]::new()

foreach ($resource in $resources) {
    foreach ($field in $requiredFields) {
        Assert-Condition ($resource.PSObject.Properties.Name -contains $field) "Resource '$($resource.id)' is missing required field '$field'."
    }
    $resourceId = [string]$resource.id
    Assert-Condition (-not [string]::IsNullOrWhiteSpace($resourceId)) "A resource has an empty identifier."
    Assert-Condition ($resourceIds.Add($resourceId)) "Duplicate resource identifier '$resourceId'."
    Assert-Condition ($allowedKinds -contains [string]$resource.kind) "Resource '$resourceId' has unsupported kind '$($resource.kind)'."
    Assert-Condition ($allowedOrigins -contains [string]$resource.origin) "Resource '$resourceId' has unsupported origin '$($resource.origin)'."
    Assert-Condition (Test-JsonArray $resource.disciplines) "Resource '$resourceId' must store disciplines as a JSON array."
    Assert-Condition (Test-JsonArray $resource.capabilities) "Resource '$resourceId' must store capabilities as a JSON array."
    Assert-Condition (Test-JsonArray $resource.tags) "Resource '$resourceId' must store tags as a JSON array."
    Assert-Condition (@($resource.disciplines).Count -gt 0) "Resource '$resourceId' has no research discipline."
    Assert-Condition (@($resource.capabilities).Count -gt 0) "Resource '$resourceId' has no research capability."
    Assert-Condition (Test-HttpsUrl $resource.url) "Resource '$resourceId' must have an HTTPS canonical URL."
    foreach ($disciplineId in @($resource.disciplines)) {
        Assert-Condition ($disciplineIds -contains [string]$disciplineId) "Resource '$resourceId' uses unknown discipline '$disciplineId'."
    }
    foreach ($capabilityId in @($resource.capabilities)) {
        Assert-Condition ($capabilityIds -contains [string]$capabilityId) "Resource '$resourceId' uses unknown capability '$capabilityId'."
    }
}

Assert-Condition (@($native | Where-Object { $_.kind -eq "Skill" }).Count -eq [int]$manifest.sources.native.skills) "Native Skill count does not match the manifest."
Assert-Condition (@($native | Where-Object { $_.kind -eq "MCP" }).Count -eq [int]$manifest.sources.native.mcpResources) "Native MCP resource count does not match the manifest."
$nativeMcpDomains = @($native | Where-Object { @($_.tags) -contains "mcp-domain" }).Count
Assert-Condition ($nativeMcpDomains -eq [int]$manifest.sources.native.mcpDomains) "Native MCP domain count does not match the manifest."

foreach ($expectedCategory in @($manifest.sources.sciencesoftware.categories)) {
    $actual = @($scienceSoftware | Where-Object { $_.sourceCategory -eq $expectedCategory.sourceName }).Count
    Assert-Condition ($actual -eq [int]$expectedCategory.included) "ScienceSoftware category '$($expectedCategory.sourceName)' has $actual records; expected $($expectedCategory.included)."
}

foreach ($category in @($filter.sourceCategories)) {
    $categoryRecords = @($scienceSoftware | Where-Object { $_.sourceCategory -eq $category.sourceName })
    $recordIds = @($categoryRecords | ForEach-Object { [int]$_.sourceId })
    if ($category.policy -eq "allow") {
        $expectedIds = @($category.allowIds | ForEach-Object { [int]$_ } | Sort-Object)
        $actualIds = @($recordIds | Sort-Object)
        Assert-Condition (($expectedIds -join ",") -eq ($actualIds -join ",")) "Allowlist mismatch for ScienceSoftware category '$($category.sourceName)'."
    } elseif ($category.policy -eq "include") {
        foreach ($excludedId in @($category.excludeIds)) {
            Assert-Condition (-not ($recordIds -contains [int]$excludedId)) "Excluded ScienceSoftware ID '$excludedId' is present."
        }
    } else {
        throw "Unsupported ScienceSoftware policy '$($category.policy)'."
    }
}

$profileIds = @($profileConfiguration.profiles | ForEach-Object { [string]$_.id })
Assert-Condition (($profileIds | Select-Object -Unique).Count -eq [int]$manifest.roadmaps.profileCount) "Modernization profile count does not match the manifest."
$roadmapResourceIds = [System.Collections.Generic.HashSet[string]]::new()
foreach ($record in $roadmapRecords) {
    $resourceId = [string]$record.resourceId
    Assert-Condition ($roadmapResourceIds.Add($resourceId)) "Duplicate roadmap mapping for '$resourceId'."
    Assert-Condition ($resourceIds.Contains($resourceId)) "Roadmap references unknown resource '$resourceId'."
    Assert-Condition ($profileIds -contains [string]$record.profileId) "Roadmap '$resourceId' uses unknown profile '$($record.profileId)'."
    Assert-Condition (Test-HttpsUrl $record.url) "Roadmap '$resourceId' must have an HTTPS URL."
    $roadmapFile = Join-Path $repositoryRoot ([string]$record.path).Replace("/", [System.IO.Path]::DirectorySeparatorChar)
    Assert-Condition (Test-Path -LiteralPath $roadmapFile -PathType Leaf) "Roadmap file is missing for '$resourceId'."
    $roadmapContent = Get-Content -LiteralPath $roadmapFile -Raw -Encoding UTF8
    Assert-Condition ($roadmapContent -match "Modern Cross-Platform Successor Roadmap") "Roadmap '$resourceId' has no successor heading."
    Assert-Condition ($roadmapContent -match "Windows, macOS, and Linux") "Roadmap '$resourceId' has no cross-platform contract."
    Assert-Condition ($roadmapContent -match "MCP") "Roadmap '$resourceId' has no MCP integration plan."
    Assert-Condition ($roadmapContent -notmatch "鈥|@\{id=") "Roadmap '$resourceId' contains a template encoding or interpolation error."
}
foreach ($resource in $scienceSoftware) {
    Assert-Condition ($roadmapResourceIds.Contains([string]$resource.id)) "ScienceSoftware resource '$($resource.id)' has no modernization roadmap."
}

$roadmapDirectories = @(Get-ChildItem -LiteralPath $roadmapsPath -Directory)
Assert-Condition ($roadmapDirectories.Count -eq $roadmapRecords.Count) "Roadmap directory count does not match roadmap records."

$indexPath = Join-Path $sitePath "index.html"
$indexContent = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
foreach ($asset in @("styles.css", "atlas.css", "content.css", "roadmaps.css", "responsive.css", "graph.js", "app.js", "vendor/3d-force-graph.min.js")) {
    $assetPath = Join-Path $sitePath $asset.Replace("/", [System.IO.Path]::DirectorySeparatorChar)
    Assert-Condition (Test-Path -LiteralPath $assetPath -PathType Leaf) "Site asset '$asset' is missing."
    Assert-Condition ($indexContent -match [regex]::Escape($asset)) "Site index does not reference '$asset'."
}

$vendorHash = (Get-FileHash -LiteralPath (Join-Path $sitePath "vendor/3d-force-graph.min.js") -Algorithm SHA256).Hash
Assert-Condition ($vendorHash -eq "D96E738EDCCA580EDD524730C1C6B05ED2EFCE028C23CA95DB1BF43033A72E42") "Vendored 3d-force-graph hash is unexpected."

Get-ChildItem -LiteralPath $sitePath -File |
    Where-Object { $_.Extension -in @(".js", ".css") } |
    ForEach-Object {
        $lineCount = (Get-Content -LiteralPath $_.FullName).Count
        Assert-Condition ($lineCount -lt 1000) "Site source '$($_.Name)' has $lineCount lines and must be split."
    }

Write-Host "Validated $($resources.Count) resources, $($disciplineIds.Count) disciplines, $($capabilityIds.Count) capabilities, and $($roadmapRecords.Count) roadmaps."
