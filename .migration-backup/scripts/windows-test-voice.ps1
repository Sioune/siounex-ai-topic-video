param([Parameter(Mandatory=$true)][string]$TextFile,[Parameter(Mandatory=$true)][string]$OutputFile)
$ErrorActionPreference = 'Stop'
$speaker = New-Object -ComObject SAPI.SpVoice
$voice = @($speaker.GetVoices() | Where-Object { $_.GetDescription() -like '*Huihui*' })[0]
if ($null -eq $voice) { $voice = @($speaker.GetVoices())[0] }
if ($null -eq $voice) { throw 'Existing ordinary Windows test voice unavailable' }
$speaker.Voice = $voice
$stream = New-Object -ComObject SAPI.SpFileStream
$stream.Format.Type = 22
$stream.Open($OutputFile, 3, $false)
try { $speaker.AudioOutputStream = $stream; $speaker.Rate = 0; $speaker.Volume = 80; [void]$speaker.Speak((Get-Content -LiteralPath $TextFile -Raw -Encoding utf8)) }
finally { $stream.Close() }
