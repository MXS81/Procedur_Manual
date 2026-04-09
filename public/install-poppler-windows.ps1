#Requires -Version 5.1
<#
.SYNOPSIS
  Download latest Poppler (Windows) from GitHub and add Library\bin to current USER Path.
  No admin required. Matches Procedur Manual preload scan: %LOCALAPPDATA%\Programs\Poppler\

.NOTES
  UTF-8. After run: fully quit and reopen uTools, then click Index on PDF manuals.
#>
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo = 'oschwartz10612/poppler-windows'
$installRoot = Join-Path $env:LOCALAPPDATA 'Programs\Poppler'

Write-Host '[Poppler] Querying latest release...'
$headers = @{ 'User-Agent' = 'ProcedurManual-install-poppler/1.0' }
$rel = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers $headers
$asset = $rel.assets | Where-Object { $_.name -match '^Release-.+\.zip$' } | Select-Object -First 1
if (-not $asset) {
  Write-Error 'No Release-*.zip asset found on latest release.'
  exit 1
}

$zip = Join-Path $env:TEMP $asset.name
Write-Host "[Poppler] Downloading $($asset.name) ..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -UseBasicParsing

$extractTmp = Join-Path $env:TEMP ('poppler-extract-' + [Guid]::NewGuid().ToString('n'))
New-Item -ItemType Directory -Path $extractTmp -Force | Out-Null
try {
  Expand-Archive -LiteralPath $zip -DestinationPath $extractTmp -Force
  $inner = Get-ChildItem -LiteralPath $extractTmp -Directory |
    Where-Object { $_.Name -notmatch '^__' -and $_.Name -notmatch '^\.' } |
    Select-Object -First 1
  if (-not $inner) { throw 'No subfolder after unzip' }

  $probe = Get-ChildItem -LiteralPath $inner.FullName -Filter 'pdftotext.exe' -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $probe) { throw 'pdftotext.exe not found inside archive' }

  Write-Host "[Poppler] Installing to: $installRoot"
  $parent = Split-Path -Parent $installRoot
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  if (Test-Path -LiteralPath $installRoot) {
    Remove-Item -LiteralPath $installRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
  Copy-Item -Path (Join-Path $inner.FullName '*') -Destination $installRoot -Recurse -Force

  $binPath = Join-Path $installRoot 'Library\bin'
  $exe = Join-Path $binPath 'pdftotext.exe'
  if (-not (Test-Path -LiteralPath $exe)) {
    throw "Expected $exe missing (check zip layout)"
  }

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $norm = { param($p) ($p -replace '\\$', '').TrimEnd('\') }
  $binNorm = & $norm $binPath
  $parts = @()
  if ($userPath) {
    $parts = $userPath -split ';' | ForEach-Object { (& $norm $_) } | Where-Object { $_ }
  }
  $already = $parts | Where-Object { $_ -ieq $binNorm }
  if ($already) {
    Write-Host '[Poppler] User PATH already contains Library\bin'
  } else {
    $newPath = if ($userPath) { "$userPath;$binPath" } else { $binPath }
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Write-Host "[Poppler] Appended to USER Path: $binPath"
  }

  Write-Host ''
  Write-Host '[Poppler] Done. Fully quit uTools and reopen, then click Index on PDF manuals.'
} finally {
  Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $extractTmp -Recurse -Force -ErrorAction SilentlyContinue
}
