[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ExpectedProjectId,[Parameter(Mandatory=$true)][string]$RuntimeRoot,[switch]$Resume)
$ErrorActionPreference='Stop'
if ($ExpectedProjectId -notmatch '^appgprj_[0-9a-f]{32}$') { throw 'ExpectedProjectId must be an explicit valid project ID' }
$root=(Resolve-Path -LiteralPath $RuntimeRoot).Path
$config=Join-Path $root '.openai\hosting.json'
if((Get-Content -LiteralPath $config -Raw | ConvertFrom-Json).project_id -ne $ExpectedProjectId){throw 'Runtime binding mismatch'}
$stateDir=Join-Path $root '.sites-runtime\cover-thumbnail-worker'
if(!(Test-Path -LiteralPath $stateDir -PathType Container)){throw 'Worker state unavailable'}
$name='SiounexTopicCoverThumbnail-Task4';$taskPath='\'
$lock=[IO.File]::Open((Join-Path $stateDir 'worker.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try {
 $task=Get-ScheduledTask -TaskName $name -TaskPath $taskPath -ErrorAction Stop
 if($task.Settings.Enabled){throw 'Worker plan is already enabled'}
 if(!$Resume){[pscustomobject]@{task=$name;enabled=$false;would_resume=$true};return}
 $tmp=Join-Path $stateDir ('streak-'+[guid]::NewGuid().ToString('N')+'.tmp')
 [IO.File]::WriteAllText($tmp,'{"schema":"cover-thumbnail-failure-streak-v1","count":0}',[Text.UTF8Encoding]::new($false))
 Move-Item -LiteralPath $tmp -Destination (Join-Path $stateDir 'failure-streak.json') -Force
 Enable-ScheduledTask -TaskName $name -TaskPath $taskPath -ErrorAction Stop | Out-Null
 $task=Get-ScheduledTask -TaskName $name -TaskPath $taskPath -ErrorAction Stop
 if(!$task.Settings.Enabled){throw 'Worker resume unconfirmed'}
 [pscustomobject]@{task=$name;enabled=$true}
} finally { $lock.Dispose() }
