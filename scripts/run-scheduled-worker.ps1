$ErrorActionPreference='Stop'
$topicWorkerRoot=[System.IO.Directory]::GetParent($PSScriptRoot).FullName
Set-Location -LiteralPath $topicWorkerRoot
$topicWorkerNode=(Get-Command node.exe).Source
& $topicWorkerNode (Join-Path $topicWorkerRoot 'scripts\native-scheduled-worker.mjs')
exit $LASTEXITCODE
