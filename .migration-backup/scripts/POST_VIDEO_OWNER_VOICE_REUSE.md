# Owner voice replacement: continue the existing complete package

The ordinary first review and the new owner voice candidate are separate video identities. A replacement must return its actual video and editable project, prepare a new package for that new SHA, and wait for the owner's second review. It must not inherit ordinary-video warehouse approval.

The post-video consumer locates exact ordinary `private-review/<hash>/producer-receipt.json` or owner-clone `.sites-runtime/automatic-clone-renders/<hash>/producer-receipt.json` inputs. It verifies the source receipt, current clone request and actual video/project bytes before any cover operation. A missing exact project therefore stops before an image generation call.

An owner voice replacement does not itself require different cover pixels. `post-video-preparation.ts` may bind `cover_request.reuse_source` only when `automaticCloneProof` establishes this job's actual first owner approval and cloned return, and a prior prepared plan matches the same job and current approved script/revision/epoch/contract/private scope/source/skill. A newer ordinary layout or outro version may have intervened before the first approval: the original generation video's source SHA and the actual first-review base SHA remain separate. Among eligible originals no newer than the first-reviewed version, the latest prepared candidate is selected deterministically. It verifies the original dual AIGC receipt and both confirmed PNG archive identities. The prior plan and archives are frozen into the current preparation guard. A preexisting queued, unstarted new plan can adopt this binding once; a staged package is not silently replaced.

`post-video-reused-covers.mjs` reads and hashes those original files, or materializes the same original PNGs through normal `site_archive_read_part` readback. It does not call image generation. Missing originals stay a specific recoverable wait. It copies unchanged bytes into the new request directory and emits a new package receipt with explicit reuse lineage.

Original `host_artifact.request_id`, original video SHA, generated timestamp, prompt and source provenance stay unchanged. They describe the original generation. Only the outer preparation/package binding points to the current cloned video. The nested source request and receipt make that distinction inspectable. The contract rejects relabeled generation evidence, changed pixels, cross-script reuse or an unregistered reuse claim. This does not grant image quality approval; the current whole package still requires owner review.

Regression coverage:

- `tests/automatic-clone.test.mjs`: real migrated SQLite and in-memory R2, both auto/node first review → clone → reuse original dual covers → new package → second approval; unchanged original host provenance, wrong pixels/request, source archive changes and existing queued plan recovery.
- `tests/post-video-reused-covers.test.mjs`: local original bytes, regular archive readback recovery, no generation fallback, changed proof/bytes and cross-version rejection.
- `tests/post-video-preparation-consumer.test.mjs`: exact clone-render source lookup and source verification before any cover call.
- `tests/post-video-assets.test.mjs`: existing real PNG decoding and complete ZIP readback; no source-image composition.

All automated fixtures remain synthetic. These tests do not assert that a live owner's second review occurred or that a live package is complete.
