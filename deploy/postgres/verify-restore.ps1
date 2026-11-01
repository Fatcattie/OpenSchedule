[CmdletBinding()]
param([string]$DatabaseUrl = $env:DATABASE_URL)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw 'DATABASE_URL must be set'
}

$tables = @('tenants', 'tasks', 'ai_proposal_tasks', 'audit_logs')
foreach ($table in $tables) {
  $sql = "SELECT count(*) FROM public.`"$table`";"
  $count = (& psql $DatabaseUrl -At -v ON_ERROR_STOP=1 -c $sql | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "psql verification failed for $table" }
  Write-Output "$table rows=$count"
}
