// Shared owner-approved body pace. The frozen ending is never retimed.
import {releaseTextSha256} from './release-package-sha256.mts';

export const OWNER_BODY_PACE_TEMPO=1.15;
export const OWNER_BODY_PACE_POLICY=Object.freeze({
 schema:'owner-body-pace-policy-v1',
 policy:'owner-body-fixed-1.15-preserve-pitch-v1',
 body_tempo:OWNER_BODY_PACE_TEMPO,
 preserve_pitch:true,
 body_audio_complete:true,
 timeline_clock:'same-body-tempo',
 material_source_speed:1,
 reference_outro_policy:'outro-v5-20261021',
 outro_playback_rate:1,
 outro_original_frames_audio:true,
 duration_control:'script-length-at-fixed-pace',
 target_total_frames:1800,
 fps:30,
} as const);
export const OWNER_BODY_PACE_POLICY_JSON=JSON.stringify(Object.fromEntries(Object.entries(OWNER_BODY_PACE_POLICY).sort(([a],[b])=>a.localeCompare(b))));
export const OWNER_BODY_PACE_POLICY_SHA256=releaseTextSha256(OWNER_BODY_PACE_POLICY_JSON);
