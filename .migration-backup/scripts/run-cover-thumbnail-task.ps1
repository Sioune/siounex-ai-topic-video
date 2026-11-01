[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ExpectedProjectId,
  [Parameter(Mandatory=$true)][string]$SourceRoot,
  [Parameter(Mandatory=$true)][string]$RuntimeRoot,
  [Parameter(Mandatory=$true)][string]$NodePath,
  [Parameter(Mandatory=$true)][string]$FfmpegPath,
  [switch]$Scheduled
)
$ErrorActionPreference = 'Stop'
if ($ExpectedProjectId -notmatch '^appgprj_[0-9a-f]{32}$') { throw 'ExpectedProjectId must be an explicit valid project ID' }
$source = (Resolve-Path -LiteralPath $SourceRoot).Path
$runtime = (Resolve-Path -LiteralPath $RuntimeRoot).Path
$node = (Resolve-Path -LiteralPath $NodePath).Path
$ffmpeg = (Resolve-Path -LiteralPath $FfmpegPath).Path
$entry = Join-Path $source 'scripts\cover-thumbnail-worker.mjs'
$stateDir = Join-Path $runtime '.sites-runtime\cover-thumbnail-worker'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$receiptPath = Join-Path $stateDir 'last-run.json'
$streakPath = Join-Path $stateDir 'failure-streak.json'
$lockPath = Join-Path $stateDir 'worker.lock'
$taskName = 'SiounexTopicCoverThumbnail-Task4'
$taskPath = '\'
# The OS releases this exclusive lock on exit, including forced termination.
# IgnoreNew protects the registered schedule; this also covers manual overlap.
try { $lock = [IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) } catch [IO.IOException] { if(($_.Exception.HResult -band 65535) -in @(32,33)){exit 0}; exit 1 } catch { exit 1 }
function Save-Streak([int]$count) {
  $value = @{schema='cover-thumbnail-failure-streak-v1'; count=$count} | ConvertTo-Json -Compress
  $tmp = Join-Path $stateDir ('streak-' + [guid]::NewGuid().ToString('N') + '.tmp')
  [IO.File]::WriteAllText($tmp,$value,[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $tmp -Destination $streakPath -Force
}
$streak = 0; $pauseResult = 'not_requested'; $stateValid = $true
if ($Scheduled -and (Test-Path -LiteralPath $streakPath)) {
  try { $state=Get-Content -LiteralPath $streakPath -Raw | ConvertFrom-Json; if($state.schema -ne 'cover-thumbnail-failure-streak-v1' -or $state.count -notin @(0,1,2)){throw 'invalid state'}; $streak=[int]$state.count } catch { $stateValid=$false }
}
$status = 'failed'; $exitCode = 1; $errorClass = 'runtime_unavailable'
try {
  if (!$stateValid) { $errorClass='state_invalid'; throw 'Worker state is unavailable' }
  if ($Scheduled -and $streak -ge 2) { $errorClass='paused_after_failures'; throw 'Worker requires manual recovery' }
  $sourceConfig = Join-Path $source '.openai\hosting.json'
  $runtimeConfig = Join-Path $runtime '.openai\hosting.json'
  $descriptor = Join-Path $runtime '.sites-runtime\runtime-descriptors\production-cli.json'
  foreach ($file in @($entry,$sourceConfig,$runtimeConfig,$descriptor)) { if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Thumbnail runtime is unavailable' } }
  foreach ($config in @($sourceConfig,$runtimeConfig)) { if ((Get-Content -Raw -LiteralPath $config | ConvertFrom-Json).project_id -ne $ExpectedProjectId) { throw 'Thumbnail project binding changed' } }
  (Get-Process -Id $PID).PriorityClass = 'Idle'
  $env:PATH = (Split-Path -Parent $ffmpeg) + [IO.Path]::PathSeparator + $env:PATH
  Push-Location -LiteralPath $runtime
  try { $output = @(& $node $entry 2>$null); $nativeExit = $LASTEXITCODE } finally { Pop-Location }
  $errorClass = 'unknown'
  $result = ($output -join "`n") | ConvertFrom-Json
  $allowed = @('result_unknown','transport_failed','tool_rejected','runtime_unavailable','interaction_required','claim_failed','scan_failed','finish_failed','deadline','source_read_failed','source_changed','generation_failed','save_unconfirmed','unknown')
  if ($nativeExit -ne 0) { $errorClass = if ($result.status -eq 'failed' -and $result.error_class -in $allowed) { $result.error_class } else { 'unknown' }; throw 'Thumbnail worker failed' }
  if ($result.status -notin @('waiting','scan-complete','skipped','already-present','created')) { throw 'Unexpected worker result' }
  $status = $result.status; $exitCode = 0
} catch { $status = 'failed'; $exitCode = 1 }
if ($Scheduled -and $stateValid) {
  # Lease/cooldown waiting performs no work, so it cannot clear a failure.
  if ($exitCode -eq 0 -and $status -ne 'waiting') { $streak=0 } elseif ($exitCode -ne 0 -and $streak -lt 2) { $streak++ }
  try { Save-Streak $streak } catch { $errorClass='state_write_failed'; $exitCode=1; $status='failed'; $stateValid=$false }
  if ($stateValid -and $streak -ge 2) {
    try { Disable-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction Stop | Out-Null; $task=Get-ScheduledTask -TaskName $taskName -TaskPath $taskPath -ErrorAction Stop; if($task.Settings.Enabled){throw 'Pause unconfirmed'}; $pauseResult='confirmed' } catch { $pauseResult='unconfirmed' }
  }
}
$receipt = @{schema='cover-thumbnail-local-run-v1'; status=$status; finished_at=[DateTime]::UtcNow.ToString('o'); exit_code=$exitCode} | ConvertTo-Json -Compress
if ($exitCode -ne 0) { $record=@{schema='cover-thumbnail-local-run-v1'; status=$status; finished_at=[DateTime]::UtcNow.ToString('o'); exit_code=$exitCode; error_class=$errorClass}; if($Scheduled){$record.failure_streak=$streak;$record.pause_result=$pauseResult}; $receipt=$record | ConvertTo-Json -Compress }
$tempPath = Join-Path $stateDir ('receipt-' + [guid]::NewGuid().ToString('N') + '.tmp')
[IO.File]::WriteAllText($tempPath,$receipt,[Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $tempPath -Destination $receiptPath -Force
$lock.Dispose()
exit $exitCode
