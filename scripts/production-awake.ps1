param([Parameter(Mandatory=$true)][int]$OwnerProcessId)
$ErrorActionPreference='Stop'
$ownerProcess=[System.Diagnostics.Process]::GetProcessById($OwnerProcessId)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SiounexProductionPower {
 [StructLayout(LayoutKind.Sequential)] public struct Context { public UInt32 Version; public UInt32 Flags; public IntPtr Reason; }
 [DllImport("kernel32.dll",SetLastError=true)] public static extern IntPtr PowerCreateRequest(ref Context context);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool PowerSetRequest(IntPtr handle,int kind);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool PowerClearRequest(IntPtr handle,int kind);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
}
'@
$reasonPointer=[Runtime.InteropServices.Marshal]::StringToHGlobalUni('Siounex authorized production is active')
$handle=[IntPtr]::Zero
$held=$false
try {
 $context=New-Object SiounexProductionPower+Context
 $context.Version=0; $context.Flags=1; $context.Reason=$reasonPointer
 $handle=[SiounexProductionPower]::PowerCreateRequest([ref]$context)
 if($handle -eq [IntPtr]::Zero -or $handle -eq [IntPtr]::new(-1)){throw 'POWER_CREATE_REQUEST_FAILED'}
 $held=[SiounexProductionPower]::PowerSetRequest($handle,1)
 if(-not $held){throw 'POWER_SET_REQUEST_FAILED'}
 [Console]::Out.WriteLine('{"status":"held","system_required":true,"display_required":false,"global_settings_changed":false}')
 [Console]::Out.Flush()
 $inputClosed=[Console]::In.ReadLineAsync()
 while(-not $ownerProcess.HasExited -and -not $inputClosed.IsCompleted){[Threading.Thread]::Sleep(1000)}
} finally {
 $cleared=$false; $handleClosed=$false
 if($held){$cleared=[SiounexProductionPower]::PowerClearRequest($handle,1)}
 if($handle -ne [IntPtr]::Zero -and $handle -ne [IntPtr]::new(-1)){$handleClosed=[SiounexProductionPower]::CloseHandle($handle)}
 [Runtime.InteropServices.Marshal]::FreeHGlobal($reasonPointer)
 [Console]::Out.WriteLine((@{status='released';system_request_cleared=$cleared;handle_closed=$handleClosed;global_settings_changed=$false}|ConvertTo-Json -Compress))
}
