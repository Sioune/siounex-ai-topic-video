# Actual V3 private draft handoff, 2026-10-11

Same owner-private project `appgprj_6ac65bafa2a48191a4283cb34ebd5e11`.
Live website: https://siounex-ai-topic-library.siounexzhao.chatgpt.site/production?job=job_6f01090e-218f-4fc9-bd1c-14984d6c1863

The real Microsoft V3 source and script were approved by the owner at 09:52:34 and 09:52:52 UTC. Revision 3, mode epoch 0, human node mode and script hash `68801fc0af2d8133be98107d4b71fb61f5da55d0cd27419d63088a4a0e6d25fb` remain unchanged. No further script or voice generation has been performed. The protected Claude task was not modified.

## Real artifacts and honest quality limits

The actual draft MP4 was completed at 10:31:26 UTC and technical verification at 10:32:59 UTC. It is 1080x1920, 1998 frames, 66.621333 container seconds, with audio present and full decode passing. The core opening has 90 consecutive frames from the official source at 11.3-14.3 seconds; all 120 decoded original outro frames match. Audio peak is -5 dBFS. No added music or original English demo audio is mixed into the narration. Narration is temporary ordinary Windows Huihui, not the owner's cloned voice.

[Video](https://chatgpt.com/api/library/files/libfile_402f59fadb548191ae503f983f9a3a81/download), [phone preview](https://chatgpt.com/api/library/files/libfile_97bcaf1b958c8191a24bcb33cbae5059/download), [original cover](https://chatgpt.com/api/library/files/libfile_eb5cc009e87c8191ae743c22bed78836/download), [promotion text](https://chatgpt.com/api/library/files/libfile_1fa3006589e48191b3617c6fb6b560c0/download), [actual provenance](https://chatgpt.com/api/library/files/libfile_ca3c170d6d4c81918969ed3319312f5b/download).

Native Library create returned real file IDs, version 0 and matching sizes for all seven initial files. Version metadata was applied to the actual local files. Provenance and promotion text were fully read back using native Library read. This task has not listened to or watched the entire file continuously; phrase-level subtitle alignment, mobile English UI readability and commercial reuse rights remain human checks. Quality approval and publication are false. The current MP4's filmstrip clock still reads 00:62.6. The shared runtime minute-format fix is tested for future renders, without changing the uploaded draft.

## Website result and pause requiring owner reconciliation

v22 was deployed at 10:30:00 UTC; all 16 live database tables were identical before and after deployment. The source/script dependency graph now permits video draft preparation while cover is pending; promotion/delivery still need both approved media nodes. A current-version-only private preview panel is bound to seven actual Library assets by review event `media_preparation_98478f1a1ab06e7190e04ff62b64e87e69599ac08de3b6611686693beabdeb60` at 10:44:05 UTC. It does not approve media or bypass formal node submission.

Video operation `op_f9dedd2a2a0bea681425b45ae06a1b8d1b9175cddd33d1fd1a7a73186dd44ffc` was queued at 10:36:18 UTC, claimed and verified actual output at 10:36:23 UTC. Cover operation `op_940ee2d7cb71c747787dc48702759510c482afb4e335196541072782a1ec9718` was queued at 10:42:38 UTC, claimed and verified at 10:42:40 UTC. Both have a genuine local-files-ready checkpoint, checkpoint version 1, and zero media fees. Windows terminal residual empty CR/LF was mistaken for an empty second JSON receipt. Both are paused with result null; formal media node callback is not complete.

v23 commit `c49ec022707357feaab2cea74ab84ce260c70f4a`, deployment `appgdep_6acb69b268f081919754781dd1ca392b`, succeeded at 10:49:29 UTC. It fixes the actual input bug by ignoring blank terminators and checking bounded input, cancellation and EOF. The regression passed on both Node streams and a real Windows two-prompt PTY. Framework build passed. All 16 table hashes remained identical across this deployment; no migration/restore occurred.

The exact result receipts are saved at `.sites-runtime/v22-video-operation-result.json` and `.sites-runtime/v22-cover-operation-result.json`. The cover adapter produced a real re-encoded 900x1200 PNG: SHA256 `5f5a529729dc809d40bce31f8cd3e50eee8e9a12920e184375d71386e63fc806`, 82957 bytes, archived as [actual operation cover](https://chatgpt.com/api/library/files/libfile_de6df3ce2c7c81919ce7c62ac1c97c6f/download), with native version metadata applied. It is not mislabeled as the original cover bytes.

Recovery is intentionally owner-only in `resolveOperation`. In the original task's operation section, the signed-in owner must enter a reason and select **核对后仅续传回执恢复领取** for each operation, with checkpoint version 1. The verified receipt allows safe resume without rendering again. Then start the finite media executor once for each exact operation with `operation_id` and `result_file`, passing the existing service token only through hidden stdin. That path bypasses `renderOperation` and reports the exact saved result. A repeated completed operation reuses its saved state. Do not create a new operation, regenerate media, switch this task's mode or impersonate the owner via service access.

Browser automation on this host failed at platform initialization. Thus this turn cannot perform the signed-in owner recovery action. Do not claim the formal nodes are awaiting human approval until the recovered operation callback is read back. No automatic wake, daemon, persistent credential, schedule, security setting, public sharing or external publication was installed.

Recovery backups are ignored local-only JSON in `.sites-runtime/production-backups`; use code rollback without restoring a stale production database. Keep v22 and v23 available as native versions. The current protected Claude task and its historical rows were preserved.
