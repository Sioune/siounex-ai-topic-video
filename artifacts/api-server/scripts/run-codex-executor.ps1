$ErrorActionPreference = "Continue"
$AgentPath = Join-Path $PSScriptRoot "codex-executor-agent.mjs"
$Node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
$LogDirectory = Join-Path $env:LOCALAPPDATA "ReplitCodexExecutor"
$LogPath = Join-Path $LogDirectory "executor.log"
New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
if ((Test-Path $LogPath) -and (Get-Item $LogPath).Length -gt 3MB) {
  Move-Item $LogPath "$LogPath.previous" -Force
}
"[$(Get-Date -Format o)] Executor starting." | Add-Content -Path $LogPath
if (-not $Node) {
  "[$(Get-Date -Format o)] Node.js was not found in this user's PATH." | Add-Content -Path $LogPath
  exit 1
}
try {
  & $Node $AgentPath --run *>> $LogPath
  $ExitCode = $LASTEXITCODE
}
catch {
  "[$(Get-Date -Format o)] $($_.Exception.Message)" | Add-Content -Path $LogPath
  $ExitCode = 1
}
"[$(Get-Date -Format o)] Executor exited with code $ExitCode." | Add-Content -Path $LogPath
exit $ExitCode
