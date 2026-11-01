[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ExpectedProjectId,
  [Parameter(Mandatory=$true)][string]$SourceRoot,
  [Parameter(Mandatory=$true)][string]$RuntimeRoot,
  [Parameter(Mandatory=$true)][string]$NodePath,
  [Parameter(Mandatory=$true)][string]$FfmpegPath,
  [switch]$Register
)
$ErrorActionPreference = 'Stop'
if ($ExpectedProjectId -notmatch '^appgprj_[0-9a-f]{32}$') { throw 'ExpectedProjectId must be an explicit valid project ID' }
$source = (Resolve-Path -LiteralPath $SourceRoot).Path
$runtime = (Resolve-Path -LiteralPath $RuntimeRoot).Path
$node = (Resolve-Path -LiteralPath $NodePath).Path
$ffmpeg = (Resolve-Path -LiteralPath $FfmpegPath).Path
$worker = Join-Path $source 'scripts\cover-thumbnail-worker.mjs'
$runner = Join-Path $source 'scripts\run-cover-thumbnail-task.ps1'
$sourceConfig = Join-Path $source '.openai\hosting.json'
$runtimeConfig = Join-Path $runtime '.openai\hosting.json'
$descriptor = Join-Path $runtime '.sites-runtime\runtime-descriptors\production-cli.json'
$resolver = Join-Path $source 'scripts\resolve-native-production-cli.mjs'
$validator = Join-Path $source 'scripts\validate-cover-thumbnail-runtime.mjs'
foreach ($file in @($node,$ffmpeg,$worker,$runner,$sourceConfig,$runtimeConfig,$descriptor,$resolver,$validator)) { if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Required file missing: $file" } }
foreach ($config in @($sourceConfig,$runtimeConfig)) { if ((Get-Content -Raw -LiteralPath $config | ConvertFrom-Json).project_id -ne $ExpectedProjectId) { throw 'Source or runtime project does not match the authorized production gateway' } }
& $node $validator $runtime 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Runtime native CLI descriptor validation failed' }
$name = 'SiounexTopicCoverThumbnail-Task4'
$existing = Get-ScheduledTask -TaskName $name -TaskPath '\' -ErrorAction SilentlyContinue
if ($existing) { throw "Task already exists; refusing to overwrite: $name" }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$psExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -SourceRoot "{1}" -RuntimeRoot "{2}" -NodePath "{3}" -FfmpegPath "{4}" -ExpectedProjectId "{5}" -Scheduled' -f $runner,$source,$runtime,$node,$ffmpeg,$ExpectedProjectId
$action = New-ScheduledTaskAction -Execute $psExe -Argument $arguments -WorkingDirectory $runtime
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(2)) -RepetitionInterval (New-TimeSpan -Minutes 3) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$settings.Priority = 10
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Independent low-priority private cover thumbnail sweep; one item per invocation.'
if ($Register) {
  Register-ScheduledTask -TaskName $name -TaskPath '\' -InputObject $task | Out-Null
  Get-ScheduledTask -TaskName $name -TaskPath '\' | Select-Object TaskName,TaskPath,State
} else {
  [pscustomobject]@{Mode='Preview only';TaskName=$name;TaskPath='\';User=$identity;LogonType='Interactive';Priority=10;IntervalMinutes=3;MaxRunMinutes=4;MultipleInstances='IgnoreNew';SourceRoot=$source;RuntimeRoot=$runtime;Runner=$runner;Node=$node;Ffmpeg=$ffmpeg;WouldRegister=$false}
}

