[CmdletBinding()]
param(
  [string]$OutputPath = "backups/openschedule-$((Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')).dump"
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
  throw 'DATABASE_URL must be set'
}

$parent = Split-Path -Parent $OutputPath
if ($parent -and -not (Test-Path -LiteralPath $parent)) {
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

& pg_dump --format=custom --no-owner --file=$OutputPath $env:DATABASE_URL
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }
Write-Output "PostgreSQL backup written to $OutputPath"
