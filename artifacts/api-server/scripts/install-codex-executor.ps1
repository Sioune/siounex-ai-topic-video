param(
  [Parameter(Mandatory = $true)]
  [string]$Origin
)

$ErrorActionPreference = "Stop"
$TaskName = "ReplitCodexExecutor"
$AgentPath = Join-Path $PSScriptRoot "codex-executor-agent.mjs"
$RunScript = Join-Path $PSScriptRoot "run-codex-executor.ps1"
$CredentialPath = Join-Path $env:LOCALAPPDATA "ReplitCodexExecutor\device-credential.dpapi"
$Node = (Get-Command node.exe -ErrorAction Stop).Source
$NodeVersion = & $Node -p "process.versions.node"
if ([version]$NodeVersion -lt [version]"22.15.0") {
  throw "需要 Node.js 22.15 或更高版本；检测到 $NodeVersion。"
}

if (-not (Test-Path $CredentialPath)) {
  Write-Host "请粘贴制作台显示的一次性配对码。输入时不会显示字符。" -ForegroundColor Cyan
  $SecureCode = Read-Host -AsSecureString
  $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureCode)
  try {
    $PairingCode = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
    $env:REPLIT_CODEX_PAIRING_CODE = $PairingCode
    $env:REPLIT_CODEX_BRIDGE_ORIGIN = $Origin
    & $Node $AgentPath --pair
    if ($LASTEXITCODE -ne 0) { throw "设备配对失败。请从制作台重新生成配对码后重试。" }
  }
  finally {
    Remove-Item Env:\REPLIT_CODEX_PAIRING_CODE -ErrorAction SilentlyContinue
    Remove-Item Env:\REPLIT_CODEX_BRIDGE_ORIGIN -ErrorAction SilentlyContinue
    $PairingCode = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)
  }
}

$PowerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$User = "$env:USERDOMAIN\$env:USERNAME"
$Action = New-ScheduledTaskAction `
  -Execute $PowerShell `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RunScript`"" `
  -WorkingDirectory (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $User
$Principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger `
  -Principal $Principal -Settings $Settings -Description "Runs the owner-approved Replit Codex executor for this Windows account." -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "安装完成。执行器会在此 Windows 账号登录后启动；只有制作台逐条批准的任务会被领取。" -ForegroundColor Green
Write-Host "撤销设备授权后，执行器将停止领取任务。卸载本机启动项可运行 uninstall-codex-executor.ps1。"
