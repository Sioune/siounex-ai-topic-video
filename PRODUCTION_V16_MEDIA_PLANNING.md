# Version-bound clip selection and narration inputs

The production page now saves an independent input plan through authenticated same-origin `/api/media-plan`. Plans and candidate receipts append to the existing `production_reviews`; no new table, migration, historical rewrite, publication or paid generation is involved. Compare-and-swap against the last plan ID makes stale tabs lose safely. An identical request replays the same row. Exact script revision/hash and review-mode epoch invalidate former confirmation. None of these rows approve production milestones.

The operator downloads an analysis request from the real website, materializes the exact existing authorized video, and manually starts:

```
node scripts/analyze-continuous-clips.mjs <analysis-request.json> <existing-video.mp4> <new-output-directory>
```

The finite local analyzer hashes the source, scans actual 30fps frames with FFmpeg brightness-change and scene-cut metadata, rejects windows above the internal-cut threshold, and writes up to three 90-frame/three-second clips and their actual first frames. Candidate start points are at least one second apart; candidates may overlap. The score measures motion, not narrative strength, semantic understanding or audio quality. An optional `analysis_scope: {startFrame, endFrame}` in the downloaded request restricts known genuine gameplay; it never invents frames. Each output directory has a started marker and cannot silently rerun.

Native Library create must succeed for every clip/image and every returned xattr must be applied. `scripts/candidate-library-receipt.mjs` checks exact sizes and hashes against those native receipts. Existing private service action `media_candidates` persists that bound report. Website controls show real previews, fixed receipt versions/hashes, an explicit Library fallback, radio selection and a human reason. Inline Library delivery depends on the browser's authorized Library access; local acceptance serves the exact uploaded bytes, not a claim that cross-origin sign-in was exercised.

The input plan can save incomplete work and explicitly lists missing audio/captions/materials. Confirmation rejects a different script or old audio binding, empty/full-text-mismatched subtitles, overlapping or out-of-range timestamps, gaps/invalid durations in the material timeline, full-plane cropping, or focus segments without an exact quote in the same caption interval. Owner-supplied hearing and post-frontload alignment references are required; the validator does not pretend it listened.

Download the saved confirmed plan and apply it to an independently prepared renderer project:

```
node scripts/apply-media-plan.mjs <website-confirmed-plan.json> <renderer-project.json> <new-project.json>
```

This validates exact actual source/audio/script inputs and the selected highlight's entire frame mapping. A quoted focus interval converts to a bounded normalized ROI. `prepare-unified-project.mjs` applies a 250ms feathered brightness mask outside that ROI while preserving the full global plane, duration and every frame. It introduces no zoom, crop, extra footage, PiP or synthesized audio. A seven-second actual source decode/pixel comparison verifies this mechanism; its test rectangle is a software fixture, not a narration-approved creative result.

No automatic wake-up exists. One manually started, finite executor is the current capability. A native task heartbeat would require a separately approved cadence and task-scoped prompt, an awake signed-in machine, and already available Site/Library execution permissions; no durable key or daemon is needed for that proposal, and no schedule has been created. New matching narration, actual listening and finished creative video remain separate requirements. The protected Claude job remains untouched.
