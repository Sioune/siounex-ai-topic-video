# v28 — version-bound complete candidate receipts

Adds separate title approval, pending changed covers, candidate script hash, and complete-review narration disclosure. Adds an immutable complete-bundle file role. A complete-review requires an actual video asset and present narration. All file bytes are pinned by Library file ID, version, SHA256 and exact download readback.

The Decision job receives historical V7 and latest V8 candidate receipts without modifying its paused state, approved base V3 hash, manual review mode, attempts, rework cap, milestones, operations or drafts. V8 is a pending complete review, not quality approval or external publication. Title approval does not approve changed covers. Existing receipts remain immutable and downloadable.

V8 actual container53.821333s/video53.8s,1080×1920,1614frames; full decode and strict60second QA passed, original120outroRGBframes exact. Actual final screenshots for all3 one-line titles inspected. Actual final narration ASR reaches the last sentence. No human listening or continuous browser playback claimed. No generation or paid calls.

No database schema, migrations, access policies, runtime secrets or schedules change. Existing database state is read and compared, never imported or replaced. ZIP contains V8, both exact LibraryV3 covers, exact LibraryV3 copy, a short review-state README, and pinned asset checklist. ZIP CRC and member bytes are checked before and after download.
