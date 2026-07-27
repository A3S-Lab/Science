[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 4173,
    [string]$RootPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RootPath)) {
    $RootPath = Join-Path $PSScriptRoot "..\site"
}

$resolvedRoot = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RootPath).Path)
$rootPrefix = $resolvedRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$mimeTypes = @{
    ".css" = "text/css; charset=utf-8"
    ".html" = "text/html; charset=utf-8"
    ".js" = "text/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".jsonl" = "application/x-ndjson; charset=utf-8"
    ".md" = "text/markdown; charset=utf-8"
    ".svg" = "image/svg+xml"
    ".txt" = "text/plain; charset=utf-8"
    ".webmanifest" = "application/manifest+json; charset=utf-8"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "Serving $resolvedRoot at http://127.0.0.1:$Port/"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            $relativePath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart("/")
            if ([string]::IsNullOrWhiteSpace($relativePath)) {
                $relativePath = "index.html"
            }

            $relativePath = $relativePath.Replace("/", [System.IO.Path]::DirectorySeparatorChar)
            $targetPath = [System.IO.Path]::GetFullPath((Join-Path $resolvedRoot $relativePath))
            if (-not $targetPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                $context.Response.StatusCode = 403
                $context.Response.Close()
                continue
            }

            if (Test-Path -LiteralPath $targetPath -PathType Container) {
                $targetPath = Join-Path $targetPath "index.html"
            }
            if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
                $context.Response.StatusCode = 404
                $context.Response.Close()
                continue
            }

            $extension = [System.IO.Path]::GetExtension($targetPath).ToLowerInvariant()
            $contentType = if ($mimeTypes.ContainsKey($extension)) {
                $mimeTypes[$extension]
            } else {
                "application/octet-stream"
            }
            $bytes = [System.IO.File]::ReadAllBytes($targetPath)
            $context.Response.StatusCode = 200
            $context.Response.ContentType = $contentType
            $context.Response.ContentLength64 = $bytes.Length
            $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            $context.Response.OutputStream.Close()
        } catch {
            $context.Response.StatusCode = 500
            $context.Response.Close()
            Write-Warning $_
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
