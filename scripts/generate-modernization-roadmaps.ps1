[CmdletBinding()]
param(
    [string]$CatalogPath,
    [string]$TaxonomyPath,
    [string]$ProfilesPath,
    [string]$RoadmapsPath,
    [string]$OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($CatalogPath)) {
    $CatalogPath = Join-Path $PSScriptRoot "..\site\data\sciencesoftware.jsonl"
}
if ([string]::IsNullOrWhiteSpace($TaxonomyPath)) {
    $TaxonomyPath = Join-Path $PSScriptRoot "..\site\data\taxonomy.json"
}
if ([string]::IsNullOrWhiteSpace($ProfilesPath)) {
    $ProfilesPath = Join-Path $PSScriptRoot "..\config\modernization-profiles.json"
}
if ([string]::IsNullOrWhiteSpace($RoadmapsPath)) {
    $RoadmapsPath = Join-Path $PSScriptRoot "..\roadmaps"
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $PSScriptRoot "..\site\data\roadmaps.jsonl"
}

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)

function ConvertTo-StringArray {
    param([AllowNull()][object]$Value)

    if ($null -eq $Value) {
        return ,([string[]]@())
    }

    return ,([string[]]@($Value | ForEach-Object { [string]$_ }))
}

function Join-OrFallback {
    param(
        [string[]]$Values,
        [string]$Fallback
    )

    if ($Values.Count -eq 0) {
        return $Fallback
    }

    return ($Values -join ", ")
}

function ConvertTo-MarkdownText {
    param([AllowNull()][object]$Value)

    if ($null -eq $Value) {
        return ""
    }

    return (([string]$Value) -replace "\r?\n", " " -replace "\s+", " ").Trim()
}

function Get-ProfileMatch {
    param(
        [Parameter(Mandatory = $true)][object]$Resource,
        [Parameter(Mandatory = $true)][object[]]$Profiles
    )

    $resourceDisciplines = ConvertTo-StringArray $Resource.disciplines
    $resourceCapabilities = ConvertTo-StringArray $Resource.capabilities
    $searchText = "$($Resource.name) $($Resource.description)"
    $candidates = [System.Collections.Generic.List[object]]::new()

    for ($index = 0; $index -lt $Profiles.Count; $index++) {
        $profile = $Profiles[$index]
        $sourceCategories = ConvertTo-StringArray $profile.sourceCategories
        $disciplineAny = ConvertTo-StringArray $profile.disciplineAny
        $capabilityAny = ConvertTo-StringArray $profile.capabilityAny
        $pattern = [string]$profile.pattern

        $sourceMatches = $sourceCategories.Count -eq 0 -or $sourceCategories -contains [string]$Resource.sourceCategory
        $disciplineMatches = $disciplineAny.Count -eq 0 -or @($resourceDisciplines | Where-Object { $disciplineAny -contains $_ }).Count -gt 0
        $capabilityMatches = $capabilityAny.Count -eq 0 -or @($resourceCapabilities | Where-Object { $capabilityAny -contains $_ }).Count -gt 0
        $patternMatches = [string]::IsNullOrWhiteSpace($pattern) -or $searchText -match $pattern

        $hasPattern = -not [string]::IsNullOrWhiteSpace($pattern)
        $domainMatches = if ($sourceCategories.Count -gt 0 -and $disciplineAny.Count -gt 0) {
            $sourceMatches -or $disciplineMatches
        } else {
            $sourceMatches -and $disciplineMatches
        }
        $selectorMatches = $domainMatches -and $capabilityMatches
        if (-not ($selectorMatches -and $patternMatches)) {
            continue
        }

        $score = 0
        if ($hasPattern) {
            $score += 8
        }
        if ($sourceCategories.Count -gt 0 -and $sourceMatches) {
            $score += 4
        }
        if ($disciplineAny.Count -gt 0 -and $disciplineMatches) {
            $score += 2
        }
        if ($capabilityAny.Count -gt 0 -and $capabilityMatches) {
            $score += 1
        }

        $candidates.Add([pscustomobject]@{
            Profile = $profile
            Score = $score
            Order = $index
        })
    }

    $winner = $candidates |
        Sort-Object @{ Expression = "Score"; Descending = $true }, @{ Expression = "Order"; Descending = $false } |
        Select-Object -First 1

    if ($null -eq $winner) {
        throw "No modernization profile matches '$($Resource.id)'."
    }

    return $winner.Profile
}

function Get-TaxonomyLabels {
    param(
        [string[]]$Ids,
        [hashtable]$Lookup
    )

    $labels = [System.Collections.Generic.List[string]]::new()
    foreach ($id in $Ids) {
        if (-not $Lookup.ContainsKey($id)) {
            throw "Unknown taxonomy identifier '$id'."
        }

        $entry = $Lookup[$id]
        $labels.Add("$($entry.name) / $($entry.nameZh)")
    }

    return ,([string[]]$labels.ToArray())
}

function Add-BulletList {
    param(
        [Parameter(Mandatory = $true)][System.Text.StringBuilder]$Builder,
        [Parameter(Mandatory = $true)][object[]]$Items
    )

    foreach ($item in $Items) {
        [void]$Builder.AppendLine("- $item")
    }
}

$taxonomy = Get-Content -LiteralPath $TaxonomyPath -Raw -Encoding UTF8 | ConvertFrom-Json
$profileConfiguration = Get-Content -LiteralPath $ProfilesPath -Raw -Encoding UTF8 | ConvertFrom-Json
$profiles = @($profileConfiguration.profiles)
$resources = @(
    Get-Content -LiteralPath $CatalogPath -Encoding UTF8 |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_ | ConvertFrom-Json }
)

$disciplineLookup = @{}
foreach ($entry in @($taxonomy.disciplines)) {
    $disciplineLookup[[string]$entry.id] = $entry
}
$capabilityLookup = @{}
foreach ($entry in @($taxonomy.capabilities)) {
    $capabilityLookup[[string]$entry.id] = $entry
}

if (-not (Test-Path -LiteralPath $RoadmapsPath)) {
    New-Item -ItemType Directory -Path $RoadmapsPath -Force | Out-Null
}

$outputRecords = [System.Collections.Generic.List[object]]::new()
$profileAssignments = @{}

foreach ($resource in $resources) {
    $resourceId = [string]$resource.id
    if ($resourceId -notmatch "^sciencesoftware-[0-9]+$") {
        throw "Unsafe or unexpected resource identifier '$resourceId'."
    }

    $profile = Get-ProfileMatch -Resource $resource -Profiles $profiles
    $profileId = [string]$profile.id
    if (-not $profileAssignments.ContainsKey($profileId)) {
        $profileAssignments[$profileId] = [System.Collections.Generic.List[object]]::new()
    }
    $profileAssignments[$profileId].Add($resource)

    $disciplines = ConvertTo-StringArray $resource.disciplines
    $capabilities = ConvertTo-StringArray $resource.capabilities
    $disciplineLabels = Get-TaxonomyLabels -Ids $disciplines -Lookup $disciplineLookup
    $capabilityLabels = Get-TaxonomyLabels -Ids $capabilities -Lookup $capabilityLookup
    $coreCapabilities = ConvertTo-StringArray $profile.coreCapabilities
    $openStandards = ConvertTo-StringArray $profile.openStandards
    $architecture = ConvertTo-StringArray $profile.architecture
    $name = ConvertTo-MarkdownText $resource.name
    $description = ConvertTo-MarkdownText $resource.description
    $roadmapRelativePath = "roadmaps/$resourceId/ROADMAP.md"
    $roadmapUrl = "https://github.com/A3S-Lab/Science/blob/main/$roadmapRelativePath"
    $resourceDirectory = Join-Path $RoadmapsPath $resourceId

    if (-not (Test-Path -LiteralPath $resourceDirectory)) {
        New-Item -ItemType Directory -Path $resourceDirectory -Force | Out-Null
    }

    $builder = New-Object System.Text.StringBuilder
    [void]$builder.AppendLine("# ${name}: Modern Cross-Platform Successor Roadmap")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("> Independent clean-room product proposal generated by A3S Science. It is not affiliated with the catalog entry or its vendor, and it does not assert that the current product lacks modern or cross-platform support.")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("## Product frame")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("- **Source snapshot:** [$name]($($resource.url)), ScienceSoftware catalog ID $($resource.sourceId), retrieved $($resource.retrievedAt)")
    [void]$builder.AppendLine("- **Catalog descriptor:** $description")
    [void]$builder.AppendLine("- **Successor archetype:** $($profile.name) / $($profile.nameZh)")
    [void]$builder.AppendLine("- **Research disciplines:** $(Join-OrFallback -Values $disciplineLabels -Fallback "Unclassified")")
    [void]$builder.AppendLine("- **Research capabilities:** $(Join-OrFallback -Values $capabilityLabels -Fallback "Unclassified")")
    [void]$builder.AppendLine("- **Planning complexity:** $($profile.complexity)")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("The product anchor is **$description**. The successor should preserve that research intent while replacing opaque, machine-bound workflows with portable projects, documented interfaces, and reproducible computation.")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("## Product vision")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine($profile.vision)
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("A successful implementation should let a researcher start in the browser, continue on Windows, macOS, or Linux, automate the same work from a CLI or notebook, and move a validated workload to a container or HPC scheduler without changing the scientific definition of the project.")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("## Core scope")
    [void]$builder.AppendLine()
    Add-BulletList -Builder $builder -Items $coreCapabilities
    [void]$builder.AppendLine("- Portable project manifests that record inputs, parameters, software versions, random seeds, and output checksums")
    [void]$builder.AppendLine("- A stable API exposed through typed SDKs, a CLI, and an MCP server so Skills and research agents can call the same validated operations")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("## Platform contract")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("- **Web:** responsive browser application and installable PWA; no mandatory cloud account for local projects")
    [void]$builder.AppendLine("- **Desktop:** signed Tauri packages for Windows, macOS, and Linux sharing the web interface")
    [void]$builder.AppendLine("- **Automation:** identical commands on PowerShell, Bash, notebooks, and CI runners")
    [void]$builder.AppendLine("- **Scale-out:** OCI containers, resumable jobs, and adapters for Slurm or Kubernetes where workloads require them")
    [void]$builder.AppendLine("- **Accessibility:** keyboard-complete operation, WCAG 2.2 AA contrast, reduced-motion support, and screen-reader names")
    [void]$builder.AppendLine("- **Internationalization:** UTF-8 projects and an English-first interface with complete Simplified Chinese localization")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("## Reference architecture")
    [void]$builder.AppendLine()
    Add-BulletList -Builder $builder -Items $architecture
    [void]$builder.AppendLine("- Content-addressed artifacts and an append-only provenance log separate scientific state from interface state")
    [void]$builder.AppendLine("- Capability permissions isolate filesystem, network, compute, and instrument access for plugins, Skills, and MCP clients")
    [void]$builder.AppendLine("- Versioned schemas and deterministic migrations keep projects readable across releases")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("## Interoperability")
    [void]$builder.AppendLine()
    Add-BulletList -Builder $builder -Items $openStandards
    [void]$builder.AppendLine("- RO-Crate-compatible provenance and CITATION.cff metadata for publication and archiving")
    [void]$builder.AppendLine("- JSON Schema or equivalent machine-readable contracts for every public operation")
    [void]$builder.AppendLine("- Importers are read-only by default; exporters include round-trip and loss reports")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("## Delivery roadmap")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("### Phase 0 - Evidence and specification (weeks 0-4)")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("- Interview at least eight researchers who use workflows related to `"$description`".")
    [void]$builder.AppendLine("- Collect only redistributable fixtures and document expected scientific results with tolerances.")
    [void]$builder.AppendLine("- Publish the project schema, threat model, licensing policy, and compatibility non-goals.")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("### Phase 1 - Reproducible vertical slice (weeks 4-$($profile.mvpWeeks))")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("- Implement one end-to-end research workflow from import through validated result and export.")
    [void]$builder.AppendLine("- Ship browser/PWA, desktop previews, CLI parity, provenance capture, and deterministic example projects.")
    [void]$builder.AppendLine("- Publish an extension API plus one A3S Skill and one MCP tool group for the vertical slice.")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("### Phase 2 - Public beta (weeks $($profile.mvpWeeks)-$($profile.betaWeeks))")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("- Add the remaining core capabilities, batch execution, checkpoints, collaboration, and large-project profiling.")
    [void]$builder.AppendLine("- Complete Windows, macOS, and Linux packaging with signed, reproducible release artifacts.")
    [void]$builder.AppendLine("- Run blinded comparison studies against published reference workflows and record all discrepancies.")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("### Phase 3 - Stable 1.0 (weeks $($profile.betaWeeks)-$($profile.v1Weeks))")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("- Freeze stable project and API contracts; publish migration, backup, and long-term support policies.")
    [void]$builder.AppendLine("- Complete accessibility, privacy, security, performance, and scientific-method audits.")
    [void]$builder.AppendLine("- Deposit reference datasets, method notes, checksums, and release artifacts in a durable archive.")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("## Verification plan")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("- **Scientific validity:** $($profile.validation)")
    [void]$builder.AppendLine("- **Cross-platform parity:** run identical fixture projects on current Windows, macOS, and two Linux distributions; compare normalized artifacts and tolerances.")
    [void]$builder.AppendLine("- **Reproducibility:** rebuild every release in CI, rerun examples from a clean machine, and verify declared seeds, environments, and checksums.")
    [void]$builder.AppendLine("- **API stability:** contract-test the UI, CLI, SDK, Skill, and MCP paths against the same operation definitions.")
    [void]$builder.AppendLine("- **Human factors:** observe domain researchers completing representative tasks without developer assistance.")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("## Initial engineering backlog")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("1. Write the workflow and acceptance specification for `"$description`".")
    [void]$builder.AppendLine("2. Curate a license-safe golden fixture with independently reviewed expected results.")
    [void]$builder.AppendLine("3. Define the portable project manifest and provenance event schema.")
    [void]$builder.AppendLine("4. Build the headless core operation before adding desktop-specific behavior.")
    [void]$builder.AppendLine("5. Add one cross-platform end-to-end test to Windows, macOS, and Linux CI.")
    [void]$builder.AppendLine("6. Expose the validated operation as CLI, typed SDK, A3S Skill, and MCP contracts.")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("## Risks and non-goals")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("- Numerical agreement must be defined by domain tolerances and independent reference results, not by copying a proprietary implementation.")
    [void]$builder.AppendLine("- File-format support does not imply compatibility when a format is undocumented; prefer documented standards and publish loss reports.")
    [void]$builder.AppendLine("- Agent automation never bypasses permissions, provenance, validation gates, or researcher approval for consequential actions.")
    [void]$builder.AppendLine("- Version 1.0 is not a promise to reproduce every feature or historical quirk of the catalog entry.")
    [void]$builder.AppendLine("- Cloud services remain optional unless a workflow explicitly requires shared infrastructure or remote compute.")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("---")
    [void]$builder.AppendLine()
    [void]$builder.AppendLine("Generated from the A3S Science catalog. Edit this roadmap when user research or validation evidence changes the plan.")

    $roadmapFile = Join-Path $resourceDirectory "ROADMAP.md"
    [System.IO.File]::WriteAllText($roadmapFile, $builder.ToString(), $utf8WithoutBom)

    $outputRecords.Add([ordered]@{
        resourceId = $resourceId
        profileId = $profileId
        profileName = [string]$profile.name
        profileNameZh = [string]$profile.nameZh
        complexity = [string]$profile.complexity
        path = $roadmapRelativePath
        url = $roadmapUrl
        milestones = @(
            [ordered]@{ id = "evidence"; label = "Evidence"; week = 4 },
            [ordered]@{ id = "mvp"; label = "MVP"; week = [int]$profile.mvpWeeks },
            [ordered]@{ id = "beta"; label = "Beta"; week = [int]$profile.betaWeeks },
            [ordered]@{ id = "v1"; label = "1.0"; week = [int]$profile.v1Weeks }
        )
    })
}

$indexBuilder = New-Object System.Text.StringBuilder
[void]$indexBuilder.AppendLine("# Research Software Modernization Roadmaps")
[void]$indexBuilder.AppendLine()
[void]$indexBuilder.AppendLine("This directory contains one independent, clean-room, cross-platform successor proposal for each research-relevant ScienceSoftware catalog entry retained by A3S Science.")
[void]$indexBuilder.AppendLine()
[void]$indexBuilder.AppendLine("These documents are planning artifacts, not product-status claims and not statements of affiliation. Every plan favors open standards, browser/PWA access, Windows/macOS/Linux packaging, headless automation, reproducibility, Skills, and MCP integration.")
[void]$indexBuilder.AppendLine()
[void]$indexBuilder.AppendLine("**Generated roadmaps:** $($resources.Count)")
[void]$indexBuilder.AppendLine()

foreach ($profile in $profiles) {
    $profileId = [string]$profile.id
    if (-not $profileAssignments.ContainsKey($profileId)) {
        continue
    }

    $assignedResources = @($profileAssignments[$profileId] | Sort-Object name)
    [void]$indexBuilder.AppendLine("## $($profile.name) / $($profile.nameZh) ($($assignedResources.Count))")
    [void]$indexBuilder.AppendLine()
    foreach ($resource in $assignedResources) {
        $itemName = ConvertTo-MarkdownText $resource.name
        $itemDescription = ConvertTo-MarkdownText $resource.description
        [void]$indexBuilder.AppendLine("- [$itemName]($($resource.id)/ROADMAP.md) - $itemDescription")
    }
    [void]$indexBuilder.AppendLine()
}

$indexContent = $indexBuilder.ToString().TrimEnd() + [Environment]::NewLine
[System.IO.File]::WriteAllText((Join-Path $RoadmapsPath "README.md"), $indexContent, $utf8WithoutBom)

$sortedOutputRecords = @($outputRecords | Sort-Object resourceId)
$jsonLines = @($sortedOutputRecords | ForEach-Object { $_ | ConvertTo-Json -Depth 8 -Compress })
$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}
[System.IO.File]::WriteAllLines($OutputPath, $jsonLines, $utf8WithoutBom)

$profileAssignments.GetEnumerator() |
    Sort-Object Name |
    ForEach-Object {
        [pscustomobject]@{
            Profile = $_.Name
            Roadmaps = $_.Value.Count
        }
    } |
    Format-Table -AutoSize

Write-Host "Generated $($resources.Count) roadmaps under $RoadmapsPath"
Write-Host "Wrote $($sortedOutputRecords.Count) roadmap records to $OutputPath"
