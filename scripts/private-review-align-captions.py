"""Offline ASR timing candidates for unchanged approved text. No network or TTS."""
import argparse
import difflib
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import subprocess
import unicodedata
import wave

SCHEMA = "private-review-caption-alignment-v1"


def sha_bytes(value):
    return hashlib.sha256(value).hexdigest()


def lexical(text):
    chars, raw = [], []
    for index, ch in enumerate(text):
        for normalized in unicodedata.normalize("NFKC", ch).casefold():
            if unicodedata.category(normalized)[0] not in "PZS" and not normalized.isspace():
                chars.append(normalized)
                raw.append(index)
    return "".join(chars), raw


def compact(text):
    return "".join(text.split())


def plan_pages(text, words, duration, offset=0.0, segment_index=0):
    """Use matched ASR word ends as page boundaries, never interpolated word times."""
    if not text or not math.isfinite(duration) or duration <= 0:
        raise ValueError("Exact nonempty segment and measured duration required")
    approved, raw_positions = lexical(text)
    recognized, word_indices = [], []
    valid_words, uncertainties = [], []
    for i, word in enumerate(words):
        start, end = float(word["start"]), float(word["end"])
        if not (math.isfinite(start) and math.isfinite(end) and 0 <= start <= end <= duration + .08):
            raise ValueError("ASR estimate outside measured segment")
        if i and start < float(words[i - 1]["start"]):
            raise ValueError("ASR word clock is not monotonic")
        valid_words.append({**word, "start": min(start, duration), "end": min(end, duration)})
        value, _ = lexical(word["word"])
        recognized.extend(value)
        word_indices.extend([i] * len(value))
    recognized = "".join(recognized)
    matches = {}
    for block in difflib.SequenceMatcher(None, approved, recognized, autojunk=False).get_matching_blocks():
        for k in range(block.size):
            matches[block.a + k] = block.b + k
    coverage = len(matches) / max(1, len(approved))
    missing_runs, run = [], 0
    for i in range(len(approved)):
        if i not in matches:
            run += 1
        elif run:
            missing_runs.append(run)
            run = 0
    if run:
        missing_runs.append(run)
    if coverage < .92 or max(missing_runs, default=0) > 3:
        return [], coverage, [{"code": "asr-lexical-alignment-uncertain", "detail": "Insufficient exact lexical matches; no invented page timing", "matched_ratio": coverage, "largest_unmatched_run": max(missing_runs, default=0)}]
    if coverage < 1:
        uncertainties.append({"code": "asr-lexical-differences", "detail": "Approved text preserved; short recognition differences lie inside observed page boundaries", "matched_ratio": coverage})
    anchors = {}
    for approved_index, recognized_index in matches.items():
        wi = word_indices[recognized_index]
        # A genuine ASR word end must match the corresponding approved character.
        if recognized_index + 1 < len(word_indices) and word_indices[recognized_index + 1] == wi:
            continue
        end_raw = raw_positions[approved_index] + 1
        while end_raw < len(text) and unicodedata.category(text[end_raw])[0] in "PZ":
            end_raw += 1
        anchors[end_raw] = {"word_index": wi, "end": valid_words[wi]["end"]}
    cues, first, prior_time = [], 0, 0.0
    while first < len(text):
        if len(text) - first <= 24:
            stop, end, end_kind = len(text), duration, "measured-segment-end"
        else:
            choices = [(p, a) for p, a in anchors.items() if first < p <= first + 24 and a["end"] > prior_time]
            if not choices:
                return [], coverage, uncertainties + [{"code": "asr-page-boundary-unavailable", "detail": "No observed word boundary within 24 approved characters"}]
            punctuation = [(p, a) for p, a in choices if p - first >= 10 and text[p - 1] in "，。！？；：,.!?;:"]
            stop, anchor = max(punctuation or choices, key=lambda x: x[0])
            end, end_kind = anchor["end"], "observed-asr-word-end"
        selected = text[first:stop]
        selected_lex = [i for i, raw in enumerate(raw_positions) if first <= raw < stop]
        wi = sorted({word_indices[matches[i]] for i in selected_lex if i in matches})
        if end <= prior_time or not wi:
            return [], coverage, uncertainties + [{"code": "asr-page-clock-uncertain", "detail": "Page lacks a positive observed interval"}]
        pages_ratio = sum(i in matches for i in selected_lex) / max(1, len(selected_lex))
        cues.append({"start_seconds": offset + prior_time, "end_seconds": offset + end, "text": selected,
                     "display_lines": [selected[i:i + 12] for i in range(0, len(selected), 12)],
                     "alignment": "offline-asr-estimated-word-boundaries", "word_alignment_verified": False,
                     "alignment_confidence": {"lexical_match_ratio": pages_ratio, "mean_word_probability": sum(float(valid_words[i].get("probability", 0)) for i in wi) / len(wi)},
                     "evidence": {"segment_index": segment_index, "asr_word_indices": wi, "start_boundary": "measured-segment-start" if first == 0 else "prior-observed-asr-word-end", "end_boundary": end_kind}})
        first, prior_time = stop, end
    if "".join(c["text"] for c in cues) != text or any(len(c["text"]) > 24 or len(c["display_lines"]) > 2 for c in cues):
        raise ValueError("Caption pages changed approved text or exceeded readable layout")
    return cues, coverage, uncertainties


def checked(ref, root):
    p = (root / ref["path"]).resolve(strict=True)
    if not p.is_relative_to(root) or not p.is_file() or sha_bytes(p.read_bytes()) != ref["sha256"]:
        raise ValueError("Frozen actual audio changed")
    return p


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    source = Path(args.project).resolve(strict=True)
    root = source.parent
    project_bytes = source.read_bytes()
    project = json.loads(project_bytes)
    if project["schema"] != "editable-local-private-review-v1" or sha_bytes(project["script"].encode()) != project["script_text_sha256"]:
        raise ValueError("Exact approved script project required")
    segments = project["source_to_timeline"]
    if compact("".join(s["text"] for s in segments)) != compact(project["script"]):
        raise ValueError("Approved narration reconstruction differs")
    output = Path(args.output).resolve()
    if output.exists() or output.is_relative_to(root):
        raise ValueError("Write a new audit output outside the pinned producer tree")
    runtime = root
    while runtime.name != "task-4" and runtime.parent != runtime:
        runtime = runtime.parent
    local = runtime / ".sites-runtime/decision-v6-phone"
    packages = local / "asr-packages"
    model_path = local / "asr-models/models--Systran--faster-whisper-base/snapshots/ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66"
    if not (model_path / "model.bin").is_file() or not packages.is_dir():
        raise ValueError("Existing local ASR package/model unavailable; downloads prohibited")
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(packages))
    for key in ["HF_HUB_OFFLINE", "HF_HUB_DISABLE_IMPLICIT_TOKEN", "HF_HUB_DISABLE_TELEMETRY", "TRANSFORMERS_OFFLINE"]:
        os.environ[key] = "1"
    import socket
    def no_network(*_a, **_k):
        raise RuntimeError("Network is forbidden for offline caption alignment")
    socket.create_connection = no_network
    socket.socket.connect = no_network
    from faster_whisper import WhisperModel
    import numpy as np
    model = WhisperModel(str(model_path), device="cpu", compute_type="int8", cpu_threads=2, num_workers=1, local_files_only=True)
    all_cues, reports, all_uncertainties = [], [], []
    for segment in segments:
        if not segment["text"]:
            continue
        audio = checked(segment["audio"], root)
        raw_audio = root / "speech" / ("segment-%02d.wav" % segment["index"])
        if not raw_audio.is_file() or sha_bytes(raw_audio.read_bytes()) != segment["raw_audio_sha256"]:
            raise ValueError("Original ordinary speech bytes changed")
        with wave.open(str(audio), "rb") as wav:
            duration = wav.getnframes() / wav.getframerate()
        if abs(duration - (segment["end_frame"] - segment["start_frame"]) / 30) > .0001:
            raise ValueError("Actual WAV is not the exact processed segment frame interval")
        # The installed av19 removed metadata_errors used by faster_whisper1.2;
        # decode/resample the already verified PCM with existing FFmpeg in RAM.
        decoded = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(audio), "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], check=True, capture_output=True, timeout=30)
        samples = np.frombuffer(decoded.stdout, dtype=np.float32)
        result, _ = model.transcribe(samples, language="zh", beam_size=5, temperature=0, condition_on_previous_text=False,
                                    word_timestamps=True, vad_filter=False, initial_prompt=segment["text"])
        results = list(result)
        if sha_bytes(audio.read_bytes()) != segment["audio"]["sha256"] or sha_bytes(raw_audio.read_bytes()) != segment["raw_audio_sha256"]:
            raise ValueError("Speech inputs changed while measuring ASR estimates")
        words = [{"word": w.word, "start": w.start, "end": w.end, "probability": w.probability} for s in results for w in s.words or []]
        cues, coverage, uncertainty = plan_pages(segment["text"], words, duration, segment["start_frame"] / 30, segment["index"])
        report = {"index": segment["index"], "raw_audio_sha256": segment["raw_audio_sha256"], "processed_audio_sha256": segment["audio"]["sha256"],
                  "audio_duration_seconds": duration, "start_frame": segment["start_frame"], "end_frame": segment["end_frame"],
                  "asr_text": "".join(s.text for s in results), "asr_words": words, "coverage": coverage, "uncertainties": uncertainty, "page_count": len(cues)}
        reports.append(report)
        all_cues.extend(cues)
        all_uncertainties.extend({"segment_index": segment["index"], **u} for u in uncertainty)
        print(json.dumps({"index": segment["index"], "coverage": coverage, "page_count": len(cues), "uncertainties": uncertainty}, ensure_ascii=False), flush=True)
    exact = compact("".join(c["text"] for c in all_cues)) == compact(project["script"])
    narration = checked(project["voice"], root)
    if source.read_bytes() != project_bytes:
        raise ValueError("Approved project changed while measuring ASR estimates")
    report = {"schema": SCHEMA, "job_id": project["job_id"], "binding": project["binding"], "project_sha256": sha_bytes(project_bytes),
              "script_text_sha256": project["script_text_sha256"], "narration_audio_sha256": sha_bytes(narration.read_bytes()),
              "model": {"local_path": str(model_path), "model_sha256": sha_bytes((model_path / "model.bin").read_bytes()), "offline": True, "device": "cpu", "compute_type": "int8"},
              "segments": reports, "cues": all_cues, "exact_approved_text_preserved": exact, "uncertainties": all_uncertainties,
              "status": "aligned-estimates-awaiting-human" if exact else "alignment-needs-review", "word_alignment_verified": False,
              "new_paid_calls": 0, "new_speech_calls": 0, "quality_approved": False, "publication_authorized": False}
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8") as out:
        json.dump(report, out, ensure_ascii=False, indent=2)
    print(json.dumps({"output": str(output), "sha256": sha_bytes(output.read_bytes()), "status": report["status"], "cues": len(all_cues)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
