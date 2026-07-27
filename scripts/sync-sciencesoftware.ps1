[CmdletBinding()]
param(
    [string]$OutputPath,
    [string]$FilterPath,
    [ValidateRange(0, 5000)]
    [int]$DelayMilliseconds = 150,
    [string]$RetrievedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $PSScriptRoot "..\site\data\sciencesoftware.jsonl"
}
if ([string]::IsNullOrWhiteSpace($FilterPath)) {
    $FilterPath = Join-Path $PSScriptRoot "..\config\sciencesoftware-filter.json"
}

$apiUrl = "https://www.sciencesoftware.com.cn/manager/mobile/index.php?act=index&op=softwarelist"
$detailsBaseUrl = "https://www.sciencesoftware.com.cn/web/details.html?id="
$headers = @{
    "User-Agent" = "A3S-Science-Catalog/1.0 (+https://github.com/A3S-Lab/Science)"
}

function ConvertTo-PlainText {
    param([AllowNull()][object]$Value)

    if ($null -eq $Value) {
        return ""
    }

    $decoded = [System.Net.WebUtility]::HtmlDecode([string]$Value)
    $withoutMarkup = [regex]::Replace($decoded, "<[^>]+>", " ")
    return ([regex]::Replace($withoutMarkup, "\s+", " ")).Trim()
}

function Test-ResearchRelevance {
    param(
        [Parameter(Mandatory = $true)][object]$Category,
        [Parameter(Mandatory = $true)][int]$SoftwareId
    )

    switch ([string]$Category.policy) {
        "include" {
            return -not (@($Category.excludeIds) -contains $SoftwareId)
        }
        "allow" {
            return @($Category.allowIds) -contains $SoftwareId
        }
        default {
            throw "Unsupported category policy '$($Category.policy)' for category $($Category.id)."
        }
    }
}

function Get-SoftwarePage {
    param(
        [Parameter(Mandatory = $true)][int]$CategoryId,
        [Parameter(Mandatory = $true)][int]$Page
    )

    return Invoke-RestMethod `
        -Uri $apiUrl `
        -Method Post `
        -Headers $headers `
        -Body @{
            categoryid = $CategoryId
            keyword = ""
            curpage = $Page
            type = "list"
        }
}

$filter = Get-Content -LiteralPath $FilterPath -Raw -Encoding UTF8 | ConvertFrom-Json
$records = [System.Collections.Generic.List[object]]::new()
$seenIds = [System.Collections.Generic.HashSet[string]]::new()
$reports = [System.Collections.Generic.List[object]]::new()

foreach ($category in $filter.sourceCategories) {
    $categoryId = [int]$category.id
    $firstPage = Get-SoftwarePage -CategoryId $categoryId -Page 1

    if ([int]$firstPage.code -ne 200) {
        throw "ScienceSoftware returned code $($firstPage.code) for category $categoryId."
    }

    $sourceTotal = [int]$firstPage.datas.totalnum
    $pageCount = [Math]::Max(1, [Math]::Ceiling($sourceTotal / 10))
    $sourceItems = [System.Collections.Generic.List[object]]::new()

    foreach ($item in @($firstPage.datas.softwares)) {
        $sourceItems.Add($item)
    }

    if ($pageCount -gt 1) {
        foreach ($page in 2..$pageCount) {
            if ($DelayMilliseconds -gt 0) {
                Start-Sleep -Milliseconds $DelayMilliseconds
            }

            $response = Get-SoftwarePage -CategoryId $categoryId -Page $page
            if ([int]$response.code -ne 200) {
                throw "ScienceSoftware returned code $($response.code) for category $categoryId page $page."
            }

            foreach ($item in @($response.datas.softwares)) {
                $sourceItems.Add($item)
            }
        }
    }

    $includedCount = 0
    foreach ($item in $sourceItems) {
        $softwareId = [int]$item.id
        if (-not (Test-ResearchRelevance -Category $category -SoftwareId $softwareId)) {
            continue
        }

        $id = "sciencesoftware-$softwareId"
        if (-not $seenIds.Add($id)) {
            throw "Duplicate ScienceSoftware record '$id'."
        }

        $name = ConvertTo-PlainText $item.name
        $description = ConvertTo-PlainText $item.cname
        if ([string]::IsNullOrWhiteSpace($description)) {
            $description = "Research software listed in the $($category.name) category."
        }
        $classificationOverride = @($filter.classificationOverrides | Where-Object { [int]$_.id -eq $softwareId }) | Select-Object -First 1
        $disciplines = if ($null -ne $classificationOverride) {
            @($classificationOverride.disciplines | ForEach-Object { [string]$_ })
        } else {
            @($category.disciplines | ForEach-Object { [string]$_ })
        }
        $capabilities = if ($null -ne $classificationOverride) {
            @($classificationOverride.capabilities | ForEach-Object { [string]$_ })
        } else {
            @($category.capabilities | ForEach-Object { [string]$_ })
        }

        $records.Add([ordered]@{
            id = $id
            name = $name
            kind = "Software"
            disciplines = @($disciplines)
            capabilities = @($capabilities)
            description = $description
            url = "$detailsBaseUrl$softwareId"
            origin = "sciencesoftware"
            status = "External"
            featured = $false
            tags = @([string]$category.name, "Commercial catalog")
            language = "zh-CN"
            source = "ScienceSoftware"
            sourceId = [string]$softwareId
            sourceCategory = [string]$category.sourceName
            retrievedAt = $RetrievedAt
        })
        $includedCount++
    }

    $reports.Add([pscustomobject]@{
        Category = $category.name
        Available = $sourceItems.Count
        Included = $includedCount
        Excluded = $sourceItems.Count - $includedCount
    })
}

$sortedRecords = @($records | Sort-Object @{ Expression = { $_.disciplines[0] } }, name, sourceId)
$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$jsonLines = @($sortedRecords | ForEach-Object { $_ | ConvertTo-Json -Depth 8 -Compress })
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($OutputPath, $jsonLines, $utf8WithoutBom)

$reports | Format-Table -AutoSize
Write-Host "Wrote $($sortedRecords.Count) research-relevant records to $OutputPath"
