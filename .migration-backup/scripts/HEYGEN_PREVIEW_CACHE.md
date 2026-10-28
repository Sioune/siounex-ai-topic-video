# HeyGen Studio preview audio acquisition

`heygen-preview-cache.mjs` is the shared file adapter for automatic and node workflows. It does not operate a browser, make a network request, call `create_speech`, render an avatar or export a video. The supported browser bridge performs visible Studio actions and passes only actual observations and downloaded original bytes to this adapter.

This restores the method documented in these existing project receipts:

- `.takeover/two-video-production-20261017/owner-voice-20261018/acquisition.json`: one Audio Preview per exact approved narration; current rendered DOM audio resource saved, no private API replay or export.
- `.takeover/minicpm-resume-20261018/voice/acquisition.json`: current full approved script and website binding hashes stored separately, with original MP3 SHA, full duration and complete decode.
- `.takeover/three-final-delivery-20261019/{glm,deepseek,refund}/final/receipts/owner-voice-acquisition.original.json`: full loaded audio `readyState=4`; historical URLs ending in `.wav` contained MP3 bytes.

These receipts prove the historical method, not current UI availability or a licence/payment entitlement. The browser bridge must honor current tool responses and normal account/voice access. A preview must be a complete audio, not a limited audition reconstructed from fragments.

## API

```js
const cache = createHeygenPreviewCache({root, probe, command, clock});
const input = {job, request, text, draft_id};
```

`job` is the fresh approved website job including its current `drafts`. `request` is the exact clone request including first review, base video/artifact, frozen voice/default engine, revision, mode epoch, contract and invocation. `text` must exactly equal the approved script with only the fixed existing closing-outro line removed. `script_text_sha256` hashes the full approved script; `speech_text_sha256` hashes the spoken body. The adapter preserves punctuation and every other character.

1. `recordPreparedDraft({...input, browser_evidence_sha256})` freezes the visible draft identity. Preparation may precede quote/claim, so engine and invocation may be null here. `getPreparedDraft({job, request, text?})` recovers this exact draft without creating one. Known engine/invocation identities cannot change; null preparation identities can be frozen by the later intent.
2. `createIntent(input)` creates the immutable, fully bound acquisition intent. It never authorizes clicking Play itself. A current non-null saved default engine and invocation are required.
3. `markPlayIntent(input)` durably records the sole allowed Play intent **before** the browser action. Only the first call returns `play_allowed: true`. All later calls return reconciliation only, including a crash before the UI outcome is known. If exact audio is already loaded, record that audio and do not call Play.
4. `recordLoadedAudio({...input, observation})` takes `{draft_id, voice_id, text, ready_state:4, duration_seconds, media_url, observed_at, browser_evidence_sha256, preview_media_id?, play_clicked?}` from the actual current DOM/visible editor. It requires exact draft/voice/body, a complete finite duration, fresh observation time and a normal HTTPS HeyGen resource host. URLs stay in RAM; only their hash is persisted. `play_clicked` is true/false/null evidence, distinct from a saved Play intent. No missing preview/media ID is invented.
5. The browser bridge downloads only that exact observed original media. `acceptAudio({...input, media_url, bytes: Buffer})` checks source identity, 30 MB bound, one audio stream/no video, actual codec, duration versus the DOM, sample rate/channels, and full FFmpeg decode. It preserves original bytes under `automatic-clone/{acl}/provider-audio.{actual codec}` and creates `heygen-studio-preview-trace-v1` and `provider-receipt.json`.
6. `reconcile(input)` returns null for a fresh or incomplete acquisition, or validates and returns the existing exact audio result. It does not regenerate. `readState({job,request,text?})` returns the prepared draft and phase without granting Play. Once an intent has an unknown outcome, the browser may only reopen that same draft and read its existing loaded audio.

If a supported browser action actually clicked Play but its later loaded-audio acknowledgement was lost, the parent observer can persist the early actual UI marker as `studio-play-observed.json`. Read-only recovery supplies `observation.original_play_journal_sha256`; the cache verifies the retained file's exact bytes, strict request/draft/body/voice identity, and click time after the original immutable Play intent. It stores this hash and `original_play_observed:true` while preserving the current read's `actual_play_observed:false` and zero current clicks. Every later readback rechecks that same journal. A Play intent without this actual click journal or a prior valid loaded-audio observation does not establish that template/stale audio belongs to this request.

The result keeps the existing `audio_file`, SHA, byte size, duration, exact text hashes and `audio_manifest_sha256` contract. `acquisition_method` is `heygen_studio_audio_preview`; `provider_request_id` is null; `native_tool_trace.schema` accurately identifies Studio preview rather than a speech API. The trace binds job/revision/epoch/contract/base video/first review, default voice identity, intent, loaded DOM observation, cache metadata and audio bytes. `engine_observed` in metadata remains null: catalog default identity does not claim an engine was separately displayed by the browser.

Successful acquisition is not audio quality approval, second video approval, warehouse entry or publication. Existing first approval remains; downstream render must synchronize the new body narration and captions while preserving the original v5 outro sound and frames. The new video still requires the owner's second approval.

## Verification

`node --test tests/heygen-preview-cache.test.mjs` covers auto/node acquisition, exact current binding, separate script/body hashes, no second Play after unknown outcome, prepared-draft recovery, incomplete/wrong DOM media, tampered bytes/receipts, real codec selection, and probe/decode failure. These are synthetic fixtures, not claims that new HeyGen audio was generated. A separate offline run through real FFprobe/FFmpeg verified the retained historical MiniCPM MP3 (`dff3c33e…afa98f`, 58.044063 seconds) without any browser, network, generation or site mutation.
