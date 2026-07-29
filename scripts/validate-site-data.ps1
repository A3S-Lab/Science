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
$registryPath = Join-Path $sitePath "registry"

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
$roadmapRecords = Read-JsonLines (Join-Path $roadmapsPath "index.jsonl")
$packages = Read-JsonLines (Join-Path $dataPath "packages.jsonl")
$resources = @($native) + @($ecosystem) + @($scienceSoftware)

Assert-Condition ($native.Count -eq [int]$manifest.sources.native.included) "Native resource count does not match the manifest."
Assert-Condition ($ecosystem.Count -eq [int]$manifest.sources.ecosystem.included) "Ecosystem resource count does not match the manifest."
Assert-Condition ($scienceSoftware.Count -eq [int]$manifest.sources.sciencesoftware.included) "ScienceSoftware resource count does not match the manifest."
Assert-Condition ($resources.Count -eq [int]$manifest.totalResources) "Total resource count does not match the manifest."
Assert-Condition ($roadmapRecords.Count -eq $scienceSoftware.Count) "Internal roadmap mapping count does not match the retained ScienceSoftware catalog."
Assert-Condition ($packages.Count -eq [int]$manifest.packages.count) "Package count does not match the manifest."
Assert-Condition ($packages.Count -eq $resources.Count) "Every resource must have exactly one A3S Science package."

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

$packageIds = [System.Collections.Generic.HashSet[string]]::new()
$packageResourceIds = [System.Collections.Generic.HashSet[string]]::new()
$packageRequiredFields = @(
    "schemaVersion", "resourceId", "name", "kind", "origin", "sourceId", "packageName",
    "packageId", "componentId", "version", "channel", "target", "status",
    "packageRole", "packageRoleZh", "installContentZh", "summaryZh",
    "installCommand", "upgradeCommand", "uninstallCommand", "sourceUrl",
    "publishedAt"
)
foreach ($package in $packages) {
    foreach ($field in $packageRequiredFields) {
        Assert-Condition ($package.PSObject.Properties.Name -contains $field) "Package '$($package.resourceId)' is missing required field '$field'."
    }
    $resourceId = [string]$package.resourceId
    $packageId = [string]$package.packageId
    $componentId = [string]$package.componentId
    Assert-Condition ($packageResourceIds.Add($resourceId)) "Duplicate package mapping for resource '$resourceId'."
    Assert-Condition ($resourceIds.Contains($resourceId)) "Package references unknown resource '$resourceId'."
    Assert-Condition ($packageIds.Add($packageId)) "Duplicate package identifier '$packageId'."
    Assert-Condition ($packageId -eq "a3s/$resourceId") "Package '$resourceId' does not use the canonical A3S publisher ID."
    Assert-Condition ($componentId -eq "use/$packageId") "Package '$resourceId' does not use the delegated Use component ID."
    Assert-Condition ([string]$package.packageName -eq "@a3s-science/$resourceId") "Package '$resourceId' has an invalid npm-style display name."
    Assert-Condition ([string]$package.installCommand -eq "a3s install $componentId") "Package '$resourceId' has an invalid install command."
    Assert-Condition ([string]$package.upgradeCommand -eq "a3s upgrade $componentId") "Package '$resourceId' has an invalid upgrade command."
    Assert-Condition ([string]$package.uninstallCommand -eq "a3s uninstall $componentId") "Package '$resourceId' has an invalid uninstall command."
    Assert-Condition ([string]$package.channel -eq "stable") "Package '$resourceId' must use the stable channel."
    Assert-Condition ([string]$package.target -eq "any") "Package '$resourceId' must use the cross-platform 'any' target."
    Assert-Condition ([string]$package.status -eq "available") "Package '$resourceId' must be installable."
    Assert-Condition ([string]$package.version -match "^\d+\.\d+\.\d+$") "Package '$resourceId' has an invalid semantic version."
    Assert-Condition (-not [string]::IsNullOrWhiteSpace([string]$package.summaryZh)) "Package '$resourceId' has no Chinese summary."
    Assert-Condition (-not [string]::IsNullOrWhiteSpace([string]$package.installContentZh)) "Package '$resourceId' does not explain its installation content."
    Assert-Condition (Test-HttpsUrl $package.sourceUrl) "Package '$resourceId' must retain an HTTPS source URL."
    Assert-Condition ($package.PSObject.Properties.Name -notcontains "roadmapUrl") "Package '$resourceId' exposes an internal engineering roadmap."
    Assert-Condition (([string]$package.summaryZh + [string]$package.installContentZh) -notmatch "\u7814\u53d1\u84dd\u56fe|\u7814\u53d1\u8ba1\u5212|\u8def\u7ebf\u56fe|roadmap") "Package '$resourceId' promotes internal engineering planning."
}
foreach ($resourceId in $resourceIds) {
    Assert-Condition ($packageResourceIds.Contains($resourceId)) "Resource '$resourceId' has no A3S package."
}
foreach ($role in @("workflow", "interface", "adapter", "reference")) {
    $actualRoleCount = @($packages | Where-Object { $_.packageRole -eq $role }).Count
    Assert-Condition ($actualRoleCount -eq [int]$manifest.packages.roles.$role) "Package role '$role' count does not match the manifest."
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
Assert-Condition (($profileIds | Select-Object -Unique).Count -eq $profileIds.Count) "Modernization profile configuration contains duplicate identifiers."
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
    Assert-Condition ($roadmapContent -match [regex]::Escape("a3s install use/a3s/$resourceId")) "Roadmap '$resourceId' has no canonical A3S install command."
    Assert-Condition ($roadmapContent -notmatch "\u9225|@\{id=") "Roadmap '$resourceId' contains a template encoding or interpolation error."
}
foreach ($resource in $scienceSoftware) {
    Assert-Condition ($roadmapResourceIds.Contains([string]$resource.id)) "ScienceSoftware resource '$($resource.id)' has no modernization roadmap."
}

$roadmapDirectories = @(Get-ChildItem -LiteralPath $roadmapsPath -Directory)
Assert-Condition ($roadmapDirectories.Count -eq $roadmapRecords.Count) "Roadmap directory count does not match roadmap records."

$registryIndexPath = Join-Path $registryPath "index.json"
Assert-Condition (Test-Path -LiteralPath $registryIndexPath -PathType Leaf) "The Science registry index is missing."
$registryIndex = Get-Content -LiteralPath $registryIndexPath -Raw -Encoding UTF8 | ConvertFrom-Json
Assert-Condition ([int]$registryIndex.packageCount -eq $packages.Count) "Registry package count does not match the package index."
Assert-Condition ([int]$registryIndex.metadataVersion -eq 3) "Registry metadata version does not match the published catalog revision."
Assert-Condition ([string]$registryIndex.registryUrl -eq [string]$manifest.packages.registryUrl) "Registry URL does not match the catalog manifest."
Assert-Condition ([string]$registryIndex.installPattern -eq "a3s install use/a3s/<resource-id>") "Registry install pattern does not match the A3S component contract."

$metadataPath = Join-Path $registryPath "metadata"
foreach ($metadataFile in @("root.json", "targets.json", "snapshot.json", "timestamp.json")) {
    Assert-Condition (Test-Path -LiteralPath (Join-Path $metadataPath $metadataFile) -PathType Leaf) "TUF metadata '$metadataFile' is missing."
}
$rootPath = Join-Path $metadataPath "root.json"
$rootDigest = "sha256:" + (Get-FileHash -LiteralPath $rootPath -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-Condition ($rootDigest -eq [string]$registryIndex.rootSha256) "Published TUF root digest does not match the registry index."
Assert-Condition ([string]$registryIndex.enrollCommand -eq "a3s registry add $($registryIndex.registryUrl) --trust-root $rootDigest --yes") "Registry enrollment command is invalid."

$targetsMetadata = Get-Content -LiteralPath (Join-Path $metadataPath "targets.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$targetProperties = @($targetsMetadata.signed.targets.PSObject.Properties)
Assert-Condition ($targetProperties.Count -eq $packages.Count) "TUF targets metadata does not contain one target per package."
$signedPackageIds = [System.Collections.Generic.HashSet[string]]::new()
$targetsRoot = Join-Path $registryPath "targets"
foreach ($targetProperty in $targetProperties) {
    $targetName = [string]$targetProperty.Name
    $target = $targetProperty.Value
    $a3s = $target.custom.a3s
    $packageId = [string]$a3s.packageId
    Assert-Condition ($packageIds.Contains($packageId)) "TUF target '$targetName' references unknown package '$packageId'."
    Assert-Condition ($signedPackageIds.Add($packageId)) "TUF metadata contains duplicate package '$packageId'."
    Assert-Condition ([string]$a3s.schema -eq "a3s.use.plugin-catalog.v1") "TUF target '$targetName' has no complete plugin catalog record."
    Assert-Condition (-not [string]::IsNullOrWhiteSpace([string]$a3s.displayName)) "TUF target '$targetName' has no display name."
    Assert-Condition (-not [string]::IsNullOrWhiteSpace([string]$a3s.description)) "TUF target '$targetName' has no description."
    Assert-Condition ([string]$a3s.publisher -eq "a3s") "TUF target '$targetName' has an invalid publisher."
    Assert-Condition (@($a3s.categories) -contains "science") "TUF target '$targetName' is missing the Science category."
    Assert-Condition ([string]$a3s.requiresUse -eq ">=0.2.1, <0.4.0") "TUF target '$targetName' has an invalid A3S Use compatibility range."
    Assert-Condition ([string]$a3s.channel -eq "stable") "TUF target '$targetName' has an invalid channel."
    Assert-Condition ([string]$a3s.target -eq "any") "TUF target '$targetName' is not cross-platform."
    Assert-Condition (@($a3s.surfaces).Count -eq 1) "TUF target '$targetName' must declare exactly one packaged surface."
    Assert-Condition ([string]$a3s.surfaces[0].kind -eq "skill") "TUF target '$targetName' declares a surface that is not packaged."
    Assert-Condition ([string]$a3s.permissionCeiling.schema -eq "a3s.use.plugin-permissions.v1") "TUF target '$targetName' has an invalid permission ceiling."
    Assert-Condition (@($a3s.permissionCeiling.surfaces).Count -eq 0) "TUF target '$targetName' requests permissions that its Skill wrapper does not need."
    Assert-Condition ([string]$a3s.archive.targetName -eq $targetName) "TUF target '$targetName' has a mismatched catalog archive path."
    Assert-Condition ([long]$a3s.archive.length -eq [long]$target.length) "TUF target '$targetName' has a mismatched catalog archive length."
    Assert-Condition ([string]$a3s.archive.sha256 -eq "sha256:$([string]$target.hashes.sha256)") "TUF target '$targetName' has a mismatched catalog archive SHA-256."
    Assert-Condition ([long]$a3s.package.expandedBytes -gt 0) "TUF target '$targetName' has no expanded-size bound."
    Assert-Condition ([long]$a3s.package.fileCount -gt 0) "TUF target '$targetName' has no file-count bound."
    Assert-Condition ([string]$a3s.license -eq "LicenseRef-A3S-Science-Catalog") "TUF target '$targetName' has an invalid catalog license."
    Assert-Condition (Test-HttpsUrl $a3s.repository) "TUF target '$targetName' has an invalid repository URL."
    Assert-Condition ([string]$a3s.availability.state -eq "available") "TUF target '$targetName' is not available."
    Assert-Condition ($targetName.StartsWith("extensions/$packageId/$($a3s.version)/stable/any/")) "TUF target '$targetName' has a non-canonical package path."
    $artifactPath = Join-Path $targetsRoot $targetName.Replace("/", [System.IO.Path]::DirectorySeparatorChar)
    Assert-Condition (Test-Path -LiteralPath $artifactPath -PathType Leaf) "Signed package artifact '$targetName' is missing."
    $artifact = Get-Item -LiteralPath $artifactPath
    Assert-Condition ($artifact.Length -eq [long]$target.length) "Signed package artifact '$targetName' has an invalid length."
    $artifactHash = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Assert-Condition ($artifactHash -eq [string]$target.hashes.sha256) "Signed package artifact '$targetName' has an invalid SHA-256."
}
$artifactFiles = @(Get-ChildItem -LiteralPath $targetsRoot -Recurse -File)
Assert-Condition ($artifactFiles.Count -eq $packages.Count) "Registry target directory contains orphaned or missing package artifacts."

$indexPath = Join-Path $sitePath "index.html"
$indexContent = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
$appContent = Get-Content -LiteralPath (Join-Path $sitePath "app.js") -Raw -Encoding UTF8
$graphContent = Get-Content -LiteralPath (Join-Path $sitePath "graph.js") -Raw -Encoding UTF8
$detailContent = Get-Content -LiteralPath (Join-Path $sitePath "detail.js") -Raw -Encoding UTF8
Assert-Condition ($indexContent -match '<html lang="zh-CN">') "The website must use Chinese as its primary language."
Assert-Condition ($appContent -match [regex]::Escape("packages.jsonl")) "The website does not load the A3S package index."
Assert-Condition ($appContent -match [regex]::Escape("registry/index.json")) "The website does not load the signed registry index."
Assert-Condition ($indexContent -notmatch "resource-dialog") "The homepage must link to permanent detail pages instead of using a resource dialog."
Assert-Condition (-not (Test-Path -LiteralPath (Join-Path $dataPath "roadmaps.jsonl"))) "Internal engineering roadmap data must not be published with the site."
$publicInterfaceContent = $indexContent + $appContent + $graphContent + $detailContent
Assert-Condition ($publicInterfaceContent -notmatch "\u7814\u53d1\u8ba1\u5212|\u8def\u7ebf\u56fe|roadmap|modernization") "Internal engineering roadmaps must not be promoted in the public catalog interface."
foreach ($asset in @("styles.css", "atlas.css", "content.css", "responsive.css", "graph.js", "app.js", "vendor/3d-force-graph.min.js")) {
    $assetPath = Join-Path $sitePath $asset.Replace("/", [System.IO.Path]::DirectorySeparatorChar)
    Assert-Condition (Test-Path -LiteralPath $assetPath -PathType Leaf) "Site asset '$asset' is missing."
    Assert-Condition ($indexContent -match [regex]::Escape($asset)) "Site index does not reference '$asset'."
}
foreach ($asset in @("detail.css", "detail.js")) {
    Assert-Condition (Test-Path -LiteralPath (Join-Path $sitePath $asset) -PathType Leaf) "Detail-page asset '$asset' is missing."
}

$resourcePagesPath = Join-Path $sitePath "resources"
$resourcePageDirectories = @(Get-ChildItem -LiteralPath $resourcePagesPath -Directory)
Assert-Condition ($resourcePageDirectories.Count -eq $resources.Count) "Resource detail-page count does not match the catalog."
foreach ($resource in $resources) {
    $resourceId = [string]$resource.id
    $resourcePage = Join-Path (Join-Path $resourcePagesPath $resourceId) "index.html"
    Assert-Condition (Test-Path -LiteralPath $resourcePage -PathType Leaf) "Resource '$resourceId' has no permanent detail page."
    $resourcePageContent = Get-Content -LiteralPath $resourcePage -Raw -Encoding UTF8
    Assert-Condition ($resourcePageContent -match '<html lang="zh-CN">') "Detail page '$resourceId' does not use Chinese as its primary language."
    Assert-Condition ($resourcePageContent -match [regex]::Escape("data-resource-id=`"$resourceId`"")) "Detail page '$resourceId' has an invalid resource identifier."
    Assert-Condition ($resourcePageContent -match [regex]::Escape("https://a3s-lab.github.io/Science/resources/$resourceId/")) "Detail page '$resourceId' has no canonical URL."
    Assert-Condition ($resourcePageContent -match [regex]::Escape("../../detail.js")) "Detail page '$resourceId' does not load the shared detail controller."
    Assert-Condition ($resourcePageContent -notmatch "roadmap-section|\u8de8\u5e73\u53f0\u7814\u53d1\u8ba1\u5212") "Detail page '$resourceId' exposes an internal engineering roadmap."
}

$sitemapPath = Join-Path $sitePath "sitemap.xml"
Assert-Condition (Test-Path -LiteralPath $sitemapPath -PathType Leaf) "The resource sitemap is missing."
$sitemapContent = Get-Content -LiteralPath $sitemapPath -Raw -Encoding UTF8
$sitemapUrlCount = ([regex]::Matches($sitemapContent, "<url>")).Count
Assert-Condition ($sitemapUrlCount -eq ($resources.Count + 1)) "The sitemap does not contain the homepage and every resource detail page."

$vendorHash = (Get-FileHash -LiteralPath (Join-Path $sitePath "vendor/3d-force-graph.min.js") -Algorithm SHA256).Hash
Assert-Condition ($vendorHash -eq "D96E738EDCCA580EDD524730C1C6B05ED2EFCE028C23CA95DB1BF43033A72E42") "Vendored 3d-force-graph hash is unexpected."

Get-ChildItem -LiteralPath $sitePath -File |
    Where-Object { $_.Extension -in @(".js", ".css") } |
    ForEach-Object {
        $lineCount = (Get-Content -LiteralPath $_.FullName).Count
        Assert-Condition ($lineCount -lt 1000) "Site source '$($_.Name)' has $lineCount lines and must be split."
        if ($_.Extension -eq ".css") {
            $stylesheet = Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8
            $smallFontPattern = "font(?:-size)?\s*:[^;]*(?<![\d.])(?:[0-9](?:\.\d+)?|1[01](?:\.\d+)?)px"
            Assert-Condition ($stylesheet -notmatch $smallFontPattern) "Site stylesheet '$($_.Name)' contains text smaller than 12px."
        }
    }

Write-Host "Validated $($resources.Count) resources, $($packages.Count) signed packages, $($disciplineIds.Count) disciplines, $($capabilityIds.Count) capabilities, and $($roadmapRecords.Count) roadmaps."
