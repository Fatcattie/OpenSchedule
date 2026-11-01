[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$DumpPath,
  [string]$TargetDatabaseUrl = $env:DATABASE_URL
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($TargetDatabaseUrl)) {
  throw 'DATABASE_URL or TargetDatabaseUrl must be set'
}
if (-not (Test-Path -LiteralPath $DumpPath -PathType Leaf)) {
  throw "Backup file is not readable: $DumpPath"
}

& pg_restore --exit-on-error --no-owner --clean --if-exists --dbname=$TargetDatabaseUrl $DumpPath
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE" }
Write-Output 'PostgreSQL backup restored to the target database.'
