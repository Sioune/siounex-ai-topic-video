// Local .NET/System.Speech console program. No PowerShell script, provider,
// cloned voice, policy change or network request. --check never creates speech.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Speech.AudioFormat;
using System.Speech.Synthesis;
using System.Text;

internal sealed class SpeechEventRecord {
    internal int Position;
    internal int Count;
    internal double Milliseconds;
    internal string Text;
}

internal static class PrivateReviewSpeechConsole {
    private static string JsonString(string value) {
        var output = new StringBuilder("\"");
        foreach (char item in value ?? "") {
            if (item == '"') output.Append("\\\"");
            else if (item == '\\') output.Append("\\\\");
            else if (item == '\n') output.Append("\\n");
            else if (item == '\r') output.Append("\\r");
            else if (item == '\t') output.Append("\\t");
            else if (item < 32) output.Append("\\u" + ((int)item).ToString("x4", CultureInfo.InvariantCulture));
            else output.Append(item);
        }
        return output.Append('"').ToString();
    }

    private static int Main(string[] args) {
        try {
            if (args.Length == 1 && args[0] == "--check") {
                using (var speaker = new SpeechSynthesizer()) {
                    var names = new List<string>();
                    bool huihui = false;
                    foreach (var installed in speaker.GetInstalledVoices()) {
                        if (!installed.Enabled) continue;
                        names.Add(JsonString(installed.VoiceInfo.Name));
                        if (installed.VoiceInfo.Name.Contains("Huihui")) huihui = true;
                    }
                    Console.WriteLine("{\"schema\":\"local-dotnet-speech-capability-v1\",\"speech_generated\":false,\"huihui_available\":" + (huihui ? "true" : "false") + ",\"voices\":[" + String.Join(",", names.ToArray()) + "]}");
                    return huihui ? 0 : 2;
                }
            }
            if (args.Length != 3) throw new ArgumentException("Expected exact text-file, output-wave, events-file arguments, or --check.");
            string textFile = Path.GetFullPath(args[0]);
            string outputFile = Path.GetFullPath(args[1]);
            string eventsFile = Path.GetFullPath(args[2]);
            if (File.Exists(outputFile) || File.Exists(eventsFile)) throw new IOException("Existing speech outputs require reconciliation; no overwrite.");
            string text = File.ReadAllText(textFile, Encoding.UTF8);
            if (String.IsNullOrWhiteSpace(text) || text.Length > 65536) throw new ArgumentException("Nonempty bounded approved text required.");
            var events = new List<SpeechEventRecord>();
            string selected = null;
            using (var speaker = new SpeechSynthesizer()) {
                foreach (var installed in speaker.GetInstalledVoices()) {
                    if (installed.Enabled && installed.VoiceInfo.Name.Contains("Huihui")) {
                        selected = installed.VoiceInfo.Name;
                        break;
                    }
                }
                if (selected == null) throw new InvalidOperationException("Installed ordinary Chinese Huihui voice unavailable.");
                speaker.SelectVoice(selected);
                speaker.Rate = 0;
                speaker.Volume = 100;
                speaker.SpeakProgress += delegate(object sender, SpeakProgressEventArgs item) {
                    lock (events) {
                        events.Add(new SpeechEventRecord { Position = item.CharacterPosition, Count = item.CharacterCount, Milliseconds = item.AudioPosition.TotalMilliseconds, Text = item.Text });
                    }
                };
                speaker.SetOutputToWaveFile(outputFile, new SpeechAudioFormatInfo(24000, AudioBitsPerSample.Sixteen, AudioChannel.Mono));
                speaker.Speak(text);
                speaker.SetOutputToNull();
            }
            var json = new StringBuilder("{\"schema\":\"actual-windows-ordinary-speech-events-v1\",\"voice\":");
            json.Append(JsonString(selected)).Append(",\"implementation\":\"local-dotnet-console-v1\",\"rate\":0,\"owner_clone_used\":false,\"cost\":0,\"events\":[");
            for (int i = 0; i < events.Count; i++) {
                if (i > 0) json.Append(',');
                var item = events[i];
                json.Append("{\"Position\":").Append(item.Position.ToString(CultureInfo.InvariantCulture))
                    .Append(",\"Count\":").Append(item.Count.ToString(CultureInfo.InvariantCulture))
                    .Append(",\"Milliseconds\":").Append(item.Milliseconds.ToString("R", CultureInfo.InvariantCulture))
                    .Append(",\"Text\":").Append(JsonString(item.Text)).Append('}');
            }
            json.Append("]}");
            using (var stream = new FileStream(eventsFile, FileMode.CreateNew, FileAccess.Write))
            using (var writer = new StreamWriter(stream, new UTF8Encoding(false))) writer.Write(json.ToString());
            Console.WriteLine("{\"status\":\"speech-files-created\",\"events\":" + events.Count.ToString(CultureInfo.InvariantCulture) + ",\"owner_clone_used\":false,\"cost\":0}");
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error.GetType().Name + ": " + error.Message);
            return 1;
        }
    }
}
