$ErrorActionPreference = "Stop"
$TaskName = "ReplitCodexExecutor"
$CredentialPath = Join-Path $env:LOCALAPPDATA "ReplitCodexExecutor\device-credential.dpapi"
Write-Host "这会停止 Windows 登录启动项并删除本机加密的设备凭据。" -ForegroundColor Yellow
Write-Host "不会删除执行记录、任务草稿或运行日志。"
$Confirm = Read-Host "输入 REMOVE 继续"
if ($Confirm -cne "REMOVE") {
  Write-Host "已取消。"
  exit 0
}
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
if (Test-Path $CredentialPath) { Remove-Item $CredentialPath -Force }
Write-Host "本机启动项和凭据已移除。日志与已下载的来源文件仍保留在 %LOCALAPPDATA%\ReplitCodexExecutor。"
Write-Host "若要同时禁用服务端设备，请在制作台点击“撤销本机执行器”。"
