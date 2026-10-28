param([Parameter(Mandatory=$true)][string]$TextFile,[Parameter(Mandatory=$true)][string]$OutputFile,[Parameter(Mandatory=$true)][string]$EventsFile)
$ErrorActionPreference='Stop'
if((Test-Path -LiteralPath $OutputFile) -or (Test-Path -LiteralPath $EventsFile)){throw 'Existing speech output must be reconciled; refusing overwrite'}
Add-Type -AssemblyName System.Speech
$speechAssembly=[System.Speech.Synthesis.SpeechSynthesizer].Assembly.Location
Add-Type -ReferencedAssemblies $speechAssembly -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Speech.Synthesis;
using System.Speech.AudioFormat;
public class PrivateReviewSpeechEvent { public int Position; public int Count; public double Milliseconds; public string Text; }
public static class PrivateReviewSpeech {
 public static List<PrivateReviewSpeechEvent> Events=new List<PrivateReviewSpeechEvent>();
 public static string Voice;
 public static void Create(string text,string output) {
  using(var speaker=new SpeechSynthesizer()) {
   string selected=null;foreach(var installed in speaker.GetInstalledVoices())if(installed.Enabled&&installed.VoiceInfo.Name.Contains("Huihui")){selected=installed.VoiceInfo.Name;break;}
   if(selected==null)throw new Exception("Installed Chinese Huihui ordinary voice unavailable");
   speaker.SelectVoice(selected);Voice=selected;speaker.Rate=0;speaker.Volume=100;
   speaker.SpeakProgress+=(sender,e)=>{ lock(Events){Events.Add(new PrivateReviewSpeechEvent{Position=e.CharacterPosition,Count=e.CharacterCount,Milliseconds=e.AudioPosition.TotalMilliseconds,Text=e.Text});}};
   speaker.SetOutputToWaveFile(output,new SpeechAudioFormatInfo(24000,AudioBitsPerSample.Sixteen,AudioChannel.Mono));
   speaker.Speak(text);speaker.SetOutputToNull();
  }
 }
}
'@
$taskText=Get-Content -LiteralPath $TextFile -Raw -Encoding utf8
[PrivateReviewSpeech]::Create($taskText,$OutputFile)
$taskReceipt=@{schema='actual-windows-ordinary-speech-events-v1';voice=[PrivateReviewSpeech]::Voice;rate=0;owner_clone_used=$false;cost=0;events=@([PrivateReviewSpeech]::Events.ToArray())}
$taskReceipt|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $EventsFile -Encoding utf8 -NoNewline
